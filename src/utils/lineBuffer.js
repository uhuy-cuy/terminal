/** Naikkan jika API buffer berubah — memaksa migrasi instance lama (HMR) */
export const LINE_BUFFER_API_VERSION = 1

/** Maks baris di memori; yang lebih lama (log stream) dibuang otomatis */
export const MAX_CACHE_LINES = 8000

/** Interval flush UI saat stream deras */
export const STREAM_FLUSH_MS = 50

/** Flush segera jika buffer stream menumpuk sebanyak ini */
export const STREAM_FLUSH_BATCH = 25

export function createLineBuffer(initialLines = []) {
  let lines = [...initialLines]
  let pendingStream = []
  let jobLineIndex = -1
  let flushTimer = null
  let drainWaiters = []
  const listeners = new Set()

  const notify = () => {
    listeners.forEach((fn) => fn())
  }

  const findJobIndex = (jobId) => {
    if (jobLineIndex >= 0 && jobLineIndex < lines.length) {
      const line = lines[jobLineIndex]
      if ((line.type === 'loading' || line.type === 'running') && line.id === jobId) {
        return jobLineIndex
      }
    }
    jobLineIndex = lines.findIndex(
      (line) => (line.type === 'loading' || line.type === 'running') && line.id === jobId,
    )
    return jobLineIndex
  }

  const trimCache = () => {
    if (lines.length <= MAX_CACHE_LINES) return

    let removed = 0
    const target = MAX_CACHE_LINES
    while (lines.length > target && removed < lines.length) {
      const idx = lines.findIndex(
        (line) => line.type === 'output' && line.stream && !/\[terminal\] ▶ Preview:/.test(line.text),
      )
      if (idx < 0) break
      lines.splice(idx, 1)
      removed += 1
      if (jobLineIndex > idx) jobLineIndex -= 1
    }

    while (lines.length > target) {
      const idx = lines.findIndex((line) => line.type === 'output')
      if (idx < 0) break
      lines.splice(idx, 1)
      if (jobLineIndex > idx) jobLineIndex -= 1
    }
  }

  const resolveDrain = () => {
    if (pendingStream.length > 0 || flushTimer) return
    const waiters = drainWaiters
    drainWaiters = []
    waiters.forEach((fn) => fn())
  }

  const flushPending = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (pendingStream.length === 0) {
      resolveDrain()
      return
    }

    const batch = pendingStream
    pendingStream = []
    const items = batch.map((entry) => {
      if (typeof entry === 'string') {
        return { type: 'output', text: entry, stream: true }
      }
      return {
        type: 'output',
        text: entry.text,
        stream: true,
        ...(entry.error ? { error: true } : {}),
        ...(entry.milestone ? { milestone: true } : {}),
      }
    })

    const idx = jobLineIndex
    if (idx >= 0 && idx < lines.length) {
      const job = lines[idx]
      lines.splice(idx, 1)
      lines.push(...items, job)
      jobLineIndex = lines.length - 1
    } else {
      lines.push(...items)
    }

    trimCache()
    notify()
    resolveDrain()
  }

  const scheduleFlush = (urgent = false) => {
    if (urgent || pendingStream.length >= STREAM_FLUSH_BATCH) {
      flushPending()
      return
    }
    if (flushTimer) return
    flushTimer = setTimeout(flushPending, STREAM_FLUSH_MS)
  }

  const replace = (next) => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pendingStream = []
    lines = typeof next === 'function' ? next(lines) : next
    jobLineIndex = lines.findIndex((line) => line.type === 'loading' || line.type === 'running')
    trimCache()
    notify()
    resolveDrain()
  }

  return {
    apiVersion: LINE_BUFFER_API_VERSION,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getLines() {
      return lines
    },
    get length() {
      return lines.length
    },
    replace,
    update(mutator) {
      replace((prev) => mutator(prev))
    },
    clear() {
      replace([])
    },
    queueStreamLine(text, opts = {}) {
      if (typeof text === 'object' && text !== null && 'text' in text) {
        pendingStream.push(text)
      } else if (opts.error || opts.milestone) {
        pendingStream.push({ text, error: !!opts.error, milestone: !!opts.milestone })
      } else {
        pendingStream.push(text)
      }
      scheduleFlush()
    },
    queueStreamLines(texts) {
      if (!texts?.length) return
      pendingStream.push(...texts)
      scheduleFlush(pendingStream.length >= STREAM_FLUSH_BATCH)
    },
    flushNow() {
      flushPending()
    },
    clearPending() {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      pendingStream = []
      resolveDrain()
    },
    waitForDrain() {
      flushPending()
      if (pendingStream.length === 0 && !flushTimer) {
        return Promise.resolve()
      }
      return new Promise((resolve) => {
        drainWaiters.push(resolve)
      })
    },
    setJobLineIndex(index) {
      jobLineIndex = index
    },
    findJobIndex,
    patchJobLine(jobId, patch) {
      const idx = findJobIndex(jobId)
      if (idx < 0) return
      lines[idx] = { ...lines[idx], ...patch }
      notify()
    },
  }
}
