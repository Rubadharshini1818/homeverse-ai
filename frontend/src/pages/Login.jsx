import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../services/authContext.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(location.state?.from || '/profile', { replace: true })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={handleSubmit}>
    <span className="eyebrow">WELCOME BACK</span><h1>Sign in to HomeVerse</h1>
    <label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</button>
    <p>New to HomeVerse? <Link to="/signup">Create an Account</Link></p>
  </form></main>
}
