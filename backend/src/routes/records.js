import { Router } from 'express'
import mongoose from 'mongoose'
import { rateLimit } from 'express-rate-limit'
import { allowRoles, authenticate } from '../middleware/auth.js'
import {
  ContactMessage,
  Enquiry,
  PartnerProfile,
  Property,
  Review,
  SavedProperty,
  ServiceRequest
} from '../models.js'
import { httpError, parseOptionalDate } from '../utils.js'

const router = Router()
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many messages were submitted. Try again later.' } }
})

router.post('/contact', contactLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim().toLowerCase()
    const message = String(req.body.message || '').trim()
    if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || message.length < 5 || message.length > 4000) {
      throw httpError(400, 'Enter a valid name, email address, and message.')
    }
    const saved = await ContactMessage.create({ name, email, message })
    return res.status(201).json({ id: String(saved._id), message: 'Your message has been received.' })
  } catch (error) {
    return next(error)
  }
})

router.post('/enquiries/properties/:propertyId', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.propertyId)) throw httpError(404, 'Property not found.')
    const property = await Property.findOne({ _id: req.params.propertyId, status: 'PUBLISHED' }).select('_id').lean()
    if (!property) throw httpError(404, 'Property not found.')
    const type = String(req.body.type || 'ENQUIRY').toUpperCase()
    const message = String(req.body.message || '').trim()
    if (!['ENQUIRY', 'CONTACT', 'VISIT', 'BUY'].includes(type)) throw httpError(400, 'Choose a valid enquiry type.')
    if (message.length < 3 || message.length > 2000) throw httpError(400, 'Message must be between 3 and 2,000 characters.')
    const enquiry = await Enquiry.create({
      propertyId: property._id,
      customerId: req.user._id,
      type,
      message,
      preferredAt: parseOptionalDate(req.body.preferredAt, 'Visit date')
    })
    return res.status(201).json({ enquiry: {
      id: String(enquiry._id),
      propertyId: String(enquiry.propertyId),
      type: enquiry.type,
      message: enquiry.message,
      status: enquiry.status,
      createdAt: enquiry.createdAt
    } })
  } catch (error) {
    return next(error)
  }
})

router.get('/enquiries/mine', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    const enquiries = await Enquiry.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('propertyId', 'title type price location')
      .lean()
    return res.json({ enquiries: enquiries.map((enquiry) => ({
      id: String(enquiry._id),
      property: enquiry.propertyId ? {
        id: String(enquiry.propertyId._id),
        title: enquiry.propertyId.title,
        type: enquiry.propertyId.type,
        price: enquiry.propertyId.price,
        location: enquiry.propertyId.location
      } : null,
      type: enquiry.type,
      message: enquiry.message,
      preferredAt: enquiry.preferredAt,
      status: enquiry.status,
      createdAt: enquiry.createdAt
    })) })
  } catch (error) {
    return next(error)
  }
})

router.get('/enquiries/owner', authenticate, allowRoles('PROPERTY_OWNER'), async (req, res, next) => {
  try {
    const owned = await Property.find({ ownerId: req.user._id }).select('_id title').lean()
    const enquiries = await Enquiry.find({ propertyId: { $in: owned.map((property) => property._id) } })
      .sort({ createdAt: -1 })
      .populate('propertyId', 'title')
      .populate('customerId', 'fullName email phone')
      .lean()
    return res.json({ enquiries: enquiries.map((enquiry) => ({
      id: String(enquiry._id),
      property: enquiry.propertyId,
      customer: enquiry.customerId,
      type: enquiry.type,
      message: enquiry.message,
      preferredAt: enquiry.preferredAt,
      status: enquiry.status,
      createdAt: enquiry.createdAt
    })) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/enquiries/:id', authenticate, allowRoles('PROPERTY_OWNER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Enquiry not found.')
    const status = String(req.body.status || '').toUpperCase()
    if (!['CONTACTED', 'CLOSED'].includes(status)) throw httpError(400, 'Choose Contacted or Closed.')
    const enquiry = await Enquiry.findById(req.params.id)
    if (!enquiry) throw httpError(404, 'Enquiry not found.')
    const ownsProperty = await Property.exists({ _id: enquiry.propertyId, ownerId: req.user._id })
    if (!ownsProperty) throw httpError(404, 'Enquiry not found.')
    enquiry.status = status
    await enquiry.save()
    return res.json({ id: String(enquiry._id), status: enquiry.status })
  } catch (error) {
    return next(error)
  }
})

router.post('/service-requests/partners/:partnerId', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.partnerId)) throw httpError(404, 'Home Partner not found.')
    const profile = await PartnerProfile.findOne({ _id: req.params.partnerId, isPublished: true })
    if (!profile) throw httpError(404, 'Home Partner not found.')
    const message = String(req.body.message || '').trim()
    if (message.length < 3 || message.length > 2000) throw httpError(400, 'Request details must be between 3 and 2,000 characters.')
    let service = null
    if (req.body.serviceId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.serviceId)) throw httpError(400, 'Choose a valid service.')
      service = profile.services.id(req.body.serviceId)
      if (!service) throw httpError(400, 'That service is no longer available.')
    }
    const category = String(service?.category || service?.title || profile.specialization).trim()
    const request = await ServiceRequest.create({
      partnerId: profile.userId,
      customerId: req.user._id,
      serviceId: service?._id || null,
      category,
      message,
      address: String(req.body.address || '').trim(),
      preferredAt: parseOptionalDate(req.body.preferredAt, 'Preferred date')
    })
    return res.status(201).json({ request: {
      id: String(request._id),
      partnerId: String(profile._id),
      category: request.category,
      message: request.message,
      status: request.status,
      createdAt: request.createdAt
    } })
  } catch (error) {
    return next(error)
  }
})

router.get('/service-requests/mine', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    const requests = await ServiceRequest.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('partnerId', 'fullName')
      .lean()
    return res.json({ requests: requests.map((request) => ({
      id: String(request._id),
      partnerName: request.partnerId?.fullName || 'Home Partner',
      category: request.category,
      message: request.message,
      address: request.address,
      preferredAt: request.preferredAt,
      status: request.status,
      createdAt: request.createdAt
    })) })
  } catch (error) {
    return next(error)
  }
})

router.get('/service-requests/partner', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
  try {
    const requests = await ServiceRequest.find({ partnerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('customerId', 'fullName email phone')
      .lean()
    return res.json({ requests: requests.map((request) => ({
      id: String(request._id),
      customer: request.customerId,
      category: request.category,
      message: request.message,
      address: request.address,
      preferredAt: request.preferredAt,
      status: request.status,
      createdAt: request.createdAt
    })) })
  } catch (error) {
    return next(error)
  }
})

router.patch('/service-requests/:id', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw httpError(404, 'Service request not found.')
    const status = String(req.body.status || '').toUpperCase()
    if (!['ACCEPTED', 'COMPLETED', 'CANCELLED'].includes(status)) throw httpError(400, 'Choose a valid request status.')
    const request = await ServiceRequest.findOne({ _id: req.params.id, partnerId: req.user._id })
    if (!request) throw httpError(404, 'Service request not found.')
    request.status = status
    await request.save()
    return res.json({ id: String(request._id), status: request.status })
  } catch (error) {
    return next(error)
  }
})

router.get('/saved-properties', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    const saved = await SavedProperty.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: 'propertyId', match: { status: 'PUBLISHED' }, populate: { path: 'ownerId', select: 'fullName' } })
      .lean()
    return res.json({ properties: saved.filter((entry) => entry.propertyId).map((entry) => ({
      id: String(entry.propertyId._id),
      title: entry.propertyId.title,
      type: entry.propertyId.type,
      price: entry.propertyId.price,
      city: entry.propertyId.location.city,
      location: [entry.propertyId.location.area, entry.propertyId.location.city].filter(Boolean).join(', '),
      image: entry.propertyId.images[0] ? `/api/media/${entry.propertyId.images[0]}` : ''
    })) })
  } catch (error) {
    return next(error)
  }
})

router.post('/saved-properties/:propertyId', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.propertyId)) throw httpError(404, 'Property not found.')
    const property = await Property.findOne({ _id: req.params.propertyId, status: 'PUBLISHED' }).select('_id').lean()
    if (!property) throw httpError(404, 'Property not found.')
    await SavedProperty.updateOne(
      { customerId: req.user._id, propertyId: property._id },
      { $setOnInsert: { customerId: req.user._id, propertyId: property._id } },
      { upsert: true }
    )
    return res.status(201).json({ message: 'Property saved.' })
  } catch (error) {
    if (error.code === 11000) return res.json({ message: 'Property already saved.' })
    return next(error)
  }
})

router.delete('/saved-properties/:propertyId', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    await SavedProperty.deleteOne({ customerId: req.user._id, propertyId: req.params.propertyId })
    return res.json({ message: 'Saved property removed.' })
  } catch (error) {
    return next(error)
  }
})

router.get('/reviews', async (req, res, next) => {
  try {
    const targetType = String(req.query.targetType || '').toUpperCase()
    const targetId = String(req.query.targetId || '')
    if (!['PROPERTY', 'PARTNER'].includes(targetType) || !mongoose.Types.ObjectId.isValid(targetId)) {
      throw httpError(400, 'A valid review target is required.')
    }
    const reviews = await Review.find({ targetType, targetId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('customerId', 'fullName')
      .lean()
    const average = reviews.length
      ? Number((reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1))
      : 0
    return res.json({ average, count: reviews.length, reviews: reviews.map((review) => ({
      id: String(review._id),
      customerName: review.customerId?.fullName || 'Customer',
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt
    })) })
  } catch (error) {
    return next(error)
  }
})

router.post('/reviews', authenticate, allowRoles('CUSTOMER'), async (req, res, next) => {
  try {
    const targetType = String(req.body.targetType || '').toUpperCase()
    const targetId = String(req.body.targetId || '')
    const rating = Number(req.body.rating)
    if (!['PROPERTY', 'PARTNER'].includes(targetType) || !mongoose.Types.ObjectId.isValid(targetId)) {
      throw httpError(400, 'A valid review target is required.')
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Rating must be between 1 and 5.')
    if (targetType === 'PROPERTY') {
      const property = await Property.findOne({ _id: targetId, status: 'PUBLISHED' }).select('_id').lean()
      if (!property || !await Enquiry.exists({ propertyId: targetId, customerId: req.user._id })) {
        throw httpError(403, 'You can review a property after enquiring about it.')
      }
    } else {
      const profile = await PartnerProfile.findOne({ _id: targetId, isPublished: true }).select('userId').lean()
      if (!profile || !await ServiceRequest.exists({ partnerId: profile.userId, customerId: req.user._id })) {
        throw httpError(403, 'You can review a Home Partner after requesting a service.')
      }
    }
    const review = await Review.create({
      targetType,
      targetId,
      customerId: req.user._id,
      rating,
      comment: String(req.body.comment || '').trim()
    })
    return res.status(201).json({ id: String(review._id), rating: review.rating })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: { message: 'You have already reviewed this listing.' } })
    return next(error)
  }
})

export default router
