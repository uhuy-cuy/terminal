const STORAGE_KEY = '@tahirwiyan/command-history'
export const HISTORY_LIMIT = 10

export function loadCommandHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string' && item.trim()).slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

function persistCommandHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-HISTORY_LIMIT)))
  } catch {
    // localStorage penuh atau disabled — abaikan
  }
}

export function pushCommandHistory(history, command) {
  const trimmed = command.trim()
  if (!trimmed) return history

  let next = history.filter(Boolean)
  if (next[next.length - 1] !== trimmed) {
    next.push(trimmed)
  }
  next = next.slice(-HISTORY_LIMIT)
  persistCommandHistory(next)
  return next
}

export function clearCommandHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
