import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, formatRupees, jsonBody } from '../services/api'
import { useAuth } from '../services/authContext.js'

export default function ProviderProfile() {
  const { id } = useParams()
  const { user } = useAuth()
  const viewerId = user?.role === 'CUSTOMER' ? user.id : 'public'
  const [loadedId, setLoadedId] = useState('')
  const [loadedViewerId, setLoadedViewerId] = useState('')
  const [partner, setPartner] = useState(null)
  const [reviews, setReviews] = useState({ average: 0, count: 0, reviews: [] })
  const [serviceId, setServiceId] = useState('')
  const [message, setMessage] = useState('')
  const [address, setAddress] = useState('')
  const [preferredAt, setPreferredAt] = useState('')
  const [rating, setRating] = useState('5')
  const [reviewComment, setReviewComment] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setError('')
      try {
        const profileResult = await api(`/partners/${encodeURIComponent(id)}`)
        if (active) {
          setPartner(profileResult.profile)
          setLoadedId(id)
          setLoadedViewerId(viewerId)
        }
        try {
          const reviewResult = await api(`/reviews?targetType=PARTNER&targetId=${encodeURIComponent(id)}`)
          if (active) setReviews(reviewResult)
        } catch (reviewError) {
          if (active) setError(`Profile loaded, but reviews are unavailable: ${reviewError.message}`)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
          setPartner(null)
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

  async function requestService(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api(`/service-requests/partners/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: jsonBody({ serviceId: serviceId || undefined, message, address, preferredAt: preferredAt ? new Date(preferredAt).toISOString() : undefined })
      })
      setMessage('')
      setNotice('Your service request was sent to the Home Partner.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function submitReview(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/reviews', {
        method: 'POST',
        body: jsonBody({ targetType: 'PARTNER', targetId: id, rating: Number(rating), comment: reviewComment })
      })
      const result = await api(`/reviews?targetType=PARTNER&targetId=${encodeURIComponent(id)}`)
      setReviews(result)
      setReviewComment('')
      setNotice('Your review has been published.')
    } catch (reviewError) {
      setError(reviewError.message)
    }
  }

  if (loading || loadedId !== id || loadedViewerId !== viewerId) return <main className="wrap simple-page"><p>Loading Home Partner profile…</p></main>
  if (!partner) return <main className="wrap simple-page"><h1>Home Partner unavailable</h1><p className="form-error" role="alert">{error || 'No published profile was found.'}</p><Link to="/homecare">Back to HomeCare</Link></main>

  return <main className="wrap simple-page">
    <span className="eyebrow">{partner.partnerType === 'INTERIOR' ? 'INTERIOR DESIGN PARTNER' : 'HOMECARE PARTNER'}</span>
    {partner.profilePhoto && <img className="partner-photo" src={partner.profilePhoto} alt={partner.fullName} />}
    {partner.companyLogo && <img className="partner-logo" src={partner.companyLogo} alt={`${partner.companyName || partner.fullName} logo`} />}
    <h1>{partner.fullName}</h1><p className="muted">{partner.companyName} · {partner.specialization}</p>
    <p>{partner.experience} years of experience · {[partner.city, partner.state, partner.pinCode].filter(Boolean).join(', ')}</p>
    <p>{partner.about}</p>
    {user?.role === 'CUSTOMER' && partner.phone && <p>Phone: <a href={`tel:${partner.phone}`}>{partner.phone}</a></p>}
    {user?.role === 'CUSTOMER' && partner.email && <p>Email: <a href={`mailto:${partner.email}`}>{partner.email}</a></p>}
    {partner.visitingCard && <p><a href={partner.visitingCard} target="_blank" rel="noreferrer">View visiting card</a></p>}
    {partner.certifications?.length > 0 && <section><h2>Certifications</h2>{partner.certifications.map((url) => <p key={url}><a href={url} target="_blank" rel="noreferrer">View certification</a></p>)}</section>}
    <section className="content"><h2>Services</h2><div className="grid">{partner.services.map((service) => <article className="panel" key={service.id}>
      <h3>{service.title}</h3><p>{service.description}</p><p>{service.category}{service.charge !== null ? ` · ${formatRupees(service.charge)}` : ''}</p><p>{service.availability}</p>
    </article>)}</div></section>
    {partner.portfolio.length > 0 && <section className="content"><h2>Previous work</h2><div className="portfolio-grid">{partner.portfolio.map((item) => item.mediaType === 'video'
      ? <video key={item.id} controls preload="metadata" src={item.url}>Your browser does not support video playback.</video>
      : <figure key={item.id}><img src={item.url} alt={item.caption || `${partner.fullName} portfolio`} /><figcaption>{item.caption}</figcaption></figure>)}</div></section>}
    <section className="panel"><h2>Request a service</h2>{user?.role === 'CUSTOMER' ? <form className="form-grid" onSubmit={requestService}>
      <label>Service<select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">General enquiry</option>{partner.services.map((service) => <option value={service.id} key={service.id}>{service.title}</option>)}</select></label>
      <label>Preferred date (optional)<input type="datetime-local" value={preferredAt} onChange={(event) => setPreferredAt(event.target.value)} /></label>
      <label>Service address<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label className="full">Request details<textarea required minLength="3" maxLength="2000" rows="4" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
      <button className="button primary" type="submit">Send service request</button>
    </form> : <p><Link to="/login" state={{ from: `/provider/${id}` }}>Sign in as a customer to contact this Home Partner.</Link></p>}</section>
    <section className="content"><h2>Reviews and ratings</h2><p>{reviews.average} / 5 · {reviews.count} review{reviews.count === 1 ? '' : 's'}</p>
      {reviews.reviews.map((review) => <article className="panel review" key={review.id}><strong>{review.customerName} · {review.rating} / 5</strong><p>{review.comment}</p></article>)}
      {user?.role === 'CUSTOMER' && <form className="panel form-grid" onSubmit={submitReview}>
        <label>Rating<select value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label className="full">Review<textarea rows="3" maxLength="2000" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} /></label>
        <button className="button" type="submit">Submit review</button>
      </form>}
    </section>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    <Link to={partner.partnerType === 'INTERIOR' ? '/interior' : '/homecare'}>Back to {partner.partnerType === 'INTERIOR' ? 'Interior Design' : 'HomeCare'}</Link>
  </main>
}
