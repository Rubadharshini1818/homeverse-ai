import { useState } from 'react'
import { useAuth } from '../../services/authContext.js'

export default function AccountForm({ user, profileFields }) {
  const { updateProfile } = useAuth()
  const [values, setValues] = useState(() => ({
    fullName: user.fullName || '',
    email: user.email || '',
    phone: user.phone || '',
    ...Object.fromEntries(profileFields.map((field) => [field, user.profile?.[field] || '']))
  }))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field) {
    return (event) => setValues((current) => ({ ...current, [field]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSaving(true)
    const profile = Object.fromEntries(profileFields.map((field) => [field, values[field] || '']))
    try {
      const updatedUser = await updateProfile({ fullName: values.fullName, email: values.email, phone: values.phone, profile })
      setValues({
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        phone: updatedUser.phone,
        ...Object.fromEntries(profileFields.map((field) => [field, updatedUser.profile?.[field] || '']))
      })
      setNotice('Your account details were saved.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return <form className="panel form-grid" onSubmit={submit}>
    <h2 className="full">Account details</h2>
    <label>Full name<input required minLength="2" maxLength="120" value={values.fullName || ''} onChange={update('fullName')} /></label>
    <label>Email<input required type="email" value={values.email || ''} onChange={update('email')} /></label>
    <label>Phone<input required type="tel" value={values.phone || ''} onChange={update('phone')} /></label>
    {profileFields.map((field) => <label key={field}>{field === 'pinCode' ? 'PIN code' : field === 'governmentId' ? 'Government ID' : field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
      <input value={values[field] || ''} onChange={update(field)} /></label>)}
    {error && <p className="form-error full" role="alert">{error}</p>}
    {notice && <p className="form-success full" role="status">{notice}</p>}
    <button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save account details'}</button>
  </form>
}
