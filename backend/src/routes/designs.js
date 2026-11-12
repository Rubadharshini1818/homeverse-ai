import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import mongoose from 'mongoose'
import { config } from '../config.js'
import { allowRoles, authenticate } from '../middleware/auth.js'
import { Design } from '../models.js'
import { deleteMedia, mediaUrl, storeMedia, storeMediaBuffer } from '../services/media.js'
import { removeTempUploads, upload, validateMediaType } from '../services/uploads.js'
import { httpError } from '../utils.js'

const router = Router()
const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Design generation limit reached. Try again later.' } }
})

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function replicatePrediction(imageData, prompt) {
  const endpoint = 'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.replicateApiToken}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=60'
    },
    body: JSON.stringify({ input: { input_image: imageData, prompt } }),
    signal: AbortSignal.timeout(150_000)
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(body?.detail || body?.error || 'The AI provider could not generate this design.')
    error.status = response.status === 429 ? 429 : 502
    throw error
  }
  if (!body?.id) throw httpError(502, 'The AI provider returned an invalid prediction response.')
  let prediction = body
  for (let attempt = 0; attempt < 30 && ['starting', 'processing'].includes(prediction.status); attempt += 1) {
    await delay(2000)
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(body.id)}`, {
      headers: { Authorization: `Bearer ${config.replicateApiToken}` },
      signal: AbortSignal.timeout(15_000)
    })
    prediction = await poll.json().catch(() => null)
    if (!poll.ok) throw httpError(502, 'Could not retrieve the AI design result.')
  }
  if (prediction?.status !== 'succeeded') {
    if (prediction?.status === 'failed' || prediction?.status === 'canceled') {
      throw httpError(502, prediction.error || 'The AI provider could not complete this design.')
    }
    throw httpError(504, 'AI generation timed out. Please try again.')
  }
  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
  if (typeof output !== 'string') throw httpError(502, 'The AI provider returned no generated image.')
  const outputUrl = new URL(output)
  if (outputUrl.protocol !== 'https:'
    || (outputUrl.hostname !== 'replicate.delivery' && !outputUrl.hostname.endsWith('.replicate.delivery'))) {
    throw httpError(502, 'The AI provider returned an unsafe image URL.')
  }
  const imageResponse = await fetch(outputUrl, { signal: AbortSignal.timeout(60_000) })
  if (!imageResponse.ok) throw httpError(502, 'The generated image could not be downloaded.')
  const contentType = imageResponse.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) throw httpError(502, 'The AI provider did not return an image.')
  const contentLength = Number(imageResponse.headers.get('content-length') || 0)
  if (contentLength > 25 * 1024 * 1024) throw httpError(502, 'The generated image is too large to save.')
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  if (imageBuffer.length > 25 * 1024 * 1024) throw httpError(502, 'The generated image is too large to save.')
  return { imageBuffer, contentType }
}

router.get('/', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    const designs = await Design.find({ customerId: req.user._id }).sort({ createdAt: -1 }).limit(50).lean()
    return res.json({ designs: designs.map((design) => ({
      id: String(design._id),
      roomType: design.roomType,
      style: design.style,
      preferences: design.preferences,
      originalImage: mediaUrl(design.originalImageId),
      generatedImage: mediaUrl(design.generatedImageId),
      isSaved: design.isSaved,
      createdAt: design.createdAt
    })) })
  } catch (error) {
    return next(error)
  }
})

router.post('/', authenticate, allowRoles('CUSTOMER'), generationLimiter, upload.single('roomImage'), removeTempUploads, async (req, res, next) => {
  const storedMedia = []
  try {
    if (!config.replicateApiToken) throw httpError(503, 'AI design generation is not configured. Set REPLICATE_API_TOKEN in the backend environment.')
    if (!req.file) throw httpError(400, 'Upload a room photograph first.')
    validateMediaType(req.file, 'image', 15)
    const roomType = String(req.body.roomType || '').trim()
    const style = String(req.body.style || '').trim()
    const preferences = String(req.body.preferences || '').trim()
    if (!roomType || roomType.length > 80 || !style || style.length > 100 || preferences.length > 1000) {
      throw httpError(400, 'Choose a room type and design style; preferences must be under 1,000 characters.')
    }
    const imageBuffer = await import('node:fs/promises').then(({ readFile }) => readFile(req.file.path))
    const inputImage = `data:${req.file.mimetype};base64,${imageBuffer.toString('base64')}`
    const prompt = `Redesign this existing ${roomType} in a ${style} interior design style. Preserve the room's existing structural layout and camera perspective. ${preferences ? `Respect these customer preferences: ${preferences}.` : ''} Return one photorealistic interior design image.`
    const generated = await replicatePrediction(inputImage, prompt)
    const originalImageId = await storeMedia(req.file, req.user._id, 'ai-design-original')
    storedMedia.push(originalImageId)
    const generatedImageId = await storeMediaBuffer(generated.imageBuffer, {
      filename: `homeverse-design-${Date.now()}`,
      contentType: generated.contentType
    }, req.user._id, 'ai-design-generated')
    storedMedia.push(generatedImageId)
    const design = await Design.create({
      customerId: req.user._id,
      roomType,
      style,
      preferences,
      originalImageId,
      generatedImageId
    })
    return res.status(201).json({ design: {
      id: String(design._id),
      roomType: design.roomType,
      style: design.style,
      preferences: design.preferences,
      originalImage: mediaUrl(design.originalImageId),
      generatedImage: mediaUrl(design.generatedImageId),
      isSaved: design.isSaved,
      createdAt: design.createdAt
    } })
  } catch (error) {
    await Promise.all(storedMedia.map((id) => deleteMedia(id)))
    return next(error)
  }
})

router.patch('/:id', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Design not found.')
    if (typeof req.body.isSaved !== 'boolean') throw httpError(400, 'Choose whether to save this design.')
    const design = await Design.findOneAndUpdate(
      { _id: req.params.id, customerId: req.user._id },
      { isSaved: req.body.isSaved },
      { new: true, runValidators: true }
    )
    if (!design) throw httpError(404, 'Design not found.')
    return res.json({ id: String(design._id), isSaved: design.isSaved })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Design not found.')
    const design = await Design.findOneAndDelete({ _id: req.params.id, customerId: req.user._id })
    if (!design) throw httpError(404, 'Design not found.')
    await Promise.all([deleteMedia(design.originalImageId), deleteMedia(design.generatedImageId)])
    return res.json({ message: 'Design deleted.' })
  } catch (error) {
    return next(error)
  }
})

export default router
