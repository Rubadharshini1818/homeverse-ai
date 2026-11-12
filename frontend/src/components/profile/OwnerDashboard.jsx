import { useEffect, useState } from 'react'
import AccountForm from './AccountForm'
import { api, formatRupees } from '../../services/api'

const emptyListing = {
  title: '', description: '', type: 'buy', propertyType: 'home', price: '',
  address: '', city: '', area: '', pinCode: '', state: '', areaSqFt: '',
  bedrooms: '', bathrooms: '', amenities: ''
}

export default function OwnerDashboard({ user }) {
  const [properties, setProperties] = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [form, setForm] = useState(emptyListing)
  const [editingId, setEditingId] = useState('')
  const [images, setImages] = useState([])
  const [videos, setVideos] = useState([])
  const [removeImages, setRemoveImages] = useState([])
  const [removeVideos, setRemoveVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadListings() {
    const [listingResult, enquiryResult] = await Promise.all([
      api('/properties/mine'),
      api('/enquiries/owner')
    ])
    setProperties(listingResult.properties)
    setEnquiries(enquiryResult.enquiries)
  }

  useEffect(() => {
    let active = true
    Promise.all([api('/properties/mine'), api('/enquiries/owner')])
      .then(([listingResult, enquiryResult]) => {
        if (active) {
          setProperties(listingResult.properties)
          setEnquiries(enquiryResult.enquiries)
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [])

  function update(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  }

  function edit(property) {
    setEditingId(property.id)
    setForm({
      title: property.title,
      description: property.description,
      type: property.type,
      propertyType: property.propertyType,
      price: String(property.price),
      address: property.address,
      city: property.city,
      area: property.areaName,
      pinCode: property.pinCode,
      state: property.state,
      areaSqFt: property.areaSqFt || '',
      bedrooms: property.bedrooms ?? '',
      bathrooms: property.bathrooms ?? '',
      amenities: property.amenities.join(', ')
    })
    setImages([])
    setVideos([])
    setRemoveImages([])
    setRemoveVideos([])
    setNotice('')
  }

  function resetForm() {
    setEditingId('')
    setForm(emptyListing)
    setImages([])
    setVideos([])
    setRemoveImages([])
    setRemoveVideos([])
  }

  async function saveProperty(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    const body = new FormData()
    Object.entries(form).forEach(([key, value]) => body.append(key, value))
    body.set('amenities', JSON.stringify(form.amenities.split(',').map((item) => item.trim()).filter(Boolean)))
    images.forEach((file) => body.append('images', file))
    videos.forEach((file) => body.append('videos', file))
    if (editingId) {
      body.set('removeImages', JSON.stringify(removeImages))
      body.set('removeVideos', JSON.stringify(removeVideos))
    }
    try {
      const result = await api(editingId ? `/properties/${editingId}` : '/properties', {
        method: editingId ? 'PATCH' : 'POST',
        body
      })
      await loadListings()
      resetForm()
      setNotice(result.property.status === 'PUBLISHED' ? 'Property changes saved.' : 'Property saved as a draft. Publish it when ready.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setLoading(false)
    }
  }

  async function publish(propertyId) {
    setError('')
    setNotice('')
    try {
      await api(`/properties/${propertyId}/publish`, { method: 'PATCH', body: JSON.stringify({}) })
      await loadListings()
      setNotice('Property published and is now available in customer search.')
    } catch (publishError) {
      setError(publishError.message)
    }
  }

  async function deleteProperty(propertyId) {
    setError('')
    setNotice('')
    try {
      await api(`/properties/${propertyId}`, { method: 'DELETE' })
      await loadListings()
      if (editingId === propertyId) resetForm()
      setNotice('Property listing deleted.')
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function updateEnquiry(id, status) {
    setError('')
    try {
      await api(`/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await loadListings()
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  return <main className="wrap simple-page"><span className="eyebrow">PROPERTY OWNER DASHBOARD</span><h1>Manage your properties</h1><p className="muted">{user.fullName} · {user.email}</p>
    <AccountForm user={user} profileFields={['governmentId', 'companyName', 'address', 'city', 'state', 'pinCode']} />
    <section className="panel"><h2>{editingId ? 'Edit property listing' : 'Add a property'}</h2><form className="form-grid" onSubmit={saveProperty}>
      <label>Property title<input required minLength="3" maxLength="160" value={form.title} onChange={update('title')} /></label>
      <label>Category<select value={form.type} onChange={(event) => {
        const type = event.target.value
        setForm((current) => ({ ...current, type, propertyType: type === 'land' ? 'land' : current.propertyType === 'land' ? 'home' : current.propertyType }))
      }}><option value="buy">Buy Property</option><option value="rent">Rent Property</option><option value="land">Land</option></select></label>
      {form.type !== 'land' && <label>Property type<select value={form.propertyType} onChange={update('propertyType')}><option value="home">Home</option><option value="shop">Shop</option></select></label>}
      <label>{form.type === 'rent' ? 'Monthly rent (₹)' : 'Price (₹)'}<input required type="number" min="0" step="1" value={form.price} onChange={update('price')} /></label>
      <label className="full">Description<textarea required maxLength="5000" rows="4" value={form.description} onChange={update('description')} /></label>
      <label className="full">Address<input required value={form.address} onChange={update('address')} /></label>
      <label>City<input required value={form.city} onChange={update('city')} /></label><label>Area<input value={form.area} onChange={update('area')} /></label>
      <label>State<input value={form.state} onChange={update('state')} /></label><label>PIN code<input value={form.pinCode} onChange={update('pinCode')} /></label>
      <label>Area (sq ft)<input type="number" min="0" value={form.areaSqFt} onChange={update('areaSqFt')} /></label>
      {form.propertyType === 'home' && <><label>Bedrooms<input type="number" min="0" value={form.bedrooms} onChange={update('bedrooms')} /></label><label>Bathrooms<input type="number" min="0" value={form.bathrooms} onChange={update('bathrooms')} /></label></>}
      <label className="full">Amenities (comma separated)<input value={form.amenities} onChange={update('amenities')} placeholder="Parking, balcony, security" /></label>
      <label className="full">Property photographs<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={(event) => setImages(Array.from(event.target.files || []))} /></label>
      <label className="full">Home-tour videos<input type="file" accept="video/mp4,video/webm,video/quicktime" multiple onChange={(event) => setVideos(Array.from(event.target.files || []))} /></label>
      {editingId && <div className="full"><strong>Existing media</strong><div className="media-remove-grid">
        {properties.find((property) => property.id === editingId)?.imageIds?.map((mediaId, index) => <label key={mediaId}><input type="checkbox" checked={removeImages.includes(mediaId)} onChange={(event) => setRemoveImages((current) => event.target.checked ? [...current, mediaId] : current.filter((id) => id !== mediaId))} /> Remove photo {index + 1}</label>)}
        {properties.find((property) => property.id === editingId)?.videoIds?.map((mediaId, index) => <label key={mediaId}><input type="checkbox" checked={removeVideos.includes(mediaId)} onChange={(event) => setRemoveVideos((current) => event.target.checked ? [...current, mediaId] : current.filter((id) => id !== mediaId))} /> Remove video {index + 1}</label>)}
      </div></div>}
      <div className="full action-row"><button className="button primary" disabled={loading}>{loading ? 'Saving…' : editingId ? 'Save changes' : 'Save as draft'}</button>{editingId && <button className="button" type="button" onClick={resetForm}>Cancel edit</button>}</div>
    </form></section>
    <section className="panel"><h2>Your property listings</h2>{properties.length ? <div className="owner-listings">{properties.map((property) => <article className="request-row" key={property.id}>
      <h3>{property.title}</h3><p>{property.type.toUpperCase()} · {property.location} · {formatRupees(property.price)} · {property.status}</p>
      <div className="action-row"><button className="button" type="button" onClick={() => edit(property)}>Edit</button>{property.status === 'DRAFT' && <button className="button primary" type="button" onClick={() => publish(property.id)}>Publish listing</button>}<button className="button" type="button" onClick={() => deleteProperty(property.id)}>Delete</button></div>
    </article>)}</div> : <p className="empty">You have not posted any properties yet.</p>}</section>
    <section className="panel"><h2>Customer enquiries</h2>{enquiries.length ? enquiries.map((enquiry) => <article className="request-row" key={enquiry.id}>
      <strong>{enquiry.property?.title} · {enquiry.customer?.fullName}</strong><span>{enquiry.type} · {enquiry.status}</span><p>{enquiry.message}</p>
      {enquiry.customer?.phone && <p><a href={`tel:${enquiry.customer.phone}`}>{enquiry.customer.phone}</a> · <a href={`mailto:${enquiry.customer.email}`}>{enquiry.customer.email}</a></p>}
      {enquiry.status === 'NEW' && <button className="button" type="button" onClick={() => updateEnquiry(enquiry.id, 'CONTACTED')}>Mark contacted</button>}
      {enquiry.status !== 'CLOSED' && <button className="button" type="button" onClick={() => updateEnquiry(enquiry.id, 'CLOSED')}>Close enquiry</button>}
    </article>) : <p className="empty">No customer enquiries yet.</p>}</section>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
  </main>
}
