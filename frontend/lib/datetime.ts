const DEFAULT_LOCALE = 'en-US'

const DEFAULT_DATETIME_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

const INVALID_RESULT = null

function toDate(value?: string | number | Date | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATETIME_OPTIONS,
  locale: string = DEFAULT_LOCALE,
): string | null {
  const date = toDate(value)
  if (!date) return INVALID_RESULT
  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function formatRelativeTime(value?: string | number | Date | null): string | null {
  const date = toDate(value)
  if (!date) return INVALID_RESULT

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'just now'

  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  const years = Math.floor(days / 365)
  return `${years}y ago`
}

