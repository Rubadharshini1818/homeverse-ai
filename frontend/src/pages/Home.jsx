import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const priceRanges = [
  ['Any budget', '', ''],
  ['Up to ₹50 lakh', '0', '5000000'],
  ['₹50 lakh – ₹1 crore', '5000000', '10000000'],
  ['₹1 – ₹2 crore', '10000000', '20000000'],
  ['Above ₹2 crore', '20000000', '']
]

export default function Home() {
  const [city, setCity] = useState('')
  const [type, setType] = useState('buy')
  const [priceRange, setPriceRange] = useState('')
  const navigate = useNavigate()

  function search(event) {
    event.preventDefault()
    const params = new URLSearchParams({ type })
    if (city.trim()) params.set('q', city.trim())
    const [minPrice, maxPrice] = priceRange.split(':')
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    navigate(`/properties?${params.toString()}`)
  }

  return <main><section className="home-hero"><div className="hero-content"><span className="eyebrow">YOUR HOME. YOUR SPACE. YOUR JOURNEY.</span><h1>Find a Place You'll Love to Call Home.</h1><p>Discover properties, connect with trusted owners, explore beautiful interiors, and find reliable home services — all in one place.</p><div className="hero-actions"><Link className="button primary" to="/properties">Explore Properties</Link><Link className="button ghost" to="/signup">Get Started</Link></div><form className="glass-panel" onSubmit={search}>
    <input aria-label="City, neighborhood, or PIN code" placeholder="City, neighborhood, or PIN code" value={city} onChange={(event) => setCity(event.target.value)} />
    <select aria-label="Property type" value={type} onChange={(event) => setType(event.target.value)}><option value="buy">Buy</option><option value="rent">Rent</option><option value="land">Land</option></select>
    <select aria-label="Price range" value={priceRange} onChange={(event) => setPriceRange(event.target.value)}>{priceRanges.map(([label, min, max]) => <option key={label} value={min || max ? `${min}:${max}` : ''}>{label}</option>)}</select>
    <button className="button primary" type="submit">Search</button>
  </form></div></section><section className="wrap content"><div className="center-heading"><h2>Everything You Need for Your Home</h2><p>From finding the right property to creating and maintaining your perfect space.</p></div><div className="service-grid">{[['Buy Property','Discover premium homes and apartments tailored to your lifestyle and budget.','/properties?type=buy'],['Rent Property','Find reliable long-term rentals with verified owners and hassle-free agreements.','/properties?type=rent'],['Land','Invest in prime plots for your custom build or future development projects.','/properties?type=land'],['Interior Design','Connect with top designers to transform your space into a personal sanctuary.','/interior'],['HomeCare','Access trusted professionals for maintenance, repairs, and landscaping services.','/homecare']].map(([title,text,path])=><article className="service-card" key={title}><span className="service-icon">◆</span><h3>{title}</h3><p>{text}</p><Link to={path}>Explore →</Link></article>)}</div></section></main>
}
