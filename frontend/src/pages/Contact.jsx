import { useState } from 'react'
import { api, jsonBody } from '../services/api'

export default function Contact() {
  const [values, setValues] = useState({ name: '', email: '', message: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sending, setSending] = useState(false)

  function update(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSending(true)
    try {
      const result = await api('/contact', { method: 'POST', body: jsonBody(values) })
      setNotice(result.message)
      setValues({ name: '', email: '', message: '' })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSending(false)
    }
  }

  return <main className="wrap simple-page"><span className="eyebrow">CONTACT HOMEVERSE</span><h1>Let’s talk about your home.</h1>
    <form className="panel form-grid" onSubmit={submit}>
      <label>Name<input required minLength="2" maxLength="120" autoComplete="name" value={values.name} onChange={update('name')} /></label>
      <label>Email<input required type="email" autoComplete="email" value={values.email} onChange={update('email')} /></label>
      <label className="full">Message<textarea required minLength="5" maxLength="4000" rows="5" value={values.message} onChange={update('message')} /></label>
      {error && <p className="form-error full" role="alert">{error}</p>}
      {notice && <p className="form-success full" role="status">{notice}</p>}
      <button className="button primary" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
    </form>
  </main>
}
