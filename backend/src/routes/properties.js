import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, authenticate, optionalAuthentication } from '../middleware/auth.js'
import { Enquiry, OwnerProfile, Property, Review, SavedProperty, User } from '../models.js'
import { deleteMedia, mediaUrl, storeMedia } from '../services/media.js'
import { removeTempUploads, upload, validateMediaType } from '../services/uploads.js'
import { escapeRegex, httpError, parseStringArray } from '../utils.js'

const router = Router()
const propertyUploads = upload.fields([
  { name: 'images', maxCount: 12 },
  { name: 'videos', maxCount: 4 }
])
const categories = ['buy', 'rent', 'land']

function uploaded(req, name) {
  return req.files?.[name] || []
}

function numberValue(value, label, { required = false, min = 0, max = 1_000_000_000 } = {}) {
  if ((value === undefined || value === '') && !required) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw httpError(400, `${label} must be a number between ${min} and ${max}.`)
  }
  return number
}

function propertyInput(body) {
  const location = body.location || body
  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const type = String(body.type || '').toLowerCase()
  const propertyType = String(body.propertyType || '').toLowerCase()
  const address = String(body.address ?? location.address ?? '').trim()
  const city = String(body.city ?? location.city ?? '').trim()
  if (title.length < 3 || title.length > 160) throw httpError(400, 'Title must be between 3 and 160 characters.')
  if (!description || description.length > 5000) throw httpError(400, 'A description of up to 5,000 characters is required.')
  if (!categories.includes(type)) throw httpError(400, 'Choose Buy, Rent, or Land.')
  if (!['home', 'shop', 'land'].includes(propertyType)) throw httpError(400, 'Choose Home, Shop, or Land as the property type.')
  if ((type === 'land') !== (propertyType === 'land')) throw httpError(400, 'Land listings must use the Land property type, and homes or shops must use Buy or Rent.')
  if (!address || !city) throw httpError(400, 'Property address and city are required.')
  return {
    title,
    description,
    type,
    propertyType,
    price: numberValue(body.price, 'Price', { required: true }),
    location: {
      address,
      city,
      area: String(body.area ?? location.area ?? '').trim(),
      pinCode: String(body.pinCode ?? location.pinCode ?? '').trim(),
      state: String(body.state ?? location.state ?? '').trim()
    },
    areaSqFt: numberValue(body.areaSqFt, 'Area'),
    bedrooms: numberValue(body.bedrooms, 'Bedrooms', { max: 100 }),
    bathrooms: numberValue(body.bathrooms, 'Bathrooms', { max: 100 }),
    amenities: parseStringArray(body.amenities, 'Amenities')
  }
}

function publicProperty(property, owner, rating = null) {
  const imageUrls = (property.images || []).map((id) => mediaUrl(id))
  const videoUrls = (property.videos || []).map((id) => mediaUrl(id))
  return {
    id: String(property._id),
    title: property.title,
    description: property.description,
    type: property.type,
    propertyType: property.propertyType,
    price: property.price,
    priceLabel: property.type === 'rent' ? 'Monthly rent' : 'Price',
    address: property.location.address,
    city: property.location.city,
    areaName: property.location.area,
    pinCode: property.location.pinCode,
    state: property.location.state,
    location: [property.location.area, property.location.city, property.location.state, property.location.pinCode].filter(Boolean).join(', '),
    areaSqFt: property.areaSqFt,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    beds: property.bedrooms ? `${property.bedrooms} beds` : '',
    baths: property.bathrooms ? `${property.bathrooms} baths` : '',
    area: property.areaSqFt ? `${property.areaSqFt.toLocaleString('en-IN')} sq ft` : '',
    amenities: property.amenities,
    images: imageUrls,
    imageIds: (property.images || []).map(String),
    image: imageUrls[0] || '',
    videos: videoUrls,
    videoIds: (property.videos || []).map(String),
    status: property.status,
    owner: owner ? { id: String(owner._id), fullName: owner.fullName } : null,
    rating,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt
  }
}

async function ratingsFor(ids) {
  const rows = await Review.aggregate([
    { $match: { targetType: 'PROPERTY', targetId: { $in: ids } } },
    { $group: { _id: '$targetId', average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ])
  return new Map(rows.map((row) => [String(row._id), { average: Number(row.average.toFixed(1)), count: row.count }]))
}

async function savePropertyMedia(req, property) {
  const images = uploaded(req, 'images')
  const videos = uploaded(req, 'videos')
  for (const file of images) validateMediaType(file, 'image', 15)
  for (const file of videos) validateMediaType(file, 'video', 25)
  const created = []
  try {
    for (const file of images) {
      const id = await storeMedia(file, req.user._id, 'property-image')
      property.images.push(id)
      created.push(id)
    }
    for (const file of videos) {
      const id = await storeMedia(file, req.user._id, 'property-video')
      property.videos.push(id)
      created.push(id)
    }
    await property.save()
    return created
  } catch (error) {
    await Promise.all(created.map((id) => deleteMedia(id)))
    throw error
  }
}

router.get('/', async (req, res, next) => {
  try {
    const filter = { status: 'PUBLISHED' }
    const type = String(req.query.type || '').toLowerCase()
    if (type && type !== 'all') {
      if (!categories.includes(type)) throw httpError(400, 'Unknown property category.')
      filter.type = type
    }
    const minimum = req.query.minPrice === undefined || req.query.minPrice === '' ? null : numberValue(req.query.minPrice, 'Minimum price')
    const maximum = req.query.maxPrice === undefined || req.query.maxPrice === '' ? null : numberValue(req.query.maxPrice, 'Maximum price')
    if (minimum !== null || maximum !== null) {
      if (minimum !== null && maximum !== null && minimum > maximum) throw httpError(400, 'Minimum price cannot exceed maximum price.')
      filter.price = {}
      if (minimum !== null) filter.price.$gte = minimum
      if (maximum !== null) filter.price.$lte = maximum
    }
    for (const field of ['city', 'area', 'pinCode']) {
      const value = String(req.query[field] || '').trim()
      if (value) filter[`location.${field}`] = { $regex: escapeRegex(value), $options: 'i' }
    }
    const query = String(req.query.q || '').trim()
    if (query) {
      const pattern = { $regex: escapeRegex(query), $options: 'i' }
      filter.$or = [
        { title: pattern },
        { description: pattern },
        { 'location.city': pattern },
        { 'location.area': pattern },
        { 'location.pinCode': pattern }
      ]
    }
    const properties = await Property.find(filter).sort({ createdAt: -1 }).limit(100).lean()
    const ownerIds = [...new Set(properties.map((property) => String(property.ownerId)))].map((id) => new mongoose.Types.ObjectId(id))
    const [owners, ratings] = await Promise.all([
      ownerIds.length ? User.find({ _id: { $in: ownerIds } }).select('fullName').lean() : [],
      ratingsFor(properties.map((property) => property._id))
    ])
    const ownerMap = new Map(owners.map((owner) => [String(owner._id), owner]))
    return res.json({
      properties: properties.map((property) => publicProperty(
        property,
        ownerMap.get(String(property.ownerId)),
        ratings.get(String(property._id)) || { average: 0, count: 0 }
      ))
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/mine', authenticate, allowRoles('PROPERTY_OWNER'), async (req, res, next) => {
  try {
    const properties = await Property.find({ ownerId: req.user._id }).sort({ updatedAt: -1 }).lean()
    return res.json({ properties: properties.map((property) => publicProperty(property, req.user)) })
  } catch (error) {
    return next(error)
  }
})

router.post('/', authenticate, allowRoles('PROPERTY_OWNER'), propertyUploads, removeTempUploads, async (req, res, next) => {
  let property
  try {
    const data = propertyInput(req.body)
    property = new Property({ ...data, ownerId: req.user._id })
    await savePropertyMedia(req, property)
    return res.status(201).json({ property: publicProperty(property, req.user) })
  } catch (error) {
    if (property && !property.isNew) {
      await Promise.all([...property.images, ...property.videos].map((id) => deleteMedia(id)))
      await property.deleteOne()
    }
    return next(error)
  }
})

router.get('/:id', optionalAuthentication, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Property not found.')
    const property = await Property.findOne({ _id: req.params.id, status: 'PUBLISHED' }).lean()
    if (!property) throw httpError(404, 'Property not found.')
    const owner = await User.findById(property.ownerId).select('fullName email phone').lean()
    const [rating, ownerProfile] = await Promise.all([
      ratingsFor([property._id]),
      OwnerProfile.findOne({ userId: property.ownerId }).select('companyName').lean()
    ])
    const result = publicProperty(property, owner, rating.get(String(property._id)) || { average: 0, count: 0 })
    result.owner.companyName = ownerProfile?.companyName || ''
    if (req.user?.role === 'CUSTOMER') {
      result.owner.email = owner?.email || ''
      result.owner.phone = owner?.phone || ''
    }
    return res.json({ property: result })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id', authenticate, allowRoles('PROPERTY_OWNER'), propertyUploads, removeTempUploads, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Property not found.')
    const property = await Property.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!property) throw httpError(404, 'Property not found.')
    const data = propertyInput({ ...property.toObject(), ...req.body, ...req.body.location })
    Object.assign(property, data)
    const removeImages = parseStringArray(req.body.removeImages, 'Images to remove')
    const removeVideos = parseStringArray(req.body.removeVideos, 'Videos to remove')
    const removableImages = property.images.filter((id) => removeImages.includes(String(id)))
    const removableVideos = property.videos.filter((id) => removeVideos.includes(String(id)))
    property.images = property.images.filter((id) => !removeImages.includes(String(id)))
    property.videos = property.videos.filter((id) => !removeVideos.includes(String(id)))
    await savePropertyMedia(req, property)
    await Promise.all([...removableImages, ...removableVideos].map((id) => deleteMedia(id)))
    return res.json({ property: publicProperty(property, req.user) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/:id/publish', authenticate, allowRoles('PROPERTY_OWNER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Property not found.')
    const property = await Property.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!property) throw httpError(404, 'Property not found.')
    if (property.status === 'PUBLISHED') throw httpError(409, 'This property is already published.')
    property.status = 'PUBLISHED'
    await property.save()
    return res.json({ property: publicProperty(property, req.user) })
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', authenticate, allowRoles('PROPERTY_OWNER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Property not found.')
    const property = await Property.findOne({ _id: req.params.id, ownerId: req.user._id })
    if (!property) throw httpError(404, 'Property not found.')
    const mediaIds = [...property.images, ...property.videos]
    await Promise.all([
      Enquiry.deleteMany({ propertyId: property._id }),
      SavedProperty.deleteMany({ propertyId: property._id }),
      Review.deleteMany({ targetType: 'PROPERTY', targetId: property._id }),
      property.deleteOne()
    ])
    await Promise.all(mediaIds.map((id) => deleteMedia(id)))
    return res.json({ message: 'Property deleted.' })
  } catch (error) {
    return next(error)
  }
})

export default router
