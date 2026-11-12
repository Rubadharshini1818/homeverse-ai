export function httpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  if (details) error.details = details
  return error
}

export function parseStringArray(value, fieldName) {
  if (value === undefined || value === null || value === '') return []
  let items = value
  if (typeof value === 'string') {
    try {
      items = JSON.parse(value)
    } catch {
      items = value.split(',').map((item) => item.trim()).filter(Boolean)
    }
  }
  if (!Array.isArray(items) || items.some((item) => typeof item !== 'string')) {
    throw httpError(400, `${fieldName} must be a list of text values.`)
  }
  return items.map((item) => item.trim()).filter(Boolean)
}

export function parseOptionalDate(value, fieldName = 'Date') {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60_000) {
    throw httpError(400, `${fieldName} must be a valid future date.`)
  }
  return date
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
