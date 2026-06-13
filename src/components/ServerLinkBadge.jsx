import { extractPortFromUrl } from '../utils/linkify'
import './ServerLinkBadge.css'

export default function ServerLinkBadge({ url, onKill }) {
  if (!url) return null

  const port = extractPortFromUrl(url)

  return (
    <div className="server-link-badge" onClick={(e) => e.stopPropagation()}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="server-link-badge-url"
        title="Buka server lokal"
      >
        {url}
      </a>
      {port && onKill && (
        <button
          type="button"
          className="server-link-kill"
          onClick={onKill}
          title={`Hentikan proses di port ${port}`}
        >
          Kill :{port}
        </button>
      )}
    </div>
  )
}
