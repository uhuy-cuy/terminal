import './CdAutocomplete.css'

export default function CdAutocomplete({
  open,
  loading,
  listPath,
  entries,
  selectedIndex,
  onSelect,
  onHover,
}) {
  if (!open) return null

  return (
    <div className="cd-autocomplete" role="listbox" aria-label="Pilih folder">
      <div className="cd-autocomplete-header">
        {loading ? 'Memuat folder...' : listPath || 'Direktori saat ini'}
      </div>
      <ul className="cd-autocomplete-list">
        {entries.length === 0 && !loading && (
          <li className="cd-autocomplete-empty">Tidak ada folder cocok</li>
        )}
        {entries.map((entry, index) => (
          <li key={`${entry.name}-${index}`}>
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`cd-autocomplete-item${index === selectedIndex ? ' cd-autocomplete-item--active' : ''}${entry.type === 'file' ? ' cd-autocomplete-item--file' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(entry)}
              onMouseEnter={() => onHover(index)}
            >
              <span className="cd-autocomplete-icon">{entry.type === 'dir' ? '📁' : '📄'}</span>
              <span className="cd-autocomplete-name">{entry.name}</span>
              {entry.type === 'dir' && entry.name !== '.' && entry.name !== '..' && (
                <span className="cd-autocomplete-hint">/</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="cd-autocomplete-footer">↑↓ pilih · Tab isi · Enter jalankan</div>
    </div>
  )
}
