import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { categories } from '../services/data'
import { useAuth } from '../services/authContext.js'
import { api } from '../services/api.js'

const roles = [
  ['CUSTOMER', "I'm looking to buy or rent a property."],
  ['PROPERTY_OWNER', 'I want to list or manage properties.'],
  ['HOME_PARTNER', 'I provide design or maintenance services.']
]

const STEPS = ['Basic Info', 'Professional Details', 'Documents']

function StepBar({ step }) {
  return (
    <div className="wizard-steps">
      {STEPS.map((label, i) => (
        <div key={label} className={`wizard-step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
          <div className="wizard-step-dot">{i < step ? '✓' : i + 1}</div>
          <span>{label}</span>
        </div>
      ))}
      <div className="wizard-track">
        <div className="wizard-fill" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
      </div>
    </div>
  )
}

function FileDropZone({ id, label, accept, multiple, required, onChange, files }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const dropped = multiple ? Array.from(e.dataTransfer.files) : [e.dataTransfer.files[0]]
    onChange(dropped)
  }

  function handleChange(e) {
    onChange(Array.from(e.target.files))
  }

  const names = files.map((f) => f.name)

  return (
    <div className="file-drop-zone-wrapper">
      <label htmlFor={id} className="form-field-label">
        {label}{required && <span className="required-mark"> *</span>}
      </label>
      <div
        className={`file-drop-zone ${dragging ? 'drag-over' : ''} ${files.length ? 'has-files' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          id={id}
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="file-input-hidden"
          onChange={handleChange}
        />
        {files.length === 0 ? (
          <>
            <div className="file-drop-icon">📎</div>
            <p className="file-drop-text">Click or drag &amp; drop to upload</p>
            <p className="file-drop-hint">{accept?.replace(/,/g, ', ')}</p>
          </>
        ) : (
          <ul className="file-name-list">
            {names.map((n) => <li key={n}>✅ {n}</li>)}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function Signup() {
  const [role, setRole] = useState('CUSTOMER')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    // property owner
    address: '',
    city: '',
    state: '',
    pinCode: '',
    governmentId: '',
    companyName: '',
    // partner — step 1
    partnerType: 'INTERIOR',
    // partner — step 2
    specialization: '',
    serviceCategory: categories[0],
    experience: '',
    about: '',
    officeAddress: '',
    officeCity: '',
    officeState: '',
    officePinCode: ''
  })
  // step 3 file states
  const [visitingCardFiles, setVisitingCardFiles] = useState([])
  const [certFiles, setCertFiles] = useState([])

  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  function update(field) {
    return (e) => {
      setForm((cur) => ({ ...cur, [field]: e.target.value }))
      setFieldErrors((cur) => { const next = { ...cur }; delete next[field]; return next })
    }
  }

  // ── Non-partner single-step submit ──────────────────────────────────────────
  async function handleSimpleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const user = await register({ ...form, role })
      navigate('/profile', { replace: true, state: { role: user.role } })
    } catch (err) {
      if (err.details) setFieldErrors(err.details)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Partner wizard — Step 1 → 2 ─────────────────────────────────────────────
  function validateStep1() {
    const errs = {}
    if (!form.fullName.trim() || form.fullName.trim().length < 2) errs.fullName = 'Enter a name (at least 2 characters).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Enter a valid email address.'
    if (!form.phone.trim()) errs.phone = 'Enter your phone number.'
    if (!form.password || form.password.length < 8) errs.password = 'Password must be at least 8 characters.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function goToStep2(e) {
    e.preventDefault()
    if (validateStep1()) setStep(1)
  }

  // ── Partner wizard — Step 2 → 3 ─────────────────────────────────────────────
  function validateStep2() {
    const errs = {}
    if (!form.specialization.trim() || form.specialization.trim().length < 2) errs.specialization = 'Enter your specialization.'
    if (!form.officeAddress.trim()) errs.officeAddress = 'Enter your office/work address.'
    if (!form.officeCity.trim()) errs.officeCity = 'Enter your city.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function goToStep3(e) {
    e.preventDefault()
    if (!validateStep2()) return
    setError('')
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        role,
        address: form.officeAddress,
        city: form.officeCity,
        state: form.officeState,
        pinCode: form.officePinCode
      }
      await register(payload)
      setStep(2)
    } catch (err) {
      if (err.details) setFieldErrors(err.details)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Partner wizard — Step 3 submit (file upload) ─────────────────────────────
  async function handleStep3Submit(e) {
    e.preventDefault()
    if (visitingCardFiles.length === 0) {
      setError('Please upload your visiting card — it is required.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('visitingCard', visitingCardFiles[0])
      certFiles.forEach((f) => fd.append('certifications', f))
      await api('/partners/mine', { method: 'PUT', body: fd })
      navigate('/profile', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render: non-partner single-step ─────────────────────────────────────────
  if (role !== 'HOME_PARTNER') {
    return (
      <main className="auth-page">
        <form className="auth-card wide" onSubmit={handleSimpleSubmit}>
          <span className="eyebrow">JOIN HOMEVERSE</span>
          <h1>Create Your Account</h1>
          <div className="role-grid">
            {roles.map(([value, text]) => (
              <button
                type="button"
                className={`role-card ${role === value ? 'selected' : ''}`}
                onClick={() => setRole(value)}
                key={value}
              >
                <strong>{value.replace('_', ' ')}</strong>
                <small>{text}</small>
              </button>
            ))}
          </div>

          <label>Full Name<input required minLength="2" maxLength="120" autoComplete="name" value={form.fullName} onChange={update('fullName')} /></label>
          <label>Email Address<input required type="email" autoComplete="email" value={form.email} onChange={update('email')} /></label>
          <label>Phone Number<input required type="tel" autoComplete="tel" value={form.phone} onChange={update('phone')} /></label>
          <label>Password<input required type="password" minLength="8" autoComplete="new-password" value={form.password} onChange={update('password')} /></label>

          {role === 'PROPERTY_OWNER' && <>
            <label>Government ID<input required value={form.governmentId} onChange={update('governmentId')} /></label>
            <label>Company Name (optional)<input value={form.companyName} onChange={update('companyName')} /></label>
            <label>Address<input required autoComplete="street-address" value={form.address} onChange={update('address')} /></label>
          </>}

          {role !== 'CUSTOMER' && <div className="form-grid">
            <label>City<input required autoComplete="address-level2" value={form.city} onChange={update('city')} /></label>
            <label>State<input autoComplete="address-level1" value={form.state} onChange={update('state')} /></label>
            <label>PIN Code<input inputMode="numeric" autoComplete="postal-code" value={form.pinCode} onChange={update('pinCode')} /></label>
          </div>}

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" disabled={submitting}>{submitting ? 'Creating account…' : 'Create account'}</button>
          <p>Already registered? <Link to="/login">Sign in</Link></p>
        </form>
      </main>
    )
  }

  // ── Render: HOME_PARTNER wizard ──────────────────────────────────────────────
  return (
    <main className="auth-page">
      <form
        className="auth-card wide"
        onSubmit={step === 0 ? goToStep2 : step === 1 ? goToStep3 : handleStep3Submit}
        noValidate
      >
        <span className="eyebrow">JOIN HOMEVERSE</span>
        <h1>{step === 0 ? 'Create Your Account' : step === 1 ? 'Professional Details' : 'Documents & Verification'}</h1>

        {/* Role selector — only on step 0 */}
        {step === 0 && (
          <div className="role-grid">
            {roles.map(([value, text]) => (
              <button
                type="button"
                className={`role-card ${role === value ? 'selected' : ''}`}
                onClick={() => setRole(value)}
                key={value}
              >
                <strong>{value.replace('_', ' ')}</strong>
                <small>{text}</small>
              </button>
            ))}
          </div>
        )}

        <StepBar step={step} />

        {/* ── Step 1: Basic Info ───────────────────────────────────────────── */}
        {step === 0 && <>
          <label>
            Full Name
            <input required minLength="2" maxLength="120" autoComplete="name" value={form.fullName} onChange={update('fullName')} />
            {fieldErrors.fullName && <span className="field-error">{fieldErrors.fullName}</span>}
          </label>
          <label>
            Email Address
            <input required type="email" autoComplete="email" value={form.email} onChange={update('email')} />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </label>
          <label>
            Phone Number
            <input required type="tel" autoComplete="tel" value={form.phone} onChange={update('phone')} />
            {fieldErrors.phone && <span className="field-error">{fieldErrors.phone}</span>}
          </label>
          <label>
            Password
            <input required type="password" minLength="8" autoComplete="new-password" value={form.password} onChange={update('password')} />
            {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
          </label>
          <label>
            Partner Type
            <select value={form.partnerType} onChange={update('partnerType')}>
              <option value="INTERIOR">Interior Designer / Interior Company</option>
              <option value="HOMECARE">HomeCare Professional / Service Company</option>
            </select>
          </label>
        </>}

        {/* ── Step 2: Professional Details ────────────────────────────────── */}
        {step === 1 && <>
          <label>
            Company / Business Name <span className="muted">(optional)</span>
            <input maxLength="160" placeholder="e.g. Bright Spaces Interiors" value={form.companyName} onChange={update('companyName')} />
          </label>

          <label>
            Specialization <span className="required-mark">*</span>
            <input required maxLength="300" placeholder={form.partnerType === 'INTERIOR' ? 'e.g. Modular kitchens, false ceilings' : 'e.g. Electrical wiring, panel upgrades'} value={form.specialization} onChange={update('specialization')} />
            {fieldErrors.specialization && <span className="field-error">{fieldErrors.specialization}</span>}
          </label>

          {form.partnerType === 'HOMECARE' && (
            <label>
              Service Category
              <select value={form.serviceCategory} onChange={update('serviceCategory')}>
                {categories.map((cat) => <option key={cat}>{cat}</option>)}
              </select>
            </label>
          )}

          <label>
            Years of Experience
            <input type="number" min="0" max="100" placeholder="e.g. 5" value={form.experience} onChange={update('experience')} />
          </label>

          <label>
            About / Bio <span className="muted">(tell clients about your work)</span>
            <textarea
              maxLength="3000"
              rows={4}
              placeholder="Describe your services, style, achievements, and what makes you stand out…"
              value={form.about}
              onChange={update('about')}
              style={{ display: 'block', width: '100%', marginTop: 7, resize: 'vertical' }}
            />
          </label>

          <p className="wizard-section-label">📍 Office / Work Address</p>

          <label>
            Street Address <span className="required-mark">*</span>
            <input required autoComplete="street-address" placeholder="e.g. 12, MG Road" value={form.officeAddress} onChange={update('officeAddress')} />
            {fieldErrors.officeAddress && <span className="field-error">{fieldErrors.officeAddress}</span>}
          </label>

          <div className="form-grid">
            <label>
              City <span className="required-mark">*</span>
              <input required autoComplete="address-level2" value={form.officeCity} onChange={update('officeCity')} />
              {fieldErrors.officeCity && <span className="field-error">{fieldErrors.officeCity}</span>}
            </label>
            <label>
              State
              <input autoComplete="address-level1" value={form.officeState} onChange={update('officeState')} />
            </label>
            <label>
              PIN Code
              <input inputMode="numeric" autoComplete="postal-code" value={form.officePinCode} onChange={update('officePinCode')} />
            </label>
          </div>
        </>}

        {/* ── Step 3: Documents ────────────────────────────────────────────── */}
        {step === 2 && <>
          <p className="wizard-step-intro">
            Upload your visiting card so customers can verify your identity and contact you easily.
            Certifications are optional but help build trust.
          </p>

          <FileDropZone
            id="visitingCard"
            label="Visiting Card"
            accept="image/jpeg, image/png, image/webp, application/pdf"
            multiple={false}
            required={true}
            files={visitingCardFiles}
            onChange={setVisitingCardFiles}
          />

          <FileDropZone
            id="certifications"
            label="Certifications / Licences (optional)"
            accept="image/jpeg, image/png, image/webp, application/pdf"
            multiple={true}
            required={false}
            files={certFiles}
            onChange={setCertFiles}
          />

          <p className="wizard-step-hint">
            Accepted: JPG, PNG, WebP, PDF · Max 15 MB per file · Up to 10 certifications
          </p>
        </>}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="step-nav">
          {step > 0 && step < 2 && (
            <button type="button" className="button step-back" onClick={() => { setStep(step - 1); setError('') }}>
              ← Back
            </button>
          )}
          {step === 0 && <p className="step-nav-hint">Already registered? <Link to="/login">Sign in</Link></p>}
          <button className="button primary step-next" disabled={submitting}>
            {submitting
              ? (step === 1 ? 'Creating account…' : 'Uploading…')
              : step === 0 ? 'Next: Professional Details →'
              : step === 1 ? 'Next: Documents →'
              : 'Finish Registration'}
          </button>
        </div>
      </form>
    </main>
  )
}
