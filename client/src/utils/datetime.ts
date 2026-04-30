const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function parseDateValue(value?: string | null) {
  if (!value) return null
  const normalized = value.trim()
  if (!normalized) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00`)
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

export function formatDate(value?: string | null) {
  const parsed = parseDateValue(value)
  if (!parsed) return value || '-'
  return dateFormatter.format(parsed)
}

export function formatDateTime(value?: string | null) {
  const parsed = parseDateValue(value)
  if (!parsed) return value || '-'
  return dateTimeFormatter.format(parsed)
}

