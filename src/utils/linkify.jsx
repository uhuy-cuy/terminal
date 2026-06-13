import { parseCompileErrorDetail, stripAnsi } from './streamHelpers'

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g

const SOURCE_FILE_RE = String.raw`[\w./\\@-]+\.(?:tsx?|jsx?|mjs|cjs|html|scss|sass|css)`
const ERROR_LOC_RE = new RegExp(`(${SOURCE_FILE_RE}):(\\d+):(\\d+)`, 'g')
const TS_CODE_RE = /\b((?:TS|NG)\d+):/gi
const ERROR_PREFIX_RE = /\b(Error:)/gi

export function isLocalDevUrl(url) {
  if (!url) return false
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true
    if (/^192\.168\./.test(host) || /^10\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
      return true
    }
    return false
  } catch {
    return false
  }
}

export function extractPreviewUrl(text, assignedPort = null) {
  if (!text) return null
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi)
  if (matches) {
    for (const raw of matches) {
      const url = raw.replace(/[.,)\]]+$/, '')
      if (!isLocalDevUrl(url)) continue
      if (!/:\d+/.test(url) && !assignedPort) continue
      const port = url.match(/:(\d+)/)?.[1] || assignedPort
      if (port) return `http://localhost:${port}/`
    }
  }
  if (/\[terminal\] ▶ Preview:\s*(https?:\/\/\S+)/i.test(text)) {
    const m = text.match(/\[terminal\] ▶ Preview:\s*(https?:\/\/\S+)/i)
    const url = m?.[1]?.replace(/[.,)\]]+$/, '')
    if (url && isLocalDevUrl(url)) {
      if (/:\d+/.test(url)) return url
      if (assignedPort) return `http://localhost:${assignedPort}/`
    }
  }
  return null
}

export function extractPortFromUrl(url) {
  if (!url) return null
  const match = String(url).match(/:(\d{1,5})(?:\/|$)/)
  if (!match) return null
  const port = Number(match[1])
  return port >= 1 && port <= 65535 ? port : null
}

function highlightErrorTokens(text) {
  const matches = []
  const patterns = [
    { re: ERROR_LOC_RE, cls: 'term-error-loc' },
    { re: TS_CODE_RE, cls: 'term-error-ts' },
    { re: ERROR_PREFIX_RE, cls: 'term-error-label' },
  ]

  for (const { re, cls } of patterns) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, value: m[0], cls })
    }
  }

  if (matches.length === 0) return text

  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const merged = []
  for (const m of matches) {
    const last = merged[merged.length - 1]
    if (last && m.start < last.end) continue
    merged.push(m)
  }

  const out = []
  let pos = 0
  merged.forEach((m, i) => {
    if (m.start > pos) out.push(<span key={`t-${i}`}>{text.slice(pos, m.start)}</span>)
    out.push(
      <span key={`h-${i}`} className={m.cls} title={m.cls === 'term-error-loc' ? m.value : undefined}>
        {m.value}
      </span>,
    )
    pos = m.end
  })
  if (pos < text.length) out.push(<span key="tail">{text.slice(pos)}</span>)
  return out
}

/** Render baris log — error Angular/TS seperti CMD (file, TS code, snippet, caret) */
export function renderTerminalLine(text, options = {}) {
  const clean = stripAnsi(text)
  if (!clean) return clean

  const isError = options.error === true || parseCompileErrorDetail(clean) != null

  if (isError && /^[\s~^]+$/.test(clean) && /[~^]/.test(clean)) {
    return <span className="term-error-caret">{clean}</span>
  }

  const gutter = clean.match(/^(\d{1,6})\s+(.*)$/)
  if (isError && gutter && !/^(npm|yarn|pnpm)\b/i.test(gutter[2])) {
    return (
      <span className="term-error-frame">
        <span className="term-error-gutter">{gutter[1]}</span>
        <span className="term-error-snippet">{highlightErrorTokens(gutter[2])}</span>
      </span>
    )
  }

  if (isError) {
    return <span className="term-error-line">{highlightErrorTokens(clean)}</span>
  }

  return renderLinkified(clean, options)
}

export function renderLinkified(text, options = {}) {
  if (!text) return text

  const clean = stripAnsi(text)
  const highlightErrorLoc = options.error === true

  if (highlightErrorLoc && ERROR_LOC_RE.test(clean)) {
    ERROR_LOC_RE.lastIndex = 0
    return <span className="term-error-line">{highlightErrorTokens(clean)}</span>
  }

  const parts = clean.split(URL_PATTERN)
  if (parts.length === 1) return clean
  return parts.map((part, index) => {
    if (/^https?:\/\//i.test(part)) {
      const href = part.replace(/[.,)\]]+$/, '')
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="term-link"
          onClick={(e) => e.stopPropagation()}
        >
          {href}
        </a>
      )
    }
    return part
  })
}
