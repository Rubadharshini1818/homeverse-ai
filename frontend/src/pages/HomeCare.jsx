import { useEffect, useState } from 'react'
import { categories } from '../services/data'
import ServiceCard from '../components/ServiceCard'
import { api, queryString } from '../services/api'

export default function HomeCare() {
  const [category, setCategory] = useState(categories[0])
  const [city, setCity] = useState('')
  const [search, setSearch] = useState({ city: '', category: categories[0] })
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api(`/partners?${queryString({ type: 'HOMECARE', category: search.category, city: search.city })}`)
      .then((result) => { if (active) setProviders(result.partners) })
      .catch((loadError) => { if (active) setError(loadError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search])

  function submitSearch(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSearch({ city: city.trim(), category })
  }

  return <main className="wrap"><section className="page-hero"><span className="eyebrow">HOMECARE, MADE SIMPLE</span><h1>Reliable help for the way your home lives.</h1><p>Find local Home Partners who have published their professional profiles and services.</p></section>
    <section><span className="eyebrow">CHOOSE A SERVICE</span><h2>HomeCare categories</h2><div className="categories">{categories.map((item) => <button className={`category ${item === category ? 'active' : ''}`} onClick={() => { setCategory(item); setLoading(true); setError(''); setSearch({ city: city.trim(), category: item }) }} key={item}>{item}</button>)}</div></section>
    <form className="filter" onSubmit={submitSearch}><label className="sr-only" htmlFor="provider-city">City</label><input id="provider-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" /><button className="button primary" type="submit">Find professionals</button></form>
    <section><span className="eyebrow">AVAILABLE NEAR YOU</span><h2>{category} providers</h2>
      {error && <p className="form-error" role="alert">Could not load HomeCare professionals: {error}</p>}
      <div className="provider-grid">{loading ? <p>Loading published professionals…</p> : providers.length ? providers.map((provider) => <ServiceCard key={provider.id} provider={provider} />) : !error && <p className="empty">No published Home Partners are available for this category yet.</p>}</div>
    </section>
  </main>
}
