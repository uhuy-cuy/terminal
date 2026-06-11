import { useCallback, useState } from 'react'
import Terminal from './Terminal'
import './TerminalTabs.css'

let tabCounter = 1

function makeTab() {
  const n = tabCounter++
  return { id: `tab-${n}-${Date.now()}`, title: `Terminal ${n}` }
}

export default function TerminalTabs() {
  const [initialTab] = useState(() => makeTab())
  const [tabs, setTabs] = useState(() => [initialTab])
  const [activeId, setActiveId] = useState(initialTab.id)

  const addTab = useCallback(() => {
    setTabs((prev) => {
      if (prev.length >= 8) return prev
      const tab = makeTab()
      setActiveId(tab.id)
      return [...prev, tab]
    })
  }, [])

  const closeTab = useCallback(
    (id) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev
        const idx = prev.findIndex((t) => t.id === id)
        const next = prev.filter((t) => t.id !== id)
        if (activeId === id) {
          const fallback = next[Math.min(idx, next.length - 1)]
          setActiveId(fallback?.id ?? next[0]?.id)
        }
        return next
      })
    },
    [activeId],
  )

  const updateTabTitle = useCallback((id, title) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
  }, [])

  return (
    <div className="terminal-workspace">
      <div className="tab-bar">
        <div className="tab-list" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === activeId}
              className={`tab-item${tab.id === activeId ? ' tab-item--active' : ''}`}
            >
              <button
                type="button"
                className="tab-select"
                onClick={() => setActiveId(tab.id)}
                title={tab.title}
              >
                {tab.title}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                  aria-label={`Tutup ${tab.title}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="tab-add"
          onClick={addTab}
          disabled={tabs.length >= 8}
          title={tabs.length >= 8 ? 'Maksimal 8 terminal' : 'Tambah terminal'}
        >
          +
        </button>
      </div>

      <div className="tab-panels">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-panel${tab.id === activeId ? ' tab-panel--active' : ''}`}
            role="tabpanel"
            hidden={tab.id !== activeId}
          >
            <Terminal
              isActive={tab.id === activeId}
              onTitleChange={(title) => updateTabTitle(tab.id, title)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
