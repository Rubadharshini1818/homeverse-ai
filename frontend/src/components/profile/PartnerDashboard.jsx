import { useEffect, useState } from 'react'
import AccountForm from './AccountForm'
import { categories } from '../../services/data'
import { api } from '../../services/api'

function blankService() {
  return { title: '', category: '', description: '', charge: '', availability: '' }
}

export default function PartnerDashboard({ user }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    partnerType: 'INTERIOR', companyName: '', experience: '', specialization: '',
    about: '', address: '', city: '', state: '', pinCode: '', services: [blankService()]
  })
  const [requests, setRequests] = useState([])
  const [profilePhoto, setProfilePhoto] = useState(null)
  const [companyLogo, setCompanyLogo] = useState(null)
  const [visitingCard, setVisitingCard] = useState(null)
  const [certifications, setCertifications] = useState([])
  const [portfolioImages, setPortfolioImages] = useState([])
  const [portfolioVideos, setPortfolioVideos] = useState([])
  const [portfolioCaption, setPortfolioCaption] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadPartner() {
    const [profileResult, requestResult] = await Promise.all([api('/partners/mine'), api('/service-requests/partner')])
    const next = profileResult.profile
    setProfile(next)
    setRequests(requestResult.requests)
    setForm({
      partnerType: next.partnerType,
      companyName: next.companyName || '',
      experience: String(next.experience || 0),
      specialization: next.specialization || '',
      about: next.about || '',
      address: next.address || '',
      city: next.city || '',
      state: next.state || '',
      pinCode: next.pinCode || '',
      services: next.services.length ? next.services.map((service) => ({
        title: service.title,
        category: service.category || '',
        description: service.description || '',
        charge: service.charge ?? '',
        availability: service.availability || ''
      })) : [blankService()]
    })
  }

  useEffect(() => {
    let active = true
    Promise.all([api('/partners/mine'), api('/service-requests/partner')])
      .then(([profileResult, requestResult]) => {
        if (!active) return
        const next = profileResult.profile
        setProfile(next)
        setRequests(requestResult.requests)
        setForm({
          partnerType: next.partnerType,
          companyName: next.companyName || '',
          experience: String(next.experience || 0),
          specialization: next.specialization || '',
          about: next.about || '',
          address: next.address || '',
          city: next.city || '',
          state: next.state || '',
          pinCode: next.pinCode || '',
          services: next.services.length ? next.services.map((service) => ({
            title: service.title,
            category: service.category || '',
            description: service.description || '',
            charge: service.charge ?? '',
            availability: service.availability || ''
          })) : [blankService()]
        })
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [])

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  function updateService(index, field, value) {
    setForm((current) => ({
      ...current,
      services: current.services.map((service, serviceIndex) => serviceIndex === index
        ? { ...service, [field]: value }
        : service)
    }))
  }

  async function saveProfile(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    const body = new FormData()
    Object.entries(form).filter(([key]) => key !== 'services').forEach(([key, value]) => body.append(key, value))
    body.set('services', JSON.stringify(form.services))
    if (profilePhoto) body.append('profilePhoto', profilePhoto)
    if (companyLogo) body.append('companyLogo', companyLogo)
    if (visitingCard) body.append('visitingCard', visitingCard)
    certifications.forEach((file) => body.append('certifications', file))
    portfolioImages.forEach((file) => body.append('portfolioImages', file))
    portfolioVideos.forEach((file) => body.append('portfolioVideos', file))
    body.append('portfolioCaption', portfolioCaption)
    try {
      await api('/partners/mine', { method: 'PUT', body })
      await loadPartner()
      setProfilePhoto(null)
      setCompanyLogo(null)
      setVisitingCard(null)
      setCertifications([])
      setPortfolioImages([])
      setPortfolioVideos([])
      setNotice('Your Home Partner profile and services were saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function togglePublished() {
    setError('')
    setNotice('')
    try {
      const result = await api('/partners/mine/publish', {
        method: 'PATCH',
        body: JSON.stringify({ publish: !profile.isPublished })
      })
      setProfile(result.profile)
      setNotice(result.profile.isPublished ? 'Your profile is published and visible to customers.' : 'Your profile is no longer published.')
    } catch (publishError) {
      setError(publishError.message)
    }
  }

  async function updateRequest(id, status) {
    setError('')
    try {
      await api(`/service-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await loadPartner()
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  async function deletePortfolio(mediaId) {
    setError('')
    try {
      await api(`/partners/mine/portfolio/${mediaId}`, { method: 'DELETE' })
      await loadPartner()
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function deleteCertification(url) {
    setError('')
    try {
      await api(`/partners/mine/certifications/${url.split('/').pop()}`, { method: 'DELETE' })
      await loadPartner()
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  return <main className="wrap simple-page"><span className="eyebrow">HOME PARTNER DASHBOARD</span><h1>Manage your professional profile</h1><p className="muted">{user.fullName} · {user.email}</p>
    <AccountForm user={user} profileFields={[]} />
    <form className="panel form-grid" onSubmit={saveProfile}><h2 className="full">Professional profile and services</h2>
      <label>Partner type<select value={form.partnerType} onChange={update('partnerType')}><option value="INTERIOR">Interior Designer / Interior Company</option><option value="HOMECARE">HomeCare Professional / Service Company</option></select></label>
      <label>Company name<input value={form.companyName} onChange={update('companyName')} /></label>
      <label>Years of experience<input type="number" min="0" max="100" value={form.experience} onChange={update('experience')} /></label>
      <label>Specialization<input required maxLength="300" value={form.specialization} onChange={update('specialization')} /></label>
      <label className="full">About<textarea rows="4" maxLength="3000" value={form.about} onChange={update('about')} /></label>
      <label className="full">Address<input value={form.address} onChange={update('address')} /></label>
      <label>City<input value={form.city} onChange={update('city')} /></label><label>State<input value={form.state} onChange={update('state')} /></label><label>PIN code<input value={form.pinCode} onChange={update('pinCode')} /></label>
      <div className="full"><h3>Services</h3>{form.services.map((service, index) => <div className="service-editor" key={index}>
        <label>Service name<input required value={service.title} onChange={(event) => updateService(index, 'title', event.target.value)} /></label>
        <label>Category{form.partnerType === 'HOMECARE' ? <select value={service.category} onChange={(event) => updateService(index, 'category', event.target.value)}><option value="">Select category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select> : <input value={service.category} onChange={(event) => updateService(index, 'category', event.target.value)} placeholder="Interior design" />}</label>
        <label>Charge (₹)<input type="number" min="0" value={service.charge} onChange={(event) => updateService(index, 'charge', event.target.value)} /></label>
        <label>Availability<input value={service.availability} onChange={(event) => updateService(index, 'availability', event.target.value)} placeholder="Days and hours" /></label>
        <label className="full">Description<textarea rows="2" value={service.description} onChange={(event) => updateService(index, 'description', event.target.value)} /></label>
        {form.services.length > 1 && <button className="button" type="button" onClick={() => setForm((current) => ({ ...current, services: current.services.filter((_, serviceIndex) => serviceIndex !== index) }))}>Remove service</button>}
      </div>)}<button className="button" type="button" onClick={() => setForm((current) => ({ ...current, services: [...current.services, blankService()] }))}>Add another service</button></div>
      <label>Profile photograph<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setProfilePhoto(event.target.files?.[0] || null)} /></label>
      <label>Company logo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setCompanyLogo(event.target.files?.[0] || null)} /></label>
      <label>Visiting card<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" onChange={(event) => setVisitingCard(event.target.files?.[0] || null)} /></label>
      <label>Certifications<input type="file" accept="image/jpeg,image/png,image/webp,image/avif,application/pdf" multiple onChange={(event) => setCertifications(Array.from(event.target.files || []))} /></label>
      <label>Previous work photographs<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => setPortfolioImages(Array.from(event.target.files || []))} /></label>
      <label>Previous work videos<input type="file" accept="video/mp4,video/webm,video/quicktime" multiple onChange={(event) => setPortfolioVideos(Array.from(event.target.files || []))} /></label>
      <label className="full">Portfolio caption<input maxLength="200" value={portfolioCaption} onChange={(event) => setPortfolioCaption(event.target.value)} /></label>
      {profile?.portfolio?.length > 0 && <div className="full"><h3>Existing portfolio</h3><div className="portfolio-grid">{profile.portfolio.map((item) => item.mediaType === 'video'
        ? <div key={item.id}><video controls src={item.url} /><button className="button" type="button" onClick={() => deletePortfolio(item.url.split('/').pop())}>Delete</button></div>
        : <div key={item.id}><img src={item.url} alt={item.caption || 'Portfolio work'} /><button className="button" type="button" onClick={() => deletePortfolio(item.url.split('/').pop())}>Delete</button></div>)}</div></div>}
      {profile?.certifications?.length > 0 && <div className="full"><h3>Existing certifications</h3>{profile.certifications.map((url) => <p key={url}><a href={url} target="_blank" rel="noreferrer">View certification</a> <button className="button" type="button" onClick={() => deleteCertification(url)}>Delete</button></p>)}</div>}
      {error && <p className="form-error full" role="alert">{error}</p>}{notice && <p className="form-success full" role="status">{notice}</p>}
      <div className="full action-row"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save professional profile'}</button>{profile && <button className="button" type="button" onClick={togglePublished}>{profile.isPublished ? 'Unpublish profile' : 'Publish profile'}</button>}</div>
    </form>
    <section className="panel"><h2>Customer service requests</h2>{requests.length ? requests.map((request) => <article className="request-row" key={request.id}>
      <strong>{request.category} · {request.customer?.fullName}</strong><span>{request.status}</span><p>{request.message}</p>
      {request.customer?.phone && <p><a href={`tel:${request.customer.phone}`}>{request.customer.phone}</a> · <a href={`mailto:${request.customer.email}`}>{request.customer.email}</a></p>}
      {request.status === 'NEW' && <button className="button" type="button" onClick={() => updateRequest(request.id, 'ACCEPTED')}>Accept request</button>}
      {request.status === 'ACCEPTED' && <button className="button" type="button" onClick={() => updateRequest(request.id, 'COMPLETED')}>Mark complete</button>}
    </article>) : <p className="empty">No customer requests yet.</p>}</section>
  </main>
}
