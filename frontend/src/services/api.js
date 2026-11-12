const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function send(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const isFormData = options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  })
  const contentType = response.headers.get('content-type') || ''
  const result = contentType.includes('application/json') ? resolveMediaUrls(await response.json()) : null
  if (!response.ok) {
    const error = new Error(result?.error?.message || `Request failed (${response.status}).`)
    error.status = response.status
    error.details = result?.error?.details
    throw error
  }
  return result
}

function resolveMediaUrls(value) {
  if (typeof value === 'string') {
    if (value.startsWith('/api/media/') && API_BASE_URL !== '/api') {
      return `${API_BASE_URL}${value.slice('/api'.length)}`
    }
    return value
  }
  if (Array.isArray(value)) return value.map(resolveMediaUrls)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveMediaUrls(item)]))
  }
  return value
}

export async function api(path, options = {}) {
  try {
    return await send(path, options)
  } catch (error) {
    if (error.status !== 401 || path.startsWith('/auth/')) throw error
    try {
      await send('/auth/refresh', { method: 'POST' })
    } catch {
      throw error
    }
    return send(path, options)
  }
}

export function jsonBody(value) {
  return JSON.stringify(value)
}

export function queryString(values) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, String(value).trim())
    }
  })
  return params.toString()
}

export function formatRupees(amount) {
  if (amount === null || amount === undefined || amount === '') return 'Price on request'
  const value = Number(amount)
  if (!Number.isFinite(value)) return 'Price on request'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(value)
}
