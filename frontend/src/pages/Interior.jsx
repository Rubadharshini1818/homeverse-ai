import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ServiceCard from '../components/ServiceCard'
import { api } from '../services/api'
import { useAuth } from '../services/authContext.js'

const roomTypes = ['Living room', 'Bedroom', 'Kitchen', 'Dining room', 'Bathroom', 'Home office', 'Other room']
const designStyles = ['Modern', 'Minimal', 'Traditional', 'Luxury', 'Scandinavian', 'Contemporary', 'Industrial', 'Bohemian']

export default function Interior() {
  const { user } = useAuth()
  const [file, setFile] = useState(null)
  const [roomType, setRoomType] = useState(roomTypes[0])
  const [style, setStyle] = useState(designStyles[0])
  const [preferences, setPreferences] = useState('')
  const [designs, setDesigns] = useState([])
  const [designOwnerId, setDesignOwnerId] = useState('')
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    api('/partners?type=INTERIOR')
      .then((result) => { if (active) setPartners(result.partners) })
      .catch((loadError) => { if (active) setError(loadError.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    if (user?.role !== 'CUSTOMER') {
      return () => { active = false }
    }
    api('/designs')
      .then((result) => {
        if (active) {
          setDesigns(result.designs)
          setDesignOwnerId(user.id)
        }
      })
      .catch((loadError) => { if (active && loadError.status !== 401) setError(loadError.message) })
    return () => { active = false }
  }, [user?.id, user?.role])

  async function generate(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!user) {
      setError('Sign in as a customer to generate and save an AI room design.')
      return
    }
    if (user.role !== 'CUSTOMER') {
      setError('AI room designs are available to customer accounts.')
      return
    }
    if (!file) {
      setError('Choose a room photograph first.')
      return
    }
    setLoading(true)
    const form = new FormData()
    form.append('roomImage', file)
    form.append('roomType', roomType)
    form.append('style', style)
    form.append('preferences', preferences)
    try {
      const result = await api('/designs', { method: 'POST', body: form })
      setDesigns((current) => [result.design, ...current])
      setDesignOwnerId(user.id)
      setNotice('Your AI-designed room was generated and saved to your account.')
    } catch (generationError) {
      setError(generationError.message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSaved(design) {
    setError('')
    try {
      await api(`/designs/${encodeURIComponent(design.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isSaved: !design.isSaved })
      })
      setDesigns((current) => current.map((item) => item.id === design.id ? { ...item, isSaved: !item.isSaved } : item))
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return <main className="wrap"><section className="intro"><div><span className="eyebrow">AI INTERIOR DESIGN</span><h1>See the room you have in mind.</h1><p>Upload a room image, choose a direction, and request a real AI image-to-image redesign.</p></div>
    <form className="ai" onSubmit={generate}><h2>Design your starting point</h2>
      <label>Room photograph<input required type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <label>Room type<select value={roomType} onChange={(event) => setRoomType(event.target.value)}>{roomTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Interior style<select value={style} onChange={(event) => setStyle(event.target.value)}>{designStyles.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Preferences (optional)<textarea rows="3" maxLength="1000" value={preferences} onChange={(event) => setPreferences(event.target.value)} placeholder="Colors, materials, budget considerations…" /></label>
      <button className="button" disabled={loading}>{loading ? 'Generating with AI…' : 'Generate redesigned room'}</button>
      {!user && <p><Link to="/login" state={{ from: '/interior' }}>Sign in to generate and save your designs.</Link></p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </form>
  </section>
  {user?.role === 'CUSTOMER' && designOwnerId === user.id && <section className="content"><span className="eyebrow">YOUR DESIGNS</span><h2>Saved AI room designs</h2>{designs.length === 0 && <p className="empty">No saved AI designs yet.</p>}<div className="design-grid">{designs.map((design) => <article className="panel design-card" key={design.id}>
    <h3>{design.roomType} · {design.style}</h3><div className="design-images"><figure><img src={design.originalImage} alt={`Original ${design.roomType}`} /><figcaption>Original room</figcaption></figure><figure><img src={design.generatedImage} alt={`${design.style} redesign`} /><figcaption>AI redesign</figcaption></figure></div>
    <p>{design.preferences}</p><button className="button" type="button" onClick={() => toggleSaved(design)}>{design.isSaved ? 'Remove from saved' : 'Save design'}</button>
  </article>)}</div></section>}
  <section className="content"><span className="eyebrow">TRUSTED PROFESSIONALS</span><h2>Interior design companies</h2>
    <div className="provider-grid">{partners.map((partner) => <ServiceCard key={partner.id} provider={partner} />)}{!partners.length && <p className="empty">No published interior partners are available yet.</p>}</div>
  </section></main>
}
