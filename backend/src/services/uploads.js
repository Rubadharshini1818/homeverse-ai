import { mkdir, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import multer from 'multer'

const uploadDirectory = path.join(os.tmpdir(), 'homeverseai-uploads')
await mkdir(uploadDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_req, _file, callback) => callback(null, randomUUID())
})

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 24 },
  fileFilter: (_req, file, callback) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime']
    const allowed = imageTypes.includes(file.mimetype)
      || videoTypes.includes(file.mimetype)
      || (['visitingCard', 'certifications'].includes(file.fieldname) && file.mimetype === 'application/pdf')
    if (!allowed) {
      const error = new Error('Only supported image, video, or visiting card PDF files are accepted.')
      error.status = 400
      return callback(error)
    }
    return callback(null, true)
  }
})

export function removeTempUploads(req, res, next) {
  const files = [
    ...(req.files ? Object.values(req.files).flat() : []),
    ...(req.file ? [req.file] : [])
  ]
  res.once('finish', () => {
    for (const file of files) {
      unlink(file.path).catch((error) => {
        if (error.code !== 'ENOENT') console.error('Could not remove temporary upload:', error.message)
      })
    }
  })
  next()
}

export function validateMediaType(file, expected, maxSizeMb = 15) {
  if (!file) return
  const allowedTypes = expected === 'image'
    ? ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    : expected === 'video'
      ? ['video/mp4', 'video/webm', 'video/quicktime']
      : ['application/pdf']
  if (!allowedTypes.includes(file.mimetype)) {
    const error = new Error(`The uploaded file must be ${expected === 'image' ? 'a JPEG, PNG, WebP, or AVIF image' : expected === 'video' ? 'an MP4, WebM, or QuickTime video' : 'a PDF document'}.`)
    error.status = 400
    throw error
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    const error = new Error(`The uploaded file must be ${maxSizeMb} MB or smaller.`)
    error.status = 413
    throw error
  }
}

export function validatePartnerUploads(req) {
  const files = Object.values(req.files || {}).flat()
  for (const file of files) {
    const expected = file.fieldname === 'portfolioVideos'
      ? 'video'
      : ['visitingCard', 'certifications'].includes(file.fieldname) && file.mimetype === 'application/pdf'
        ? 'document'
        : 'image'
    validateMediaType(file, expected, expected === 'video' ? 25 : 15)
  }
}
