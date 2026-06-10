import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import TerminalPrompt from './TerminalPrompt'
import {
  createRealState,
  executeCommandAsync,
  INITIAL_STATE,
} from '../utils/commands'
import { initShell, fetchDirListing, isStreamCommand } from '../utils/shellApi'
import {
  buildCdSelection,
  filterEntries,
  isCdCompleteInput,
  listDirSim,
  parseCdInput,
} from '../utils/pathComplete'
import { loadCommandHistory, pushCommandHistory } from '../utils/historyStorage'
import { extractPreviewUrl, renderLinkified } from '../utils/linkify'
import { formatElapsed, getRunningBarText, isLongRunningCommand, isServerReadyLine, parseWebpackPhase } from '../utils/streamHelpers'
import CdAutocomplete from './CdAutocomplete'
import './Terminal.css'

export default function Terminal() {
  const [lines, setLines] = useState([
    { type: 'output', text: '@tahirwiyan terminal v1.0' },
    { type: 'output', text: 'Menghubungkan ke Laragon...\n' },
  ])
  const [input, setInput] = useState('')
  const [state, setState] = useState(() => ({
    ...INITIAL_STATE,
    history: loadCommandHistory(),
  }))
  const [busy, setBusy] = useState(false)
  const [clockTick, setClockTick] = useState(0)
  const [followOutput, setFollowOutput] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [cdOpen, setCdOpen] = useState(false)
  const [cdLoading, setCdLoading] = useState(false)
  const [cdEntries, setCdEntries] = useState([])
  const [cdListPath, setCdListPath] = useState('')
  const [cdSelected, setCdSelected] = useState(0)
  const inputRef = useRef(null)
  const measureRef = useRef(null)
  const terminalRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const historyNavRef = useRef(-1)
  const streamQueueRef = useRef([])
  const streamTimerRef = useRef(null)
  const streamLoadingIdRef = useRef(null)
  const streamFinishRef = useRef(null)
  const touchStartYRef = useRef(0)

  const clearStreamPump = useCallback(() => {
    if (streamTimerRef.current) {
      clearTimeout(streamTimerRef.current)
      streamTimerRef.current = null
    }
    streamQueueRef.current = []
    streamFinishRef.current = null
  }, [])

  const tryCompleteStream = useCallback(() => {
    if (streamQueueRef.current.length > 0 || streamTimerRef.current) return
    streamFinishRef.current?.()
    streamFinishRef.current = null
  }, [])

  const appendStreamLine = useCallback((text, jobId) => {
    setLines((prev) => {
      const jobLine = prev.find(
        (line) =>
          (line.type === 'loading' || line.type === 'running') && line.id === jobId,
      )
      const rest = prev.filter(
        (line) => !((line.type === 'loading' || line.type === 'running') && line.id === jobId),
      )
      return [
        ...rest,
        { type: 'output', text, stream: true },
        ...(jobLine ? [jobLine] : []),
      ]
    })
  }, [])

  const detachToRunning = useCallback((jobId, command, reason = 'ready', url = null) => {
    setBusy(false)
    streamLoadingIdRef.current = null
    if (url) setPreviewUrl(url)
    setLines((prev) =>
      prev.map((line) => {
        if (line.type === 'loading' && line.id === jobId) {
          const label =
            reason === 'ready'
              ? 'Server siap — proses masih jalan di background'
              : 'Build/serve masih berjalan — input terminal bebas dipakai'
          return {
            type: 'running',
            id: jobId,
            text: label,
            command,
            previewUrl: url,
            startedAt: line.startedAt ?? Date.now(),
            lineCount: line.lineCount ?? 0,
            phase: line.phase ?? null,
          }
        }
        return line
      }),
    )
  }, [])

  const pumpStreamQueue = useCallback(() => {
    if (streamTimerRef.current) return

    const step = () => {
      const next = streamQueueRef.current.shift()
      if (!next) {
        streamTimerRef.current = null
        tryCompleteStream()
        return
      }

      appendStreamLine(next, streamLoadingIdRef.current)

      const backlog = streamQueueRef.current.length
      const delay = backlog > 200 ? 2 : backlog > 80 ? 5 : backlog > 30 ? 10 : 18

      streamTimerRef.current = setTimeout(() => {
        streamTimerRef.current = null
        step()
      }, delay)
    }

    streamTimerRef.current = setTimeout(step, 0)
  }, [appendStreamLine, tryCompleteStream])

  const enqueueStreamLines = useCallback(
    (lines) => {
      if (!lines?.length) return
      streamQueueRef.current.push(...lines)
      pumpStreamQueue()
    },
    [pumpStreamQueue],
  )

  const waitForStreamDrain = useCallback(() => {
    if (streamQueueRef.current.length === 0 && !streamTimerRef.current) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      streamFinishRef.current = resolve
    })
  }, [])

  const updateJobPhase = useCallback((jobId, phase) => {
    if (!phase) return
    setLines((prev) =>
      prev.map((line) =>
        (line.type === 'loading' || line.type === 'running') && line.id === jobId
          ? { ...line, phase }
          : line,
      ),
    )
  }, [])

  const updateLoadingStatus = useCallback((loadingId, text, lineCount = null, startedAt = null) => {
    setLines((prev) =>
      prev.map((line) =>
        line.type === 'loading' && line.id === loadingId
          ? {
              ...line,
              text,
              lineCount: lineCount ?? line.lineCount,
              startedAt: startedAt ?? line.startedAt,
            }
          : line,
      ),
    )
  }, [])

  const cdFetchRef = useRef(0)
  const activeStreamRef = useRef(null)

  const finalizeInterruptedStream = useCallback((loadingId, command, startedAt) => {
    if (activeStreamRef.current?.detachTimer) {
      window.clearTimeout(activeStreamRef.current.detachTimer)
    }
    activeStreamRef.current = null
    streamLoadingIdRef.current = null
    clearStreamPump()
    setBusy(false)

    setLines((prev) => {
      const next = prev.filter(
        (line) => !((line.type === 'loading' || line.type === 'running') && line.id === loadingId),
      )
      next.push({ type: 'output', text: '^C' })
      if (command) {
        next.push({ type: 'output', text: `[dihentikan] ${command}` })
      }
      if (startedAt) {
        next.push({
          type: 'output',
          text: `✗ Dibatalkan · ${formatElapsed(Date.now() - startedAt)}`,
        })
      }
      next.push({ type: 'spacer' })
      return next
    })
    setInput('')
    historyNavRef.current = -1
  }, [clearStreamPump])

  const interruptActiveStream = useCallback(() => {
    const active = activeStreamRef.current
    if (!active) return false
    active.abortController.abort()
    finalizeInterruptedStream(active.loadingId, active.command, active.startedAt)
    return true
  }, [finalizeInterruptedStream])

  const closeCdComplete = useCallback(() => {
    setCdOpen(false)
    setCdEntries([])
    setCdSelected(0)
  }, [])

  const selectCdEntry = useCallback(
    (entry) => {
      const parsed = parseCdInput(input)
      if (!parsed) return

      if (entry.name === '..') {
        const rel = parsed.relativePath.replace(/\\/g, '/').replace(/\/+$/, '')
        const parts = rel.split('/').filter(Boolean)
        parts.pop()
        const next = parts.length === 0 ? 'cd ' : `cd ${parts.join('/')}/`
        setInput(next)
        setCdSelected(0)
        return
      }

      const next = buildCdSelection(parsed.inputPrefix, entry.name, entry.type)
      setInput(next)
      setCdSelected(0)

      if (entry.type === 'file') {
        closeCdComplete()
      }
    },
    [input, closeCdComplete],
  )

  useEffect(() => {
    if (busy || !isCdCompleteInput(input)) {
      closeCdComplete()
      return undefined
    }

    const parsed = parseCdInput(input)
    if (!parsed) {
      closeCdComplete()
      return undefined
    }

    setCdOpen(true)

    const fetchId = ++cdFetchRef.current
    const timer = window.setTimeout(async () => {
      setCdLoading(true)
      try {
        let data
        if (state.realMode) {
          data = await fetchDirListing(state.cwd, parsed.relativePath)
        } else {
          data = listDirSim(state.fs, state.cwd, state.home, parsed.relativePath)
        }

        if (fetchId !== cdFetchRef.current) return

        if (!data.ok) {
          setCdEntries([])
          setCdListPath(data.error || 'Tidak dapat membuka folder')
          return
        }

        const filtered = filterEntries(data.entries ?? [], parsed.filter)
        setCdEntries(filtered)
        setCdListPath(data.path || state.cwd)
        setCdSelected(0)
      } catch {
        if (fetchId !== cdFetchRef.current) return
        setCdEntries([])
        setCdListPath('Gagal memuat direktori')
      } finally {
        if (fetchId === cdFetchRef.current) setCdLoading(false)
      }
    }, 120)

    return () => window.clearTimeout(timer)
  }, [input, state.cwd, state.fs, state.home, state.realMode, busy, closeCdComplete])

  const scrollToBottom = useCallback((force = false) => {
    const el = terminalRef.current
    if (!el) return
    if (!force && !stickToBottomRef.current) return
    el.scrollTop = el.scrollHeight
  }, [])

  const markScrolledUp = useCallback(() => {
    if (stickToBottomRef.current) {
      stickToBottomRef.current = false
      setFollowOutput(false)
    }
  }, [])

  const handleTerminalScroll = useCallback(() => {
    const el = terminalRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 80
    stickToBottomRef.current = atBottom
    setFollowOutput(atBottom)
  }, [])

  const handleTerminalWheel = useCallback(
    (e) => {
      if (e.deltaY < 0) markScrolledUp()
    },
    [markScrolledUp],
  )

  const jumpToBottom = useCallback(() => {
    stickToBottomRef.current = true
    setFollowOutput(true)
    scrollToBottom(true)
  }, [scrollToBottom])

  const focusInput = useCallback(() => {
    if (!inputRef.current || inputRef.current.disabled) return
    inputRef.current.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    return () => clearStreamPump()
  }, [clearStreamPump])

  useEffect(() => {
    const hasTimer = lines.some((line) => line.type === 'loading' || line.type === 'running')
    if (!hasTimer) return undefined
    const id = window.setInterval(() => setClockTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [lines])

  useLayoutEffect(() => {
    scrollToBottom()
  }, [lines, scrollToBottom])

  useEffect(() => {
    if (measureRef.current) {
      measureRef.current.textContent = input || '\u00A0'
    }
  }, [input])

  useEffect(() => {
    focusInput()
    const id = window.requestAnimationFrame(focusInput)
    return () => window.cancelAnimationFrame(id)
  }, [focusInput])

  useEffect(() => {
    if (!busy) focusInput()
  }, [busy, focusInput])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') focusInput()
    }

    const onKeyDown = (e) => {
      if (e.key === 'c' && e.ctrlKey && activeStreamRef.current) {
        e.preventDefault()
        interruptActiveStream()
        return
      }

      if (!inputRef.current || inputRef.current.disabled) return
      if (document.activeElement === inputRef.current) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.metaKey || e.altKey) return

      focusInput()

      if (e.key.length === 1 && !e.ctrlKey) {
        e.preventDefault()
        setInput((prev) => prev + e.key)
      }
    }

    window.addEventListener('focus', focusInput)
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('focus', focusInput)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [focusInput, interruptActiveStream])

  useEffect(() => {
    let active = true

    initShell().then((data) => {
      if (!active) return

      if (data) {
        setState(createRealState(data))
        setLines([
          { type: 'output', text: '@tahirwiyan terminal v1.0 — mode REAL' },
          { type: 'output', text: `Home: ${data.home} · Akses: seluruh Windows` },
          { type: 'output', text: 'Coba: ipconfig · cd D:\\ · git pull\n' },
        ])
      } else {
        setLines([
          { type: 'output', text: '@tahirwiyan terminal v1.0 — mode simulasi' },
          { type: 'output', text: 'Backend offline. Buka via Laragon untuk path Windows asli.\n' },
        ])
      }
      focusInput()
    })

    return () => {
      active = false
    }
  }, [])

  const runCommand = useCallback(
    async (cmd) => {
      const trimmed = cmd.trim()
      if (!trimmed) {
        setLines((prev) => [...prev, { type: 'prompt', command: '' }])
        return
      }

      const loadingId = `load-${Date.now()}`
      const startedAt = Date.now()
      streamLoadingIdRef.current = loadingId
      clearStreamPump()
      streamLoadingIdRef.current = loadingId

      const newHistory = pushCommandHistory(state.history, trimmed)
      historyNavRef.current = -1
      stickToBottomRef.current = true
      setFollowOutput(true)
      setBusy(true)

      let streamedLineCount = 0
      let detached = false
      let streamFailed = false

      let lastPreviewUrl = null
      setPreviewUrl(null)

      const tryDetach = (reason, url = null) => {
        if (detached) return
        detached = true
        const resolvedUrl = url || lastPreviewUrl
        if (resolvedUrl) setPreviewUrl(resolvedUrl)
        detachToRunning(loadingId, trimmed, reason, resolvedUrl)
      }

      const isStream = state.realMode && isStreamCommand(trimmed, state.aliases)
      const abortController = isStream ? new AbortController() : null

      const detachTimer =
        isLongRunningCommand(trimmed)
          ? window.setTimeout(() => tryDetach('background'), 6000)
          : null

      if (isStream && abortController) {
        activeStreamRef.current = {
          abortController,
          loadingId,
          command: trimmed,
          startedAt,
          detachTimer,
        }
      }

      setLines((prev) => [
        ...prev,
        { type: 'prompt', command: trimmed },
        { type: 'loading', id: loadingId, text: 'Memproses', lineCount: 0, startedAt },
      ])

      try {
        const result = await executeCommandAsync(trimmed, { ...state, history: newHistory }, {
          signal: abortController?.signal,
          onStart: () => {
            updateLoadingStatus(loadingId, 'Menjalankan perintah', streamedLineCount, startedAt)
            if (isLongRunningCommand(trimmed)) {
              appendStreamLine(
                '[info] Fase setup/building webpack bisa 2-4 menit tanpa log baru — sama seperti CMD, tunggu chunk files.',
                loadingId,
              )
            }
          },
          onStatus: (text) => {
            if (detached) return
            updateLoadingStatus(loadingId, text.replace(/\(\d+s\)\.\.\.$/, ''), streamedLineCount, startedAt)
          },
          onLine: (text) => {
            streamedLineCount += 1
            if (/EADDRINUSE|address already in use|\[exit code: [1-9]/i.test(text)) {
              streamFailed = true
            }
            const url = extractPreviewUrl(text)
            if (url) {
              lastPreviewUrl = url
              setPreviewUrl(url)
            }
            const phase = parseWebpackPhase(text)
            if (phase) updateJobPhase(loadingId, phase)
            appendStreamLine(text, loadingId)
            if (isServerReadyLine(text)) {
              tryDetach('ready', url)
            }
          },
          onClear: () => {
            clearStreamPump()
            setLines([])
          },
        })

        if (detachTimer) window.clearTimeout(detachTimer)

        if (result.cancelled) {
          if (activeStreamRef.current?.loadingId === loadingId) {
            activeStreamRef.current = null
          }
          return
        }

        if (result.clear) {
          clearStreamPump()
          setLines([])
          setState({ ...result.newState, history: newHistory, historyIndex: -1 })
          return
        }

        if (!result.streamed && result.output.length > 0) {
          const instant = result.output.length <= 200
          if (instant) {
            clearStreamPump()
            setLines((prev) => {
              const rest = prev.filter(
                (line) => !((line.type === 'loading' || line.type === 'running') && line.id === loadingId),
              )
              return [
                ...rest,
                ...result.output.map((text) => ({ type: 'output', text })),
              ]
            })
          } else {
            updateLoadingStatus(loadingId, `Menampilkan output (${result.output.length} baris)`, null, startedAt)
            enqueueStreamLines(result.output)
            await waitForStreamDrain()
          }
        } else {
          await waitForStreamDrain()
        }

        setLines((prev) => {
          const job = prev.find(
            (line) =>
              (line.type === 'loading' || line.type === 'running') && line.id === loadingId,
          )
          let next = prev.filter(
            (line) => !((line.type === 'loading' || line.type === 'running') && line.id === loadingId),
          )

          if (job?.startedAt ?? startedAt) {
            const elapsed = formatElapsed(Date.now() - (job?.startedAt ?? startedAt))
            next.push({
              type: 'output',
              text: streamFailed ? `✗ Gagal · ${elapsed}` : `✓ Selesai · ${elapsed}`,
            })
          }

          if (result.streamed || result.output.length > 0) {
            next.push({ type: 'spacer' })
          }

          return next
        })

        setState({ ...result.newState, history: newHistory, historyIndex: -1 })
      } catch (err) {
        if (detachTimer) window.clearTimeout(detachTimer)
        if (abortController?.signal.aborted) {
          return
        }
        appendStreamLine(err?.message || 'Perintah gagal', loadingId)
        await waitForStreamDrain()
        setLines((prev) =>
          prev.filter((line) => !((line.type === 'loading' || line.type === 'running') && line.id === loadingId)),
        )
      } finally {
        if (activeStreamRef.current?.loadingId === loadingId) {
          activeStreamRef.current = null
        }
        clearStreamPump()
        setBusy(false)
      }
    },
    [
      state,
      clearStreamPump,
      appendStreamLine,
      detachToRunning,
      enqueueStreamLines,
      interruptActiveStream,
      updateJobPhase,
      updateLoadingStatus,
      waitForStreamDrain,
    ],
  )

  const handleKeyDown = (e) => {
    if (busy) return

    const cdActive = cdOpen && cdEntries.length > 0

    if (cdActive && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      setCdSelected((prev) => {
        if (e.key === 'ArrowUp') return prev <= 0 ? cdEntries.length - 1 : prev - 1
        return prev >= cdEntries.length - 1 ? 0 : prev + 1
      })
      return
    }

    if (cdActive && e.key === 'Tab') {
      e.preventDefault()
      selectCdEntry(cdEntries[cdSelected])
      return
    }

    if (e.key === 'Escape' && cdOpen) {
      e.preventDefault()
      closeCdComplete()
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = input
      setInput('')
      closeCdComplete()
      runCommand(cmd)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (state.history.length === 0) return
      const idx =
        historyNavRef.current === -1
          ? state.history.length - 1
          : Math.max(0, historyNavRef.current - 1)
      historyNavRef.current = idx
      setInput(state.history[idx])
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyNavRef.current === -1) return
      const idx = historyNavRef.current + 1
      if (idx >= state.history.length) {
        historyNavRef.current = -1
        setInput('')
      } else {
        historyNavRef.current = idx
        setInput(state.history[idx])
      }
      return
    }

    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
      return
    }

    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      if (interruptActiveStream()) return
      setLines((prev) => [
        ...prev,
        { type: 'prompt', command: input + '^C' },
        { type: 'output', text: '' },
      ])
      setInput('')
      historyNavRef.current = -1
      return
    }
  }

  const promptProps = {
    cwd: state.cwd,
    user: state.user,
    hostname: state.hostname,
    home: state.home,
    gitBranch: state.gitBranch,
    realMode: state.realMode,
  }

  return (
    <div
      className="terminal"
      ref={terminalRef}
      onScroll={handleTerminalScroll}
      onWheel={handleTerminalWheel}
      onTouchStart={(e) => {
        touchStartYRef.current = e.touches[0]?.clientY ?? 0
      }}
      onTouchMove={(e) => {
        const y = e.touches[0]?.clientY ?? 0
        if (y > touchStartYRef.current + 8) markScrolledUp()
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        if (e.target.closest('.input-area')) return
        if (e.target.closest('.scroll-bottom-btn')) return
        if (e.target.closest('.terminal-scrollbar')) return
        focusInput()
      }}
    >
      {!followOutput && (
        <button
          type="button"
          className="scroll-bottom-btn"
          onClick={jumpToBottom}
          title="Ke output terbaru"
        >
          ↓ Output terbaru
        </button>
      )}
      <div className="terminal-body">
        {lines.map((line, i) => {
          if (line.type === 'prompt') {
            return (
              <div key={i} className="line line-prompt">
                <TerminalPrompt {...promptProps} />
                <span className="typed-command">{line.command}</span>
              </div>
            )
          }
          if (line.type === 'spacer') return <div key={i} className="line-spacer" />
          if (line.type === 'loading') {
            const elapsed = line.startedAt ? formatElapsed(Date.now() - line.startedAt) : '00:00'
            return (
              <div key={line.id ?? i} className="line line-loading">
                <span className="loading-spinner" />
                <span className="loading-text">{line.text}</span>
                <span className="loading-timer">{elapsed}</span>
              </div>
            )
          }
          if (line.type === 'running') {
            const elapsed = line.startedAt ? formatElapsed(Date.now() - line.startedAt) : '00:00'
            const elapsedMs = line.startedAt ? Date.now() - line.startedAt : 0
            const statusText = getRunningBarText(elapsedMs, line.command || '', line.phase)
            const runUrl = line.previewUrl || previewUrl
            return (
              <div key={line.id ?? i} className="line line-running">
                <span className="running-dot" />
                <span className="running-text">
                  {statusText}
                  {line.command && <span className="running-cmd"> · {line.command}</span>}
                  {runUrl && (
                    <a
                      href={runUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="term-link term-link--preview"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {' '}
                      · Buka {runUrl}
                    </a>
                  )}
                </span>
                <span className="loading-timer">{elapsed}</span>
              </div>
            )
          }
          return (
            <div
              key={i}
              className={`line line-output${line.stream ? ' line-output--stream' : ''}${/\[terminal\] ▶ Preview:/.test(line.text) ? ' line-output--preview' : ''}`}
            >
              {renderLinkified(line.text)}
            </div>
          )
        })}

        <div className="line line-active">
          <TerminalPrompt {...promptProps} />
          <span className="input-area input-area--complete">
            <CdAutocomplete
              open={cdOpen}
              loading={cdLoading}
              listPath={cdListPath}
              entries={cdEntries}
              selectedIndex={cdSelected}
              onSelect={selectCdEntry}
              onHover={setCdSelected}
            />
            <span ref={measureRef} className="input-measure" aria-hidden="true" />
            <input
              ref={inputRef}
              className="terminal-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              disabled={busy}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Terminal input"
            />
          </span>
        </div>
      </div>
    </div>
  )
}
