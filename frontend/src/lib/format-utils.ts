export function safeMessage(value: unknown, fallback = 'Issue'): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message?: unknown }).message || fallback)
  }
  return fallback
}
