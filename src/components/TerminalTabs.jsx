import { useCallback, useEffect, useRef, useState } from 'react'
import Terminal from './Terminal'
import './TerminalTabs.css'

let tabCounter = 1

function makeTab() {
  const n = tabCounter++
  return { id: `tab-${n}-${Date.now()}`, title: `Terminal ${n}` }
}

export default function TerminalTabs({ onServerUrlChange, killPortRef, onTerminalHasLogsChange }) {
  const [initialTab] = useState(() => makeTab())
  const [tabs, setTabs] = useState(() => [initialTab])
  const [activeId, setActiveId] = useState(initialTab.id)
  const [serverUrls, setServerUrls] = useState({})
  const runCommandFns = useRef({})
  const tabHasLogsRef = useRef({})

  const updateTabHasLogs = useCallback(
    (tabId, hasLogs) => {
      tabHasLogsRef.current[tabId] = hasLogs
      onTerminalHasLogsChange?.(Object.values(tabHasLogsRef.current).some(Boolean))
    },
    [onTerminalHasLogsChange],
  )

  useEffect(() => {
    onServerUrlChange?.(serverUrls[activeId] ?? null)
  }, [activeId, serverUrls, onServerUrlChange])

  useEffect(() => {
    if (!killPortRef) return
    killPortRef.current = (cmd) => {
      runCommandFns.current[activeId]?.(cmd)
    }
  }, [activeId, killPortRef])

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
        delete tabHasLogsRef.current[id]
        onTerminalHasLogsChange?.(Object.values(tabHasLogsRef.current).some(Boolean))
        return next
      })
    },
    [activeId, onTerminalHasLogsChange],
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
            aria-hidden={tab.id !== activeId}
          >
            <Terminal
              isActive={tab.id === activeId}
              autoStartDev={tab.id === initialTab.id}
              onTitleChange={(title) => updateTabTitle(tab.id, title)}
              onPreviewUrlChange={(url) =>
                setServerUrls((prev) => ({ ...prev, [tab.id]: url }))
              }
              onRegisterRunCommand={(fn) => {
                runCommandFns.current[tab.id] = fn
              }}
              onHasLogsChange={(hasLogs) => updateTabHasLogs(tab.id, hasLogs)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
