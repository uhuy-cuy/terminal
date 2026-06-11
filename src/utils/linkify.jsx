const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g

export function extractPreviewUrl(text) {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  return match ? match[0].replace(/[.,)\]]+$/, '') : null
}

export function extractPortFromUrl(url) {
  if (!url) return null
  const match = String(url).match(/:(\d{1,5})(?:\/|$)/)
  if (!match) return null
  const port = Number(match[1])
  return port >= 1 && port <= 65535 ? port : null
}

export function renderLinkified(text) {
  if (!text) return text

  const parts = text.split(URL_PATTERN)
  if (parts.length === 1) return text

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
