import mongoose from 'mongoose'

const { Schema } = mongoose
const objectId = Schema.Types.ObjectId

const userSchema = new Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  phone: { type: String, required: true, unique: true, trim: true, maxlength: 20 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ['CUSTOMER', 'PROPERTY_OWNER', 'HOME_PARTNER'] }
}, { timestamps: true })

const sessionSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true })

const customerProfileSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true, unique: true },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  city: { type: String, trim: true, maxlength: 120, default: '' },
  state: { type: String, trim: true, maxlength: 120, default: '' },
  pinCode: { type: String, trim: true, maxlength: 12, default: '' }
}, { timestamps: true })

const ownerProfileSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true, unique: true },
  governmentId: { type: String, trim: true, maxlength: 100, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  city: { type: String, trim: true, maxlength: 120, default: '' },
  state: { type: String, trim: true, maxlength: 120, default: '' },
  pinCode: { type: String, trim: true, maxlength: 12, default: '' },
  companyName: { type: String, trim: true, maxlength: 160, default: '' }
}, { timestamps: true })

const portfolioSchema = new Schema({
  mediaId: { type: objectId, required: true },
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  caption: { type: String, trim: true, maxlength: 200, default: '' }
}, { _id: true })

const partnerServiceSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, trim: true, maxlength: 100, default: '' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  charge: { type: Number, min: 0, default: null },
  availability: { type: String, trim: true, maxlength: 200, default: '' }
}, { _id: true })

const partnerProfileSchema = new Schema({
  userId: { type: objectId, ref: 'User', required: true, unique: true },
  partnerType: { type: String, required: true, enum: ['INTERIOR', 'HOMECARE'] },
  companyName: { type: String, trim: true, maxlength: 160, default: '' },
  experience: { type: Number, min: 0, max: 100, default: 0 },
  specialization: { type: String, trim: true, maxlength: 300, default: '' },
  about: { type: String, trim: true, maxlength: 3000, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  city: { type: String, trim: true, maxlength: 120, default: '' },
  state: { type: String, trim: true, maxlength: 120, default: '' },
  pinCode: { type: String, trim: true, maxlength: 12, default: '' },
  profilePhoto: { type: objectId, default: null },
  companyLogo: { type: objectId, default: null },
  visitingCard: { type: objectId, default: null },
  certifications: { type: [objectId], default: [] },
  services: { type: [partnerServiceSchema], default: [] },
  portfolio: { type: [portfolioSchema], default: [] },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true })

const propertySchema = new Schema({
  ownerId: { type: objectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  type: { type: String, required: true, enum: ['buy', 'rent', 'land'], index: true },
  propertyType: { type: String, required: true, enum: ['home', 'shop', 'land'] },
  price: { type: Number, required: true, min: 0 },
  location: {
    address: { type: String, required: true, trim: true, maxlength: 500 },
    city: { type: String, required: true, trim: true, maxlength: 120, index: true },
    area: { type: String, trim: true, maxlength: 120, default: '' },
    pinCode: { type: String, trim: true, maxlength: 12, default: '', index: true },
    state: { type: String, trim: true, maxlength: 120, default: '' }
  },
  areaSqFt: { type: Number, min: 0, default: null },
  bedrooms: { type: Number, min: 0, default: null },
  bathrooms: { type: Number, min: 0, default: null },
  amenities: { type: [String], default: [] },
  images: { type: [objectId], default: [] },
  videos: { type: [objectId], default: [] },
  status: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT', index: true }
}, { timestamps: true })
propertySchema.index({ status: 1, type: 1, 'location.city': 1, price: 1 })

const enquirySchema = new Schema({
  propertyId: { type: objectId, ref: 'Property', required: true, index: true },
  customerId: { type: objectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['ENQUIRY', 'CONTACT', 'VISIT', 'BUY'], default: 'ENQUIRY' },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  preferredAt: { type: Date, default: null },
  status: { type: String, enum: ['NEW', 'CONTACTED', 'CLOSED'], default: 'NEW' }
}, { timestamps: true })

const serviceRequestSchema = new Schema({
  partnerId: { type: objectId, ref: 'User', required: true, index: true },
  customerId: { type: objectId, ref: 'User', required: true, index: true },
  serviceId: { type: objectId, default: null },
  category: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  preferredAt: { type: Date, default: null },
  status: { type: String, enum: ['NEW', 'ACCEPTED', 'COMPLETED', 'CANCELLED'], default: 'NEW' }
}, { timestamps: true })

const reviewSchema = new Schema({
  targetType: { type: String, required: true, enum: ['PROPERTY', 'PARTNER'] },
  targetId: { type: objectId, required: true },
  customerId: { type: objectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 2000, default: '' }
}, { timestamps: true })
reviewSchema.index({ targetType: 1, targetId: 1, customerId: 1 }, { unique: true })

const savedPropertySchema = new Schema({
  customerId: { type: objectId, ref: 'User', required: true },
  propertyId: { type: objectId, ref: 'Property', required: true }
}, { timestamps: true })
savedPropertySchema.index({ customerId: 1, propertyId: 1 }, { unique: true })

const designSchema = new Schema({
  customerId: { type: objectId, ref: 'User', required: true, index: true },
  roomType: { type: String, required: true, trim: true, maxlength: 80 },
  style: { type: String, required: true, trim: true, maxlength: 100 },
  preferences: { type: String, trim: true, maxlength: 1000, default: '' },
  originalImageId: { type: objectId, required: true },
  generatedImageId: { type: objectId, required: true },
  isSaved: { type: Boolean, default: true }
}, { timestamps: true })

const contactMessageSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  message: { type: String, required: true, trim: true, maxlength: 4000 }
}, { timestamps: true })

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema)
}

export const User = model('User', userSchema)
export const Session = model('Session', sessionSchema)
export const CustomerProfile = model('CustomerProfile', customerProfileSchema)
export const OwnerProfile = model('OwnerProfile', ownerProfileSchema)
export const PartnerProfile = model('PartnerProfile', partnerProfileSchema)
export const Property = model('Property', propertySchema)
export const Enquiry = model('Enquiry', enquirySchema)
export const ServiceRequest = model('ServiceRequest', serviceRequestSchema)
export const Review = model('Review', reviewSchema)
export const SavedProperty = model('SavedProperty', savedPropertySchema)
export const Design = model('Design', designSchema)
export const ContactMessage = model('ContactMessage', contactMessageSchema)
