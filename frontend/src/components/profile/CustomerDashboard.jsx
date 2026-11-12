import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountForm from './AccountForm'
import { api, formatRupees } from '../../services/api'

export default function CustomerDashboard({ user }) {
  const [data, setData] = useState({ saved: [], enquiries: [], requests: [], designs: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      api('/saved-properties'),
      api('/enquiries/mine'),
      api('/service-requests/mine'),
      api('/designs')
    ]).then(([saved, enquiries, requests, designs]) => {
      if (active) setData({
        saved: saved.properties,
        enquiries: enquiries.enquiries,
        requests: requests.requests,
        designs: designs.designs
      })
    }).catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [])

  return <main className="wrap simple-page"><span className="eyebrow">CUSTOMER DASHBOARD</span><h1>My HomeVerse</h1>
    <p className="muted">{user.fullName} · {user.email}</p>
    <AccountForm user={user} profileFields={['address', 'city', 'state', 'pinCode']} />
    {error && <p className="form-error" role="alert">Could not load your saved activity: {error}</p>}
    <section className="panel"><h2>My saved properties</h2>{data.saved.length ? <div className="grid">{data.saved.map((property) => <Link className="saved-property" key={property.id} to={`/properties/${property.id}`}>
      {property.image && <img src={property.image} alt={property.title} />}<strong>{property.title}</strong><span>{property.location}</span><span>{formatRupees(property.price)}</span>
    </Link>)}</div> : <p className="empty">No saved properties yet.</p>}</section>
    <section className="panel"><h2>My property enquiries</h2>{data.enquiries.length ? data.enquiries.map((item) => <article className="request-row" key={item.id}>
      <strong>{item.property?.title || 'Property'}</strong><span>{item.type} · {item.status}</span><p>{item.message}</p>
    </article>) : <p className="empty">No property enquiries yet.</p>}</section>
    <section className="panel"><h2>My HomeCare requests</h2>{data.requests.length ? data.requests.map((item) => <article className="request-row" key={item.id}>
      <strong>{item.category} · {item.partnerName}</strong><span>{item.status}</span><p>{item.message}</p>
    </article>) : <p className="empty">No HomeCare requests yet.</p>}</section>
    <section className="panel"><h2>AI interior designs</h2><p>{data.designs.length} saved design{data.designs.length === 1 ? '' : 's'}</p><Link className="button" to="/interior">Open Interior Design</Link></section>
  </main>
}
