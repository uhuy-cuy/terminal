import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import TerminalPrompt from './TerminalPrompt'
import {
  createRealState,
  executeCommandAsync,
  getDisplayPath,
  INITIAL_STATE,
} from '../utils/commands'
import { fetchDirListing, initShell, isStreamCommand } from '../utils/shellApi'
import { initShellForPwa } from '../utils/pwaAutoStart'
import {
  getAutoStartDevPlan,
  isTerminalDevAlreadyRunning,
  markDevEnsureAttempt,
  markPwaDevAutoStarted,
  tryAcquireDevAutoStartLock,
} from '../utils/pwaAutoStart'
import {
  buildCdSelection,
  filterEntries,
  isCdCompleteInput,
  listDirSim,
  parseCdInput,
} from '../utils/pathComplete'
import { loadCommandHistory, pushCommandHistory } from '../utils/historyStorage'
import { extractPortFromUrl, extractPreviewUrl, renderTerminalLine } from '../utils/linkify'
import { parsePruneCommand, pruneLineRange, pruneStreamLines } from '../utils/pruneLines'
import { normalizeTerminalInput } from '../utils/normalizeInput'
import { createLineBuffer, LINE_BUFFER_API_VERSION, MAX_CACHE_LINES } from '../utils/lineBuffer'
import {
  bottomWindowStart,
  clampWindowStart,
  maxWindowStart,
  OUTPUT_CHUNK,
  STREAM_EXPAND_MAX,
  STREAM_OUTPUT_CHUNK,
  WATCH_OUTPUT_CHUNK,
} from '../utils/terminalOutput'
import {
  extractBuildErrorHint,
  parseCompileErrorDetail,
  formatElapsed,
  getBuildProgressPercent,
  getBuildTimeMilestone,
  getRunningBarText,
  inferDevPortFromCommand,
  isBuildAtLine,
  isBuildErrorLine,
  isBuildSuccessLine,
  isCompileFailedSummary,
  isWatchReadyLine,
  isErrorContextLine,
  startsCompileErrorBlock,
  stripAnsi,
  isHpmProxyNoiseLine,
  isWatchRebuildLine,
  normalizePreviewUrl,
  isLongRunningCommand,
  isServerReadyLine,
  parseWebpackPhase,
  shouldAdvanceBuildPhase,
} from '../utils/streamHelpers'
import { terminalHasSession } from '../utils/useRefreshGuard'
import CdAutocomplete from './CdAutocomplete'
import './Terminal.css'

export default function Terminal({
  isActive = true,
  onTitleChange,
  onPreviewUrlChange,
  onRegisterRunCommand,
  autoStartDev = false,
  onHasLogsChange,
}) {
  const lineBufRef = useRef(null)
  const needsNewBuffer =
    !lineBufRef.current ||
    lineBufRef.current.apiVersion !== LINE_BUFFER_API_VERSION ||
    typeof lineBufRef.current.patchJobLine !== 'function'

  if (needsNewBuffer) {
    const preserved = lineBufRef.current?.getLines?.() ?? [
      { type: 'output', text: '@tahirwiyan terminal v1.0' },
      { type: 'output', text: 'Menghubungkan ke Laragon...\n' },
    ]
    lineBufRef.current = createLineBuffer(preserved)
  }
  const lineBuf = lineBufRef.current
  const [linesTick, setLinesTick] = useState(0)
  const [input, setInput] = useState('')
  const [state, setState] = useState(() => ({
    ...INITIAL_STATE,
    history: loadCommandHistory(),
  }))
  const [busy, setBusy] = useState(false)
  const [clockTick, setClockTick] = useState(0)
  const [followOutput, setFollowOutput] = useState(true)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [pruneOpen, setPruneOpen] = useState(false)
  const [pruneFrom, setPruneFrom] = useState('1')
  const [pruneTo, setPruneTo] = useState('')
  const [windowStart, setWindowStart] = useState(0)
  const [viewChunkOverride, setViewChunkOverride] = useState(null)
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
  const streamLoadingIdRef = useRef(null)
  const touchStartYRef = useRef(0)
  const windowStartRef = useRef(0)
  const linesLengthRef = useRef(0)
  const windowLockRef = useRef(false)
  const shiftCooldownRef = useRef(0)

  const lines = lineBuf.getLines()
  void linesTick

  const streamActive = lines.some((line) => line.type === 'loading' || line.type === 'running')
  const watchMode = lines.some((line) => line.type === 'running' && line.phase === 'ready')
  void (streamActive ? clockTick : 0)
  const viewChunk =
    viewChunkOverride ??
    (watchMode ? WATCH_OUTPUT_CHUNK : streamActive ? STREAM_OUTPUT_CHUNK : OUTPUT_CHUNK)
  const displayStart = followOutput
    ? bottomWindowStart(lines.length, viewChunk)
    : clampWindowStart(windowStart, lines.length, viewChunk)
  let windowEnd = Math.min(displayStart + viewChunk, lines.length)
  const safeStart =
    windowEnd > displayStart || lines.length === 0
      ? displayStart
      : bottomWindowStart(lines.length, viewChunk)
  if (safeStart !== displayStart) {
    windowEnd = Math.min(safeStart + viewChunk, lines.length)
  }
  windowStartRef.current = safeStart
  linesLengthRef.current = lines.length

  useEffect(() => {
    onHasLogsChange?.(terminalHasSession(lineBuf.getLines()))
  }, [linesTick, lineBuf, onHasLogsChange])

  useEffect(() => {
    let prevLen = lineBuf.length
    return lineBuf.subscribe(() => {
      const len = lineBuf.length
      if (len < prevLen) {
        stickToBottomRef.current = true
        setFollowOutput(true)
        setWindowStart(bottomWindowStart(len, OUTPUT_CHUNK))
      }
      prevLen = len
      setLinesTick((t) => t + 1)
    })
  }, [lineBuf])

  const shiftWindowUp = useCallback(() => {
    if (windowLockRef.current || windowStartRef.current <= 0) return false
    if (Date.now() < shiftCooldownRef.current) return false

    windowLockRef.current = true
    shiftCooldownRef.current = Date.now() + 450
    setWindowStart((s) => Math.max(0, s - OUTPUT_CHUNK))

    requestAnimationFrame(() => {
      const el = terminalRef.current
      if (el) el.scrollTop = 32
      window.setTimeout(() => {
        windowLockRef.current = false
      }, 450)
    })
    return true
  }, [])

  const shiftWindowDown = useCallback(() => {
    const max = maxWindowStart(linesLengthRef.current)
    if (windowLockRef.current || windowStartRef.current >= max) return false
    if (Date.now() < shiftCooldownRef.current) return false

    windowLockRef.current = true
    shiftCooldownRef.current = Date.now() + 450
    setWindowStart((s) => Math.min(max, s + OUTPUT_CHUNK))

    requestAnimationFrame(() => {
      const el = terminalRef.current
      if (el) el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 32)
      window.setTimeout(() => {
        windowLockRef.current = false
      }, 450)
    })
    return true
  }, [])

  const applyPrune = useCallback(
    (from, to) => {
      lineBuf.update((prev) => {
        const { lines: next, message } = pruneLineRange(prev, from, to)
        return [...next, { type: 'output', text: message }, { type: 'spacer' }]
      })
    },
    [lineBuf],
  )

  const handlePruneSubmit = useCallback(() => {
    const from = Number.parseInt(pruneFrom, 10)
    const to = Number.parseInt(pruneTo, 10)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
      lineBuf.update((prev) => [
        ...prev,
        { type: 'output', text: '✗ Rentang tidak valid. Contoh: dari 1 sampai 500' },
        { type: 'spacer' },
      ])
      return
    }
    applyPrune(from, to)
    setPruneOpen(false)
  }, [applyPrune, lineBuf, pruneFrom, pruneTo])

  const finalizeLongRunJob = useCallback(
    (jobId, startedAt, url, lineCount, failed = false, errorHints = []) => {
      setBusy(false)
      streamLoadingIdRef.current = null
      if (url && !failed) setPreviewUrl(url)
      lineBuf.update((prev) => {
        const job = prev.find(
          (line) =>
            (line.type === 'loading' || line.type === 'running') && line.id === jobId,
        )
        const elapsed = formatElapsed(Date.now() - (job?.startedAt ?? startedAt))
        let next = prev.filter(
          (line) => !((line.type === 'loading' || line.type === 'running') && line.id === jobId),
        )
        const count = lineCount > 0 ? lineCount : (job?.lineCount ?? 0)
        const uniqueHints = [...new Set(errorHints.filter(Boolean))]
        next.push({
          type: 'output',
          text: failed
            ? `✗ Gagal · ${elapsed}${count > 0 ? ` · ${count} baris log` : ''}`
            : url
              ? `▶ Server dev jalan · ${elapsed} · ${count} baris log`
              : `▶ Build/serve di background · ${elapsed} · ${count} baris log`,
          ...(failed ? { error: true } : {}),
        })
        if (failed) {
          if (uniqueHints.length > 0) {
            uniqueHints.slice(-5).forEach((hint) => {
              next.push({ type: 'output', text: `✗ ${hint}`, error: true })
            })
          } else {
            next.push({
              type: 'output',
              text: '[terminal] Scroll ke atas — detail error ada di log (sama seperti CMD)',
            })
          }
        }
        const port = url && !failed ? extractPortFromUrl(url) : null
        if (url && !failed && port) {
          next.push({
            type: 'output',
            text: `[terminal] Buka ${url} · cek: running · hentikan: killport ${port}`,
          })
        } else if (url && !failed) {
          next.push({
            type: 'output',
            text: `[terminal] Buka ${url} · cek: running · hentikan: killnode`,
          })
        } else if (!failed) {
          next.push({
            type: 'output',
            text: '[terminal] Cek: running · hentikan: killnode',
          })
        } else if (port) {
          next.push({
            type: 'output',
            text: `[terminal] Port ${port} mungkin masih terpakai — coba: killport ${port}`,
          })
        }
        next.push({ type: 'spacer' })
        return next
      })
    },
    [lineBuf],
  )

  const updateJobPhase = useCallback(
    (jobId, phase) => {
      if (!phase) return
      lineBuf.update((prev) => {
        const idx = lineBuf.findJobIndex(jobId)
        if (idx < 0) return prev
        const job = prev[idx]
        if (!shouldAdvanceBuildPhase(job.phase, phase)) return prev
        const next = [...prev]
        next[idx] = { ...job, phase }
        return next
      })
    },
    [lineBuf],
  )

  const updateLoadingStatus = useCallback(
    (loadingId, text, lineCount = null, startedAt = null) => {
      const patch = { text }
      if (lineCount != null) patch.lineCount = lineCount
      if (startedAt != null) patch.startedAt = startedAt
      lineBuf.patchJobLine(loadingId, patch)
    },
    [lineBuf],
  )

  const cdFetchRef = useRef(0)
  const activeStreamRef = useRef(null)
  const hiddenDuringStreamRef = useRef(false)
  const [shellInit, setShellInit] = useState(null)
  const runCommandRef = useRef(null)
  const autoStartLockRef = useRef(false)

  const finalizeInterruptedStream = useCallback((loadingId, command, startedAt) => {
    if (activeStreamRef.current?.detachTimer) {
      window.clearTimeout(activeStreamRef.current.detachTimer)
    }
    activeStreamRef.current = null
    streamLoadingIdRef.current = null
    lineBuf.clearPending()
    setBusy(false)

    lineBuf.update((prev) => {
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
  }, [lineBuf])

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

    const total = linesLengthRef.current
    const start = windowStartRef.current
    const chunk = lineBuf.getLines().some((l) => l.type === 'loading' || l.type === 'running')
      ? STREAM_OUTPUT_CHUNK
      : OUTPUT_CHUNK
    const atCacheEnd = start >= maxWindowStart(total, chunk)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const atBottom = distanceFromBottom < 48

    stickToBottomRef.current = atBottom && atCacheEnd
    setFollowOutput(atBottom && atCacheEnd)
  }, [])

  useEffect(() => {
    const el = terminalRef.current
    if (!el) return undefined

    const onWheel = (e) => {
      if (e.deltaY < 0) markScrolledUp()

      if (windowLockRef.current || Date.now() < shiftCooldownRef.current) return

      if (e.deltaY < 0 && el.scrollTop <= 2 && windowStartRef.current > 0) {
        if (shiftWindowUp()) e.preventDefault()
        return
      }

      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 2
      const chunk = lineBuf.getLines().some((l) => l.type === 'loading' || l.type === 'running')
        ? STREAM_OUTPUT_CHUNK
        : OUTPUT_CHUNK
      const atCacheEnd = windowStartRef.current >= maxWindowStart(linesLengthRef.current, chunk)
      if (e.deltaY > 0 && atBottom && !atCacheEnd) {
        if (shiftWindowDown()) e.preventDefault()
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [markScrolledUp, shiftWindowUp, shiftWindowDown])

  const jumpToBottom = useCallback(() => {
    stickToBottomRef.current = true
    setFollowOutput(true)
    lineBuf.flushNow()
    setWindowStart(bottomWindowStart(lineBuf.length))
    requestAnimationFrame(() => scrollToBottom(true))
  }, [lineBuf, scrollToBottom])

  const focusInput = useCallback(() => {
    if (!inputRef.current || inputRef.current.disabled) return
    inputRef.current.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    return () => lineBuf.clearPending()
  }, [lineBuf])

  useEffect(() => {
    const id = window.setInterval(() => {
      const job = lineBuf.getLines().find(
        (line) =>
          (line.type === 'loading' || line.type === 'running') &&
          line.command &&
          isLongRunningCommand(line.command) &&
          line.startedAt,
      )
      if (!job) return

      setClockTick((t) => t + 1)

      if (job.phase === 'ready' || job.type === 'running') return

      const sec = Math.floor((Date.now() - job.startedAt) / 1000)
      const milestone = getBuildTimeMilestone(sec)
      if (!milestone) return

      const last = job.lastMilestoneSec ?? 0
      if (milestone.sec <= last) return

      lineBuf.patchJobLine(job.id, {
        lastMilestoneSec: milestone.sec,
        lineCount: job.lineCount,
      })
      lineBuf.queueStreamLine(`[⏱ ${milestone.label}] ${milestone.hint}`, { milestone: true })
      lineBuf.flushNow()
    }, 1000)
    return () => window.clearInterval(id)
  }, [lineBuf])

  useLayoutEffect(() => {
    if (!followOutput && !stickToBottomRef.current) return
    const chunk = lineBuf.getLines().some((l) => l.type === 'loading' || l.type === 'running')
      ? STREAM_OUTPUT_CHUNK
      : OUTPUT_CHUNK
    setWindowStart(bottomWindowStart(lineBuf.length, chunk))
    if (stickToBottomRef.current) scrollToBottom(true)
  }, [linesTick, lineBuf, scrollToBottom, followOutput])

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
      if (document.visibilityState === 'hidden') {
        if (activeStreamRef.current) hiddenDuringStreamRef.current = true
        return
      }
      hiddenDuringStreamRef.current = false
      focusInput()
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

    const boot = autoStartDev
      ? initShellForPwa({ ensureLaragon: true })
      : initShell()

    boot.then((data) => {
      if (!active) return

      const hasUserOutput = lineBuf.getLines().some((line) => line.type === 'prompt')
      if (hasUserOutput) {
        if (data) {
          setState(createRealState(data))
          setShellInit(data)
        }
        focusInput()
        return
      }

      if (data) {
        setState(createRealState(data))
        setShellInit(data)
        const bootLines = [
          { type: 'output', text: '@tahirwiyan terminal v1.0 — mode REAL' },
          { type: 'output', text: `Home: ${data.home} · Akses: seluruh Windows` },
        ]
        if (data.laragon?.message) {
          bootLines.push({ type: 'output', text: `[auto] Laragon: ${data.laragon.message}` })
        }
        bootLines.push({ type: 'output', text: 'Coba: ipconfig · cd D:\\ · git pull\n' })
        lineBuf.replace(bootLines)
      } else {
        lineBuf.replace([
          { type: 'output', text: '@tahirwiyan terminal v1.0 — mode simulasi' },
          {
            type: 'output',
            text: autoStartDev
              ? 'Backend offline — Laragon tidak merespons. Buka Laragon manual lalu refresh.'
              : 'Backend offline. Buka via Laragon untuk path Windows asli.\n',
          },
        ])
      }
      setWindowStart(0)
      focusInput()
    })

    return () => {
      active = false
    }
  }, [autoStartDev, lineBuf])

  useEffect(() => {
    if (!onTitleChange || !state.realMode) return
    const label = getDisplayPath(state.cwd, state.home)
    onTitleChange(label.length > 18 ? `…${label.slice(-17)}` : label)
  }, [state.cwd, state.home, state.realMode, onTitleChange])

  useEffect(() => {
    if (isActive) focusInput()
  }, [isActive, focusInput])

  useEffect(() => {
    onPreviewUrlChange?.(previewUrl)
  }, [previewUrl, onPreviewUrlChange])

  const runCommand = useCallback(
    async (cmd, options = {}) => {
      const trimmed = normalizeTerminalInput(cmd.trim())
      if (!trimmed) {
        lineBuf.update((prev) => [...prev, { type: 'prompt', command: '' }])
        return
      }

      if (/^lines$/i.test(trimmed)) {
        lineBuf.update((prev) => [
          ...prev,
          { type: 'prompt', command: trimmed },
          {
            type: 'output',
            text: `Total baris di cache: ${prev.length} (maks ${MAX_CACHE_LINES}) · tampil ${OUTPUT_CHUNK} baris`,
          },
          { type: 'spacer' },
        ])
        return
      }

      if (/^(killport|kp|killnode|kn)\b/i.test(trimmed) && !state.realMode) {
        lineBuf.update((prev) => [
          ...prev,
          { type: 'prompt', command: trimmed },
          {
            type: 'output',
            text: 'killport/killnode hanya tersedia di mode REAL — nyalakan Laragon lalu refresh.',
          },
          { type: 'spacer' },
        ])
        return
      }

      const pruneArgs = parsePruneCommand(trimmed)
      if (pruneArgs) {
        lineBuf.update((prev) => {
          const promptLine = { type: 'prompt', command: trimmed }
          if (pruneArgs.mode === 'stream') {
            const { lines: next, message } = pruneStreamLines(prev)
            return [...next, promptLine, { type: 'output', text: message }, { type: 'spacer' }]
          }
          const { lines: next, message } = pruneLineRange(prev, pruneArgs.from, pruneArgs.to)
          return [...next, promptLine, { type: 'output', text: message }, { type: 'spacer' }]
        })
        return
      }

      const loadingId = `load-${Date.now()}`
      const startedAt = Date.now()
      streamLoadingIdRef.current = loadingId
      lineBuf.clearPending()
      setViewChunkOverride(null)

      const execState = options.execCwd ? { ...state, cwd: options.execCwd } : state
      const newHistory = pushCommandHistory(execState.history, trimmed)
      historyNavRef.current = -1
      stickToBottomRef.current = true
      setFollowOutput(true)
      setBusy(true)

      let streamedLineCount = 0
      let streamFailed = false
      let serverReady = false
      let compileFailed = false
      let buildErrorHints = []
      let lastErrorBannerAt = 0
      let lastErrorBannerKey = ''
      let errorCtxRemaining = 0
      let compileErrorBlock = 0
      const recentStreamLines = []
      const RECENT_LINE_MAX = 50
      let longRunFinalized = false
      let assignedPort = null
      let commandLogStart = 0
      let buildActivated = false
      let delegatedToCmd = false

      const softActivateDevServer = (preview) => {
        if (buildActivated) return
        buildActivated = true
        serverReady = true
        if (preview) {
          lastPreviewUrl = preview
          setPreviewUrl(preview)
        }
        setBusy(false)
        streamLoadingIdRef.current = null
        lineBuf.patchJobLine(loadingId, {
          type: 'running',
          phase: 'ready',
          lineCount: streamedLineCount,
        })
        const port = preview ? extractPortFromUrl(preview) : null
        lineBuf.queueStreamLine(
          preview
            ? `[terminal] ✓ Watch mode aktif · ${preview} · simpan file = rebuild otomatis`
            : '[terminal] ✓ Watch mode aktif — simpan file = rebuild otomatis',
        )
        lineBuf.flushNow()
      }

      const pushErrorHint = (text) => {
        const hint = extractBuildErrorHint(text)
        if (!hint) return
        buildErrorHints.push(hint)
        if (buildErrorHints.length > 12) buildErrorHints.shift()
      }

      const safeFinalizeLongRun = (url, failed = streamFailed) => {
        if (longRunFinalized) return
        longRunFinalized = true

        if (buildActivated || serverReady) {
          const preview = url || resolvePreviewUrl()
          if (preview) setPreviewUrl(preview)
          lineBuf.patchJobLine(loadingId, {
            type: 'running',
            phase: 'ready',
            lineCount: streamedLineCount,
          })
          lineBuf.queueStreamLine(
            preview
              ? `[terminal] ✓ Watch mode — npm tetap jalan di ${preview} · simpan file = rebuild otomatis`
              : '[terminal] ✓ Watch mode — npm tetap jalan · simpan file = rebuild otomatis',
          )
          lineBuf.flushNow()
          setBusy(false)
          return
        }

        finalizeLongRunJob(loadingId, startedAt, url, streamedLineCount, failed, buildErrorHints)
      }

      const expandLogWindowAfterStream = () => {
        lineBuf.flushNow()
        const total = lineBuf.length
        const cmdLines = Math.max(0, total - commandLogStart)
        if (cmdLines <= STREAM_EXPAND_MAX) {
          setViewChunkOverride(Math.max(cmdLines, OUTPUT_CHUNK))
          setWindowStart(commandLogStart)
          setFollowOutput(false)
          stickToBottomRef.current = false
        } else {
          setViewChunkOverride(STREAM_OUTPUT_CHUNK)
          setWindowStart(Math.max(commandLogStart, total - STREAM_OUTPUT_CHUNK))
          setFollowOutput(false)
          stickToBottomRef.current = false
          lineBuf.queueStreamLine(
            `[terminal] ${cmdLines} baris log npm — scroll ↑ untuk awal build atau gunakan prune`,
          )
        }
      }

      const resolvePreviewUrl = () =>
        normalizePreviewUrl(
          lastPreviewUrl || inferDevPortFromCommand(trimmed, assignedPort) || previewUrl,
          assignedPort,
        )

      let lastPreviewUrl = null
      if (isLongRunningCommand(trimmed)) {
        setPreviewUrl(null)
      }

      const isStream = state.realMode && isStreamCommand(trimmed, state.aliases)
      const abortController = isStream ? new AbortController() : null

      if (isStream && abortController) {
        activeStreamRef.current = {
          abortController,
          loadingId,
          command: trimmed,
          startedAt,
          detachTimer: null,
        }
      }

      lineBuf.update((prev) => {
        commandLogStart = prev.length
        const next = [
          ...prev,
          { type: 'prompt', command: trimmed },
          {
            type: 'loading',
            id: loadingId,
            text: 'Memproses',
            command: trimmed,
            lineCount: 0,
            startedAt,
          },
        ]
        lineBuf.setJobLineIndex(next.length - 1)
        return next
      })

      try {
        const result = await executeCommandAsync(trimmed, { ...execState, history: newHistory }, {
          signal: abortController?.signal,
          onMeta: (msg) => {
            if (msg.delegatedToCmd) delegatedToCmd = true
            if (msg.assignedPort) {
              assignedPort = Number(msg.assignedPort)
              const url = inferDevPortFromCommand(trimmed, assignedPort)
              if (url) {
                lastPreviewUrl = url
                setPreviewUrl(url)
              }
            }
          },
          onStart: () => {
            updateLoadingStatus(loadingId, 'Menjalankan perintah', streamedLineCount, startedAt)
          },
          onStatus: (text) => {
            if (isLongRunningCommand(trimmed) && /^⏳ Streaming output/i.test(text)) {
              return
            }
            updateLoadingStatus(loadingId, text.replace(/\(\d+s\)\.\.\.$/, ''), streamedLineCount, startedAt)
          },
          onLine: (text) => {
            const cleanText = stripAnsi(text)
            streamedLineCount += 1

            if (delegatedToCmd) {
              lineBuf.queueStreamLine(cleanText)
              return
            }

            recentStreamLines.push(cleanText)
            if (recentStreamLines.length > RECENT_LINE_MAX) recentStreamLines.shift()

            if (buildActivated && isHpmProxyNoiseLine(cleanText)) {
              return
            }

            if (startsCompileErrorBlock(cleanText)) {
              compileErrorBlock = 12
              errorCtxRemaining = Math.max(errorCtxRemaining, 12)
            } else if (compileErrorBlock > 0) {
              compileErrorBlock -= 1
            }

            const scanRecentErrorDetail = () => {
              for (let i = recentStreamLines.length - 1; i >= 0; i -= 1) {
                const detail = parseCompileErrorDetail(recentStreamLines[i])
                if (detail) return detail
              }
              return null
            }

            const emitErrorBanner = (detail, fallbackHint) => {
              const bannerKey = detail?.location || fallbackHint || 'compile-error'
              if (bannerKey === lastErrorBannerKey) return
              lastErrorBannerKey = bannerKey
              lastErrorBannerAt = Date.now()
              if (detail?.file && detail.line != null) {
                lineBuf.queueStreamLine(
                  `[terminal] ✗ ${detail.file} · baris ${detail.line}${
                    detail.col != null ? ` kolom ${detail.col}` : ''
                  }${detail.code ? ` · ${detail.code}` : ''}${
                    detail.message ? ` — ${detail.message.slice(0, 120)}` : ''
                  }`,
                  { error: true },
                )
              } else if (detail) {
                lineBuf.queueStreamLine(`[terminal] ✗ ${detail.summary}`, { error: true })
              } else if (fallbackHint) {
                lineBuf.queueStreamLine(`[terminal] ✗ ${fallbackHint}`, { error: true })
              }
            }

            const isFailedSummary = isCompileFailedSummary(cleanText)
            if (isFailedSummary) {
              errorCtxRemaining = 24
              compileFailed = true
              if (!buildActivated && !serverReady) {
                streamFailed = true
                updateJobPhase(loadingId, 'error')
              } else {
                lineBuf.patchJobLine(loadingId, { phase: 'ready', compileError: true })
              }

              const detail = scanRecentErrorDetail()
              if (detail) {
                pushErrorHint(detail.summary)
                emitErrorBanner(detail)
              } else if (!recentStreamLines.some((l) => parseCompileErrorDetail(l))) {
                lineBuf.queueStreamLine(
                  '[terminal] ✗ Failed to compile — scroll ke atas untuk file · baris · TS code',
                  { error: true },
                )
                lastErrorBannerKey = 'failed-compile'
              }
            }

            const inErrorCtx = errorCtxRemaining > 0
            if (inErrorCtx) errorCtxRemaining -= 1

            const isErrorLine =
              isBuildErrorLine(cleanText) ||
              compileErrorBlock > 0 ||
              (inErrorCtx && isErrorContextLine(cleanText))

            if (buildActivated && isWatchRebuildLine(cleanText) && !isErrorLine) {
              updateJobPhase(loadingId, 'building')
            }

            if (isErrorLine && !isFailedSummary) {
              compileFailed = true
              const detail = parseCompileErrorDetail(cleanText)
              const hint = detail?.summary || extractBuildErrorHint(cleanText)
              pushErrorHint(hint)
              if (!serverReady && !buildActivated) {
                streamFailed = true
                updateJobPhase(loadingId, 'error')
              } else {
                lineBuf.patchJobLine(loadingId, { phase: 'ready', compileError: true })
              }
              if (hint) {
                updateLoadingStatus(loadingId, hint, streamedLineCount, startedAt)
              }
              const now = Date.now()
              const bannerKey = detail?.location || hint || text.slice(0, 80)
              const shouldBanner =
                detail ||
                ((serverReady || buildActivated) && now - lastErrorBannerAt > 3000) ||
                (!serverReady && !buildActivated && detail)

              if (shouldBanner && bannerKey !== lastErrorBannerKey) {
                lastErrorBannerAt = now
                lastErrorBannerKey = bannerKey
                if (detail?.file && detail.line != null) {
                  lineBuf.queueStreamLine(
                    `[terminal] ✗ ${detail.file} · baris ${detail.line}${
                      detail.col != null ? ` kolom ${detail.col}` : ''
                    }${detail.code ? ` · ${detail.code}` : ''}${
                      detail.message ? ` — ${detail.message.slice(0, 100)}` : ''
                    }`,
                    { error: true },
                  )
                } else if (detail) {
                  lineBuf.queueStreamLine(`[terminal] ✗ ${detail.summary}`, { error: true })
                } else {
                  lineBuf.queueStreamLine(
                    `[terminal] ⚠ ${hint || 'Compile error'} — perbaiki file lalu simpan`,
                    { error: true },
                  )
                }
                lineBuf.patchJobLine(loadingId, { lineCount: streamedLineCount })
              }
            }

            if (isBuildSuccessLine(cleanText)) {
              compileFailed = false
              errorCtxRemaining = 0
              compileErrorBlock = 0
              lastErrorBannerKey = ''
              if (buildActivated) {
                lineBuf.patchJobLine(loadingId, { phase: 'ready', compileError: false })
              } else {
                updateJobPhase(loadingId, 'compiled')
              }
            }

            if (buildActivated && isBuildAtLine(cleanText)) {
              updateJobPhase(loadingId, 'ready')
              lineBuf.queueStreamLine('[terminal] ✓ Rebuild selesai', { milestone: true })
            }

            if (/EADDRINUSE|address already in use/i.test(text)) {
              streamFailed = true
            }
            if (/\[exit code:/i.test(text)) {
              const isLongRun = isLongRunningCommand(trimmed)
              const exitMatch = text.match(/\[exit code:\s*(\d+)\]/i)
              const exitCode = exitMatch ? Number.parseInt(exitMatch[1], 10) : 0
              const serverAlive =
                /Server masih aktif|Server tetap jalan/i.test(text) ||
                (isLongRun && (serverReady || lastPreviewUrl))
              if (!serverAlive || exitCode !== 0) streamFailed = true
              if (exitCode !== 0 && !buildErrorHints.length) {
                pushErrorHint(`Proses berhenti dengan exit code ${exitCode}`)
              }
            }
            if (/Server masih aktif|Server tetap jalan/i.test(text)) {
              streamFailed = false
            }

            const url = normalizePreviewUrl(extractPreviewUrl(cleanText, assignedPort), assignedPort)
            if (url) {
              lastPreviewUrl = url
              if (!compileFailed || serverReady) setPreviewUrl(url)
            }
            const phase = parseWebpackPhase(cleanText)
            if (phase) updateJobPhase(loadingId, phase)

            lineBuf.queueStreamLine(cleanText, { error: isErrorLine })
            lineBuf.patchJobLine(loadingId, { lineCount: streamedLineCount })
            if (isServerReadyLine(cleanText)) {
              serverReady = true
            }

            if (
              isLongRunningCommand(trimmed) &&
              isWatchReadyLine(trimmed, cleanText) &&
              !compileFailed &&
              !streamFailed
            ) {
              softActivateDevServer(resolvePreviewUrl())
            }
          },
          onClear: () => {
            lineBuf.clearPending()
            lineBuf.clear()
            setWindowStart(0)
            stickToBottomRef.current = true
            setFollowOutput(true)
          },
        })

        if (result.delegatedToCmd) {
          await lineBuf.waitForDrain()
          lineBuf.flushNow()
          lineBuf.update((prev) => {
            const rest = prev.filter(
              (line) => !((line.type === 'loading' || line.type === 'running') && line.id === loadingId),
            )
            return [...rest, { type: 'spacer' }]
          })
          setState({ ...result.newState, history: newHistory, historyIndex: -1 })
          return
        }

        if (result.cancelled) {
          if (activeStreamRef.current?.loadingId === loadingId) {
            activeStreamRef.current = null
          }
          if (isLongRunningCommand(trimmed)) {
            safeFinalizeLongRun(resolvePreviewUrl())
            setState({ ...result.newState ?? state, history: newHistory, historyIndex: -1 })
          }
          return
        }

        if (result.disconnected && isLongRunningCommand(trimmed)) {
          await lineBuf.waitForDrain()
          if (hiddenDuringStreamRef.current) {
            lineBuf.queueStreamLine(
              '[terminal] Setelah sleep: ketik `running` untuk cek server',
            )
            lineBuf.flushNow()
          }
          expandLogWindowAfterStream()
          safeFinalizeLongRun(resolvePreviewUrl())
          await lineBuf.waitForDrain()
          setState({ ...result.newState, history: newHistory, historyIndex: -1 })
          return
        }

        if (result.clear) {
          lineBuf.clearPending()
          lineBuf.clear()
          setWindowStart(0)
          stickToBottomRef.current = true
          setFollowOutput(true)
          setState({ ...result.newState, history: newHistory, historyIndex: -1 })
          return
        }

        if (!result.streamed && result.output.length > 0) {
          const instant = result.output.length <= 200
          if (instant) {
            lineBuf.clearPending()
            lineBuf.update((prev) => {
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
            lineBuf.queueStreamLines(result.output)
            await lineBuf.waitForDrain()
          }
        } else {
          await lineBuf.waitForDrain()
        }

        if (isLongRunningCommand(trimmed)) {
          expandLogWindowAfterStream()
          safeFinalizeLongRun(resolvePreviewUrl())
        } else {
          lineBuf.update((prev) => {
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
        }

        setState({ ...result.newState, history: newHistory, historyIndex: -1 })

        if (
          /^(killport|kp|killnode|kn)\b/i.test(trimmed) &&
          result.output?.some((l) => /Port \d+ bebas|Semua proses node|\/\d+ proses dihentikan/i.test(l))
        ) {
          setPreviewUrl(null)
          lineBuf.update((prev) => prev.filter((line) => line.type !== 'running'))
        }
      } catch (err) {
        if (abortController?.signal.aborted) {
          if (isLongRunningCommand(trimmed)) {
            safeFinalizeLongRun(resolvePreviewUrl())
          }
          return
        }
        lineBuf.queueStreamLine(err?.message || 'Perintah gagal')
        await lineBuf.waitForDrain()
        lineBuf.update((prev) =>
          prev.filter((line) => !((line.type === 'loading' || line.type === 'running') && line.id === loadingId)),
        )
      } finally {
        if (activeStreamRef.current?.loadingId === loadingId) {
          activeStreamRef.current = null
        }
        lineBuf.flushNow()
        stickToBottomRef.current = true
        setFollowOutput(true)
        const finalLen = lineBuf.getLines().length
        setWindowStart(bottomWindowStart(finalLen, OUTPUT_CHUNK))
        setBusy(false)
      }
    },
    [state, lineBuf, finalizeLongRunJob, updateJobPhase, updateLoadingStatus, previewUrl],
  )

  useEffect(() => {
    runCommandRef.current = runCommand
    onRegisterRunCommand?.(runCommand)
  }, [runCommand, onRegisterRunCommand])

  useEffect(() => {
    if (!autoStartDev || !shellInit || autoStartLockRef.current) return

    const plan = getAutoStartDevPlan(shellInit)
    if (!plan.start) {
      autoStartLockRef.current = true
      if (plan.alreadyRunning && plan.vitePort) {
        lineBuf.update((prev) => [
          ...prev,
          {
            type: 'output',
            text: `[auto] ${plan.reason} — http://localhost:${plan.vitePort}/`,
          },
          { type: 'spacer' },
        ])
        setPreviewUrl(`http://localhost:${plan.vitePort}/`)
      } else if (plan.reason) {
        lineBuf.update((prev) => [
          ...prev,
          { type: 'output', text: `[auto] Lewati npm run dev — ${plan.reason}` },
          { type: 'spacer' },
        ])
      }
      return
    }

    autoStartLockRef.current = true

    const runAutoStart = async (attempt = 0) => {
      const fn = runCommandRef.current
      if (!fn) {
        if (attempt < 20) {
          window.setTimeout(() => runAutoStart(attempt + 1), 150)
        } else {
          lineBuf.update((prev) => [
            ...prev,
            { type: 'output', text: '[auto] Gagal memulai npm run dev — terminal belum siap' },
            { type: 'spacer' },
          ])
        }
        return
      }

      const fresh = await initShell()
      if (isTerminalDevAlreadyRunning(fresh)) {
        markPwaDevAutoStarted()
        markDevEnsureAttempt()
        const port = fresh?.vitePort ?? plan.vitePort ?? 5173
        lineBuf.update((prev) => [
          ...prev,
          {
            type: 'output',
            text: `[auto] npm/node sudah jalan — tidak spawn ulang · http://localhost:${port}/`,
          },
          { type: 'spacer' },
        ])
        setPreviewUrl(`http://localhost:${port}/`)
        return
      }

      if (!tryAcquireDevAutoStartLock()) {
        markPwaDevAutoStarted()
        markDevEnsureAttempt()
        lineBuf.update((prev) => [
          ...prev,
          {
            type: 'output',
            text: '[auto] Tab lain sedang memulai npm run dev — tidak spawn kedua',
          },
          { type: 'spacer' },
        ])
        return
      }

      markPwaDevAutoStarted()
      markDevEnsureAttempt()
      const laragonNote = shellInit?.laragon?.message ? ` · ${shellInit.laragon.message}` : ''
      lineBuf.update((prev) => [
        ...prev,
        {
          type: 'output',
          text: `[auto] Memulai npm run dev di ${plan.appPath}${laragonNote}`,
        },
        { type: 'spacer' },
      ])
      fn('npm run dev', { execCwd: plan.appPath })
    }

    window.setTimeout(() => {
      runAutoStart()
    }, 300)
  }, [autoStartDev, shellInit, lineBuf, setPreviewUrl])

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
      lineBuf.clear()
      setWindowStart(0)
      stickToBottomRef.current = true
      setFollowOutput(true)
      return
    }

    if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault()
      if (interruptActiveStream()) return
      lineBuf.update((prev) => [
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

  const hiddenAbove = safeStart
  const hiddenBelow = lines.length - windowEnd

  return (
    <div
      className="terminal"
      ref={terminalRef}
      onScroll={handleTerminalScroll}
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
        if (e.target.closest('.window-hint')) return
        if (e.target.closest('.terminal-toolbar')) return
        if (e.target.closest('.terminal-scrollbar')) return
        focusInput()
      }}
    >
      <div className="terminal-toolbar">
        <button
          type="button"
          className="toolbar-btn"
          onClick={(e) => {
            e.stopPropagation()
            setPruneOpen((v) => !v)
            if (!pruneTo) setPruneTo(String(lines.length))
          }}
          title="Hapus baris log"
        >
          🗑 Hapus baris
        </button>
        {pruneOpen && (
          <div className="prune-panel" onClick={(e) => e.stopPropagation()}>
            <span className="prune-panel-label">
              Cache {lines.length} baris · jendela {viewChunk} baris
            </span>
            <label className="prune-field">
              Dari
              <input
                type="number"
                min={1}
                max={lines.length}
                value={pruneFrom}
                onChange={(e) => setPruneFrom(e.target.value)}
              />
            </label>
            <label className="prune-field">
              Sampai
              <input
                type="number"
                min={1}
                max={lines.length}
                value={pruneTo}
                onChange={(e) => setPruneTo(e.target.value)}
              />
            </label>
            <button type="button" className="prune-apply" onClick={handlePruneSubmit}>
              Hapus
            </button>
            <button
              type="button"
              className="prune-stream"
              onClick={() => {
                lineBuf.update((prev) => {
                  const { lines: next, message } = pruneStreamLines(prev)
                  return [...next, { type: 'output', text: message }, { type: 'spacer' }]
                })
                setPruneOpen(false)
              }}
            >
              Log npm
            </button>
          </div>
        )}
      </div>

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
        {hiddenAbove > 0 && (
          <button
            type="button"
            className="window-hint window-hint--top"
            onClick={(e) => {
              e.stopPropagation()
              shiftWindowUp()
            }}
          >
            ↑ {hiddenAbove} baris di cache — klik untuk muat
          </button>
        )}
        {lines.slice(safeStart, windowEnd).map((line, offset) => {
          const i = safeStart + offset
          const lineNo = i + 1
          if (line.type === 'prompt') {
            return (
              <div key={i} className="line line-prompt" data-line={lineNo}>
                <TerminalPrompt {...promptProps} />
                <span className="typed-command">{line.command}</span>
              </div>
            )
          }
          if (line.type === 'spacer') return <div key={i} className="line-spacer" data-line={lineNo} />
          if (line.type === 'loading' || line.type === 'running') {
            const elapsed = line.startedAt ? formatElapsed(Date.now() - line.startedAt) : '00:00'
            const elapsedMs = line.startedAt ? Date.now() - line.startedAt : 0
            const isNg = line.command && isLongRunningCommand(line.command)
            const statusText = isNg
              ? getRunningBarText(elapsedMs, line.command, line.phase, line.compileError)
              : line.text || 'Memproses'
            const isLive = line.type === 'running' && line.phase === 'ready'
            const progress =
              isNg && !isLive && line.phase !== 'error'
                ? getBuildProgressPercent(elapsedMs, line.phase)
                : null
            const isError = line.phase === 'error'
            return (
              <div
                key={line.id ?? i}
                className={`line ${isLive ? 'line-running line-running--live' : 'line-loading'}${isError ? ' line-loading--error' : ''}`}
                data-line={lineNo}
              >
                {isLive ? <span className="running-dot" /> : <span className="loading-spinner" />}
                <span className={isLive ? 'running-text' : 'loading-text'}>
                  <span>{statusText}</span>
                  {!isLive && <span className="loading-dots">...</span>}
                  {!isLive && line.lineCount > 0 && (
                    <span className="running-count"> · {line.lineCount} baris log</span>
                  )}
                </span>
                {!isLive && <span className="loading-timer">{elapsed}</span>}
              </div>
            )
          }
          return (
            <div
              key={i}
              data-line={lineNo}
              className={`line line-output${line.stream ? ' line-output--stream' : ''}${line.error ? ' line-output--error' : ''}${line.milestone ? ' line-output--milestone' : ''}${/\[terminal\] ▶ Preview:/.test(line.text) ? ' line-output--preview' : ''}`}
            >
              {renderTerminalLine(line.text, { error: line.error })}
            </div>
          )
        })}

        {hiddenBelow > 0 && (
          <button
            type="button"
            className="window-hint window-hint--bottom"
            onClick={(e) => {
              e.stopPropagation()
              shiftWindowDown()
            }}
          >
            ↓ {hiddenBelow} baris lebih baru — klik untuk muat
          </button>
        )}

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
              autoFocus={isActive}
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
