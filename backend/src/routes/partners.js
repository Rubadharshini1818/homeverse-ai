import { Router } from 'express'
import mongoose from 'mongoose'
import { allowRoles, authenticate, optionalAuthentication } from '../middleware/auth.js'
import { PartnerProfile, Review, ServiceRequest, User } from '../models.js'
import { deleteMedia, mediaUrl, storeMedia } from '../services/media.js'
import { removeTempUploads, upload, validateMediaType, validatePartnerUploads } from '../services/uploads.js'
import { httpError } from '../utils.js'

const router = Router()
const homecareCategories = [
  'Electrician', 'Plumber', 'Carpenter', 'Painter', 'Cleaning Service',
  'AC Service', 'Appliance Repair', 'Pest Control', 'Other Home Services'
]
const partnerUploads = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'companyLogo', maxCount: 1 },
  { name: 'visitingCard', maxCount: 1 },
  { name: 'certifications', maxCount: 10 },
  { name: 'portfolioImages', maxCount: 10 },
  { name: 'portfolioVideos', maxCount: 4 }
])

function parseServices(value) {
  let services = value
  if (typeof value === 'string') {
    try {
      services = JSON.parse(value)
    } catch {
      throw httpError(400, 'Services must be valid JSON.')
    }
  }
  if (!Array.isArray(services)) throw httpError(400, 'Add at least one valid service.')
  return services.map((service) => {
    const title = String(service.title || '').trim()
    const charge = service.charge === '' || service.charge === null || service.charge === undefined
      ? null
      : Number(service.charge)
    if (!title || title.length > 120) throw httpError(400, 'Every service needs a name of up to 120 characters.')
    if (charge !== null && (!Number.isFinite(charge) || charge < 0)) throw httpError(400, `The charge for ${title} must be a non-negative number.`)
    return {
      title,
      category: String(service.category || '').trim(),
      description: String(service.description || '').trim(),
      charge,
      availability: String(service.availability || '').trim()
    }
  })
}

function publicPartner(profile, user, rating) {
  return {
    id: String(profile._id),
    userId: String(profile.userId),
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    partnerType: profile.partnerType,
    serviceCategory: profile.services?.[0]?.category || profile.services?.[0]?.title || profile.specialization,
    companyName: profile.companyName,
    experience: profile.experience,
    specialization: profile.specialization,
    about: profile.about,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    pinCode: profile.pinCode,
    profilePhoto: profile.profilePhoto ? mediaUrl(profile.profilePhoto) : '',
    companyLogo: profile.companyLogo ? mediaUrl(profile.companyLogo) : '',
    visitingCard: profile.visitingCard ? mediaUrl(profile.visitingCard) : '',
    certifications: (profile.certifications || []).map(mediaUrl),
    services: (profile.services || []).map((service) => ({
      id: String(service._id),
      title: service.title,
      category: service.category,
      description: service.description,
      charge: service.charge,
      availability: service.availability
    })),
    portfolio: (profile.portfolio || []).map((item) => ({
      id: String(item._id),
      mediaType: item.mediaType,
      caption: item.caption,
      url: mediaUrl(item.mediaId)
    })),
    verified: false,
    isPublished: profile.isPublished,
    rating,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  }
}

async function partnerRating(profileId) {
  const [result] = await Review.aggregate([
    { $match: { targetType: 'PARTNER', targetId: profileId } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ])
  return result ? { average: Number(result.average.toFixed(1)), count: result.count } : { average: 0, count: 0 }
}

router.get('/mine', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
  try {
    const profile = await PartnerProfile.findOne({ userId: req.user._id }).lean()
    if (!profile) throw httpError(404, 'Home Partner profile not found.')
    return res.json({ profile: publicPartner(profile, req.user, await partnerRating(profile._id)) })
  } catch (error) {
    return next(error)
  }
})

router.get('/mine/requests', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
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

router.put('/mine', authenticate, allowRoles('HOME_PARTNER'), partnerUploads, removeTempUploads, async (req, res, next) => {
  const newlyStored = []
  const replacedMedia = []
  let profileSaved = false
  try {
    validatePartnerUploads(req)
    const profile = await PartnerProfile.findOne({ userId: req.user._id })
    if (!profile) throw httpError(404, 'Home Partner profile not found.')
    if (req.body.partnerType !== undefined) {
      if (!['INTERIOR', 'HOMECARE'].includes(req.body.partnerType)) throw httpError(400, 'Choose Interior or HomeCare.')
      profile.partnerType = req.body.partnerType
    }
    if (req.body.companyName !== undefined) profile.companyName = req.body.companyName
    if (req.body.experience !== undefined) {
      const experience = Number(req.body.experience)
      if (!Number.isFinite(experience) || experience < 0 || experience > 100) throw httpError(400, 'Experience must be between 0 and 100 years.')
      profile.experience = experience
    }
    for (const field of ['specialization', 'about', 'address', 'city', 'state', 'pinCode']) {
      if (req.body[field] !== undefined) profile[field] = req.body[field]
    }
    if (req.body.services !== undefined) {
      profile.services = parseServices(req.body.services)
      if (profile.partnerType === 'HOMECARE' && profile.services.some((service) => !homecareCategories.includes(service.category))) {
        throw httpError(400, 'Choose a supported HomeCare service category for every service.')
      }
    }

    for (const [field, expected] of [['profilePhoto', 'image'], ['companyLogo', 'image'], ['visitingCard', 'document']]) {
      const file = req.files?.[field]?.[0]
      if (!file) continue
      const expectedType = field === 'visitingCard' && file.mimetype.startsWith('image/') ? 'image' : expected
      validateMediaType(file, expectedType, 15)
      const id = await storeMedia(file, req.user._id, `partner-${field}`)
      newlyStored.push(id)
      if (profile[field]) replacedMedia.push(profile[field])
      profile[field] = id
    }
    for (const file of req.files?.certifications || []) {
      const expected = file.mimetype === 'application/pdf' ? 'document' : 'image'
      validateMediaType(file, expected, 15)
      const id = await storeMedia(file, req.user._id, 'partner-certification')
      newlyStored.push(id)
      profile.certifications.push(id)
    }
    const portfolioImages = req.files?.portfolioImages || []
    const portfolioVideos = req.files?.portfolioVideos || []
    for (const file of [...portfolioImages, ...portfolioVideos]) {
      const mediaType = file.fieldname === 'portfolioVideos' ? 'video' : 'image'
      validateMediaType(file, mediaType, mediaType === 'video' ? 25 : 15)
      const id = await storeMedia(file, req.user._id, 'partner-portfolio')
      newlyStored.push(id)
      profile.portfolio.push({
        mediaId: id,
        mediaType,
        caption: String(req.body.portfolioCaption || '').trim()
      })
    }
    await profile.save()
    profileSaved = true
    await Promise.all(replacedMedia.map((id) => deleteMedia(id)))
    return res.json({ profile: publicPartner(profile, req.user, await partnerRating(profile._id)) })
  } catch (error) {
    if (!profileSaved) await Promise.all(newlyStored.map((id) => deleteMedia(id)))
    return next(error)
  }
})

router.patch('/mine/publish', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
  try {
    const profile = await PartnerProfile.findOne({ userId: req.user._id })
    if (!profile) throw httpError(404, 'Home Partner profile not found.')
    if (!profile.specialization.trim() || !profile.services.length) {
      throw httpError(400, 'Add a specialization and at least one service before publishing your profile.')
    }
    profile.isPublished = Boolean(req.body.publish)
    await profile.save()
    return res.json({ profile: publicPartner(profile, req.user, await partnerRating(profile._id)) })
  } catch (error) {
    return next(error)
  }
})

router.get('/', optionalAuthentication, async (req, res, next) => {
  try {
    const filter = { isPublished: true }
    const type = String(req.query.type || '').toUpperCase()
    if (type) {
      if (!['INTERIOR', 'HOMECARE'].includes(type)) throw httpError(400, 'Unknown partner category.')
      filter.partnerType = type
    }
    for (const field of ['city', 'state']) {
      const value = String(req.query[field] || '').trim()
      if (value) filter[field] = { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    }
    const category = String(req.query.category || '').trim()
    if (category) filter['services.category'] = { $regex: category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const profiles = await PartnerProfile.find(filter).sort({ createdAt: -1 }).limit(100).lean()
    const userIds = profiles.map((profile) => profile.userId)
    const users = await User.find({ _id: { $in: userIds } }).select('fullName email phone').lean()
    const userMap = new Map(users.map((user) => [String(user._id), user]))
    const partners = await Promise.all(profiles.map(async (profile) => {
      const user = userMap.get(String(profile.userId))
      const partner = publicPartner(profile, user, await partnerRating(profile._id))
      if (req.user?.role !== 'CUSTOMER') {
        delete partner.email
        delete partner.phone
      }
      return partner
    }))
    return res.json({ partners })
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', optionalAuthentication, async (req, res, next) => {
  try {
    const id = req.params.id
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? { _id: id, isPublished: true }
      : null
    if (!filter) throw httpError(404, 'Home Partner not found.')
    const profile = await PartnerProfile.findOne(filter).lean()
    if (!profile) throw httpError(404, 'Home Partner not found.')
    const user = await User.findById(profile.userId).select('fullName email phone').lean()
    if (!user) throw httpError(404, 'Home Partner not found.')
    const result = publicPartner(profile, user, await partnerRating(profile._id))
    if (req.user?.role !== 'CUSTOMER') {
      delete result.email
      delete result.phone
    }
    return res.json({ profile: result })
  } catch (error) {
    return next(error)
  }
})

router.delete('/mine/portfolio/:mediaId', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.mediaId)) throw httpError(404, 'Portfolio item not found.')
    const profile = await PartnerProfile.findOne({ userId: req.user._id })
    if (!profile) throw httpError(404, 'Home Partner profile not found.')
    const item = profile.portfolio.find((entry) => String(entry.mediaId) === req.params.mediaId)
    if (!item) throw httpError(404, 'Portfolio item not found.')
    profile.portfolio = profile.portfolio.filter((entry) => String(entry.mediaId) !== req.params.mediaId)
    await profile.save()
    await deleteMedia(item.mediaId)
    return res.json({ message: 'Portfolio item deleted.' })
  } catch (error) {
    return next(error)
  }
})

router.delete('/mine/certifications/:mediaId', authenticate, allowRoles('HOME_PARTNER'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.mediaId)) throw httpError(404, 'Certification not found.')
    const profile = await PartnerProfile.findOne({ userId: req.user._id })
    if (!profile || !profile.certifications.some((id) => String(id) === req.params.mediaId)) {
      throw httpError(404, 'Certification not found.')
    }
    profile.certifications = profile.certifications.filter((id) => String(id) !== req.params.mediaId)
    await profile.save()
    await deleteMedia(req.params.mediaId)
    return res.json({ message: 'Certification deleted.' })
  } catch (error) {
    return next(error)
  }
})

export default router
