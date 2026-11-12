import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, formatRupees, jsonBody } from '../services/api'
import { useAuth } from '../services/authContext.js'

export default function PropertyDetails() {
  const { id } = useParams()
  const { user } = useAuth()
  const viewerId = user?.role === 'CUSTOMER' ? user.id : 'public'
  const [loadedId, setLoadedId] = useState('')
  const [loadedViewerId, setLoadedViewerId] = useState('')
  const [property, setProperty] = useState(null)
  const [reviews, setReviews] = useState({ average: 0, count: 0, reviews: [] })
  const [saved, setSaved] = useState(false)
  const [type, setType] = useState('ENQUIRY')
  const [message, setMessage] = useState('')
  const [preferredAt, setPreferredAt] = useState('')
  const [rating, setRating] = useState('5')
  const [reviewComment, setReviewComment] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setError('')
      try {
        const propertyResult = await api(`/properties/${encodeURIComponent(id)}`)
        if (active) {
          setProperty(propertyResult.property)
          setType(propertyResult.property.type === 'buy' ? 'BUY' : 'ENQUIRY')
          setLoadedId(id)
          setLoadedViewerId(viewerId)
        }
        try {
          const reviewResult = await api(`/reviews?targetType=PROPERTY&targetId=${encodeURIComponent(id)}`)
          if (active) setReviews(reviewResult)
        } catch (reviewError) {
          if (active) setError(`Property loaded, but reviews are unavailable: ${reviewError.message}`)
        }
        if (user?.role === 'CUSTOMER') {
          try {
            const savedResult = await api('/saved-properties')
            if (active) setSaved(savedResult.properties.some((item) => item.id === id))
          } catch (savedError) {
            if (active) setError(`Property loaded, but saved status is unavailable: ${savedError.message}`)
          }
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
          setProperty(null)
          setLoadedId(id)
          setLoadedViewerId(viewerId)
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [id, viewerId, user?.id, user?.role])

  async function submitEnquiry(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api(`/enquiries/properties/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: jsonBody({ type, message, preferredAt: type === 'VISIT' ? new Date(preferredAt).toISOString() : undefined })
      })
      setMessage('')
      setPreferredAt('')
      setNotice(type === 'VISIT' ? 'Your property visit request was sent to the owner.' : 'Your enquiry was sent to the owner.')
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  async function toggleSaved() {
    setError('')
    try {
      if (saved) {
        await api(`/saved-properties/${encodeURIComponent(id)}`, { method: 'DELETE' })
        setSaved(false)
      } else {
        await api(`/saved-properties/${encodeURIComponent(id)}`, { method: 'POST' })
        setSaved(true)
      }
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  async function submitReview(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/reviews', {
        method: 'POST',
        body: jsonBody({ targetType: 'PROPERTY', targetId: id, rating: Number(rating), comment: reviewComment })
      })
      setReviewComment('')
      const result = await api(`/reviews?targetType=PROPERTY&targetId=${encodeURIComponent(id)}`)
      setReviews(result)
      setNotice('Your review has been published.')
    } catch (reviewError) {
      setError(reviewError.message)
    }
  }

  if (loading || loadedId !== id || loadedViewerId !== viewerId) return <main className="wrap simple-page"><p>Loading property details…</p></main>
  if (error && !property) return <main className="wrap simple-page"><h1>Property unavailable</h1><p className="form-error" role="alert">{error}</p><Link className="button primary" to="/properties">Back to properties</Link></main>
  if (!property) return <main className="wrap simple-page"><h1>Property unavailable</h1><Link className="button primary" to="/properties">Back to properties</Link></main>

  return <main className="wrap details">
    <span className="eyebrow">{property.type} · {property.location}</span><h1>{property.title}</h1>
    <strong className="price">{formatRupees(property.price)}{property.type === 'rent' ? ' / month' : ''}</strong>
    {user?.role === 'CUSTOMER' && <button className="button" type="button" onClick={toggleSaved}>{saved ? 'Remove from saved properties' : 'Save property'}</button>}
    <div className="property-gallery">{property.images.length
      ? property.images.map((image, index) => <img className="detail-image" key={image} src={image} alt={`${property.title} ${index + 1}`} />)
      : <div className="image-empty">No property photographs uploaded</div>}</div>
    {property.videos.length > 0 && <section className="content"><h2>Home tour</h2><div className="video-gallery">{property.videos.map((video) => <video key={video} controls preload="metadata" src={video}>Your browser does not support video playback.</video>)}</div></section>}
    <p>{property.description}</p><h2>Property details</h2>
    <p>{[property.propertyType, property.area, property.beds, property.baths].filter(Boolean).join(' · ')}</p>
    {property.amenities.length > 0 && <><h3>Amenities</h3><p>{property.amenities.join(' · ')}</p></>}
    <aside className="panel"><h2>Owner information</h2><p>{property.owner?.fullName}{property.owner?.companyName ? ` · ${property.owner.companyName}` : ''}</p>
      {user?.role === 'CUSTOMER' && property.owner?.phone && <p>Phone: <a href={`tel:${property.owner.phone}`}>{property.owner.phone}</a></p>}
      {user?.role === 'CUSTOMER' && property.owner?.email && <p>Email: <a href={`mailto:${property.owner.email}`}>{property.owner.email}</a></p>}
      {user?.role === 'CUSTOMER' ? <form className="form-grid" onSubmit={submitEnquiry}>
        <label>How can the owner help?<select value={type} onChange={(event) => setType(event.target.value)}><option value={property.type === 'buy' ? 'BUY' : 'ENQUIRY'}>{property.type === 'buy' ? 'Enquire to buy this property' : 'Ask about this property'}</option><option value="CONTACT">Request owner contact</option><option value="VISIT">Request a property visit</option></select></label>
        {type === 'VISIT' && <label>Preferred visit time<input required type="datetime-local" value={preferredAt} onChange={(event) => setPreferredAt(event.target.value)} /></label>}
        <label className="full">Message<textarea required minLength="3" maxLength="2000" rows="4" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <button className="button primary" type="submit">{type === 'VISIT' ? 'Request a visit' : type === 'BUY' ? 'Send buying enquiry' : 'Send enquiry'}</button>
      </form> : <p><Link to="/login" state={{ from: `/properties/${id}` }}>Sign in as a customer to contact the owner or request a visit.</Link></p>}
    </aside>
    {notice && <p className="form-success" role="status">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="content"><h2>Reviews and ratings</h2><p>{reviews.average} / 5 · {reviews.count} review{reviews.count === 1 ? '' : 's'}</p>
      {reviews.reviews.map((review) => <article className="panel review" key={review.id}><strong>{review.customerName} · {review.rating} / 5</strong><p>{review.comment}</p></article>)}
      {user?.role === 'CUSTOMER' && <form className="panel form-grid" onSubmit={submitReview}>
        <label>Rating<select value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label className="full">Review<textarea rows="3" maxLength="2000" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} /></label>
        <button className="button" type="submit">Submit review</button>
      </form>}
    </section>
  </main>
}
