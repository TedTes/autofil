export function safeMessage(value: unknown, fallback = 'Issue'): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message?: unknown }).message || fallback)
  }
  return fallback
}

export function safeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function safeStringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== 'object' || !(field in value)) return undefined
  const fieldValue = (value as Record<string, unknown>)[field]
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') return undefined
  return String(fieldValue)
}

export function truncateText(value: string, maxLength = 60): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
