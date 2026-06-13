const API_ROOT = `${import.meta.env.BASE_URL}api`.replace(/\/{2,}/g, '/')
const API_URL = `${API_ROOT}/index.php`
const STREAM_URL = `${API_ROOT}/stream.php`

const FS_COMMANDS = new Set([
  'cd', 'pwd', 'ls', 'dir', 'cat', 'type', 'head', 'tail', 'touch',
  'mkdir', 'md', 'rm', 'del', 'cp', 'copy', 'mv', 'move', 'echo',
  'find', 'tree', 'wc', 'grep', 'clear', 'cls',
])

const BUILTIN_COMMANDS = new Set([
  'killport', 'kp', 'killnode', 'kn', 'ports', 'listen',
  'running', 'rn', 'dev',
])

function resolveFirstCommand(command, aliases = {}) {
  const trimmed = command.trim()
  const first = trimmed.split(/\s+/)[0]?.toLowerCase()
  if (!first) return ''
  if (aliases[first]) {
    return aliases[first].split(/\s+/)[0]?.toLowerCase() || first
  }
  return first
}

export async function initShell(options = {}) {
  try {
    const params = new URLSearchParams({ action: 'init' })
    if (options.ensureLaragon) params.set('ensureLaragon', '1')
    const res = await fetch(`${API_URL}?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.ok ? data : null
  } catch {
    return null
  }
}

export async function startLaragon() {
  try {
    const res = await fetch(`${API_URL}?action=start-laragon`)
    if (!res.ok) return null
    const data = await res.json()
    return data?.ok ? data : null
  } catch {
    return null
  }
}

export async function fetchDirListing(cwd, relative = '.') {
  const res = await fetch(`${API_URL}?action=listdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd, relative }),
  })
  if (!res.ok) throw new Error('Gagal memuat direktori')
  return res.json()
}

export async function execShell(command, cwd, prevCwd = null) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'exec', command, cwd, prevCwd }),
  })
  if (!res.ok) throw new Error('API request failed')
  return res.json()
}

export async function execShellStream(command, cwd, prevCwd = null, handlers = {}) {
  const { signal, onStart, onStatus, onLine, onClear, onMeta } = handlers

  let res
  try {
    res = await fetch(STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, cwd, prevCwd }),
      signal,
    })
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      return { ok: true, cancelled: true, cwd, output: [] }
    }
    throw new Error(err?.message || 'Network error — gagal hubung ke backend Laragon')
  }

  if (!res.ok) throw new Error(`Stream gagal (HTTP ${res.status})`)
  if (!res.body) throw new Error('Stream not supported')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalData = { ok: true, cwd, output: [] }
  let gotDone = false

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {})
        return { ...finalData, ok: true, cancelled: true }
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        if (signal?.aborted) {
          await reader.cancel().catch(() => {})
          return { ...finalData, ok: true, cancelled: true }
        }

        const raw = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (!raw) continue

        let msg
        try {
          msg = JSON.parse(raw)
        } catch {
          if (raw.startsWith('<') || raw.includes('<br')) {
            throw new Error('Backend mengembalikan HTML error — cek log PHP Laragon')
          }
          onLine?.(`[parse] ${raw.slice(0, 200)}`)
          continue
        }

        if (msg.type === 'start') onStart?.(msg.command)
        else if (msg.type === 'meta') onMeta?.(msg)
        else if (msg.type === 'status') onStatus?.(msg.text)
        else if (msg.type === 'line') onLine?.(msg.text)
        else if (msg.type === 'clear') onClear?.()
        else if (msg.type === 'error') throw new Error(msg.error || 'Stream error')
        else if (msg.type === 'done') {
          gotDone = true
          finalData = { ...finalData, ...msg }
        }

        if (signal?.aborted) {
          await reader.cancel().catch(() => {})
          return { ...finalData, ok: true, cancelled: true }
        }
      }
    }
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      await reader.cancel().catch(() => {})
      return { ...finalData, ok: true, cancelled: true }
    }
    if (!gotDone) {
      onLine?.(
        '[terminal] Stream terputus (sleep/jaringan) — proses di server tetap jalan jika npm/build',
      )
      return { ...finalData, ok: true, disconnected: true }
    }
    throw err
  }

  if (!gotDone && !signal?.aborted) {
    onLine?.('[terminal] Stream terputus — proses di server mungkin masih jalan (cek log / killport)')
    return { ...finalData, ok: true, disconnected: true }
  }

  return finalData
}

export function isRealMode(state) {
  return state?.realMode === true
}

export function isStreamCommand(command, aliases = {}) {
  const first = resolveFirstCommand(command, aliases)
  return first !== '' && !FS_COMMANDS.has(first) && !BUILTIN_COMMANDS.has(first)
}
