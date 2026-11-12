import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import mongoose from 'mongoose'
import { Design, PartnerProfile, Property } from '../models.js'

function bucket() {
  if (!mongoose.connection.db) throw new Error('Media storage is unavailable until MongoDB connects.')
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'media' })
}

export async function storeMedia(file, ownerId, purpose) {
  const destination = bucket().openUploadStream(file.originalname, {
    contentType: file.mimetype,
    metadata: { ownerId: String(ownerId), purpose }
  })
  await pipeline(createReadStream(file.path), destination)
  return destination.id
}

export async function storeMediaBuffer(buffer, { filename, contentType }, ownerId, purpose) {
  const destination = bucket().openUploadStream(filename, {
    contentType,
    metadata: { ownerId: String(ownerId), purpose }
  })
  await pipeline(Readable.from([buffer]), destination)
  return destination.id
}

export async function deleteMedia(mediaId) {
  if (!mediaId || !mongoose.Types.ObjectId.isValid(String(mediaId))) return
  const mediaBucket = bucket()
  const exists = await mongoose.connection.db.collection('media.files')
    .findOne({ _id: new mongoose.Types.ObjectId(String(mediaId)) }, { projection: { _id: 1 } })
  if (exists) await mediaBucket.delete(new mongoose.Types.ObjectId(String(mediaId)))
}

export async function streamMedia(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ error: { message: 'Media not found.' } })
  }
  const mediaId = new mongoose.Types.ObjectId(req.params.id)
  const reference = { $or: [
    { images: mediaId },
    { videos: mediaId },
    { profilePhoto: mediaId },
    { companyLogo: mediaId },
    { visitingCard: mediaId },
    { certifications: mediaId },
    { 'portfolio.mediaId': mediaId }
  ] }
  const ownerFilter = req.user ? { ownerId: req.user._id } : null
  const partnerOwnerFilter = req.user ? { userId: req.user._id } : null
  const propertyAccess = [{ status: 'PUBLISHED' }, ...(ownerFilter ? [ownerFilter] : [])]
  const partnerAccess = [{ isPublished: true }, ...(partnerOwnerFilter ? [partnerOwnerFilter] : [])]

  const [property, partner, design] = await Promise.all([
    Property.exists({ $and: [reference, { $or: propertyAccess }] }),
    PartnerProfile.exists({ $and: [reference, { $or: partnerAccess }] }),
    req.user
      ? Design.exists({
          customerId: req.user._id,
          $or: [{ originalImageId: mediaId }, { generatedImageId: mediaId }]
        })
      : null
  ])
  if (!property && !partner && !design) {
    return res.status(404).json({ error: { message: 'Media not found.' } })
  }

  const file = await mongoose.connection.db.collection('media.files')
    .findOne({ _id: mediaId }, { projection: { contentType: 1, length: 1 } })
  if (!file) return res.status(404).json({ error: { message: 'Media not found.' } })
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream')
  res.setHeader('Content-Length', file.length)
  res.setHeader('Cache-Control', property || partner ? 'public, max-age=3600' : 'private, no-store')
  const source = bucket().openDownloadStream(mediaId)
  source.on('error', (error) => {
    if (!res.headersSent) next(error)
    else res.destroy(error)
  })
  source.pipe(res)
}

export function mediaUrl(mediaId) {
  return `/api/media/${mediaId}`
}
