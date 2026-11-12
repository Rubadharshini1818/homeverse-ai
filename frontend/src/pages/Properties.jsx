import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PropertyCard from '../components/PropertyCard'
import { api, queryString } from '../services/api'

function filtersFromSearch(search) {
  const params = new URLSearchParams(search)
  return {
    type: params.get('type') || 'all',
    q: params.get('q') || '',
    city: params.get('city') || '',
    area: params.get('area') || '',
    pinCode: params.get('pinCode') || '',
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || ''
  }
}

export default function Properties() {
  const location = useLocation()
  const navigate = useNavigate()
  const [filters, setFilters] = useState(() => filtersFromSearch(location.search))
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const nextFilters = filtersFromSearch(location.search)
    let active = true
    api(`/properties?${queryString(nextFilters)}`)
      .then((result) => { if (active) setList(result.properties) })
      .catch((loadError) => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [location.search])

  function update(field) {
    return (event) => setFilters((current) => ({ ...current, [field]: event.target.value }))
  }

  function search(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    navigate(`/properties?${queryString(filters)}`)
  }

  return <main><section className="page-hero wrap"><span className="eyebrow">A CONSIDERED PLACE TO BEGIN</span><h1>Find the space that feels like yours.</h1><p>Browse homes, rentals, and land listings published by property owners.</p><form className="filter" onSubmit={search}>
    <input aria-label="Search city, area or PIN code" value={filters.q} onChange={update('q')} placeholder="City, area or PIN code" />
    <input aria-label="City" value={filters.city} onChange={update('city')} placeholder="City" />
    <input aria-label="Area" value={filters.area} onChange={update('area')} placeholder="Area or neighborhood" />
    <input aria-label="PIN code" value={filters.pinCode} onChange={update('pinCode')} placeholder="PIN code" />
    <select aria-label="Category" value={filters.type} onChange={update('type')}><option value="all">All properties</option><option value="buy">Buy property</option><option value="rent">Rent property</option><option value="land">Land</option></select>
    <input aria-label="Minimum price in rupees" type="number" min="0" value={filters.minPrice} onChange={update('minPrice')} placeholder="Min price (₹)" />
    <input aria-label="Maximum price in rupees" type="number" min="0" value={filters.maxPrice} onChange={update('maxPrice')} placeholder="Max price (₹)" />
    <button className="button primary" type="submit">Search</button>
  </form></section><section className="wrap content"><span className="eyebrow">THE COLLECTION</span><h2>Properties worth a closer look</h2><p className="muted">{loading ? 'Loading published listings…' : `Showing ${list.length} published listing${list.length === 1 ? '' : 's'}`}</p>
    {error && <p className="form-error" role="alert">Could not load property listings: {error}</p>}
    <div className="grid">{!loading && !error && list.length === 0 && <p className="empty">No published properties match this search yet.</p>}{list.map((property) => <PropertyCard key={property.id} property={property} />)}</div>
  </section></main>
}
