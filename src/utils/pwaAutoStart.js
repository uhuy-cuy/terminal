import { initShell, startLaragon } from './shellApi.js'

const SESSION_KEY = 'tw-pwa-autostart-dev'
/** localStorage — cegah banyak tab PWA memulai npm run dev bersamaan */
const DEV_ENSURE_KEY = 'tw-dev-ensure-ts'
const DEV_START_LOCK_KEY = 'tw-dev-start-lock'
const DEV_ENSURE_COOLDOWN_MS = 30 * 60 * 1000
const DEV_START_LOCK_MS = 90 * 1000

/** localStorage — shared antar tab PWA, cegah 8x spawn Laragon */
const LARAGON_ENSURE_KEY = 'tw-laragon-ensure-ts'
const LARAGON_ENSURE_COOLDOWN_MS = 30 * 60 * 1000

export function wasLaragonEnsureRecently() {
  try {
    const ts = Number(localStorage.getItem(LARAGON_ENSURE_KEY))
    return Number.isFinite(ts) && Date.now() - ts < LARAGON_ENSURE_COOLDOWN_MS
  } catch {
    return false
  }
}

export function markLaragonEnsureAttempt() {
  try {
    localStorage.setItem(LARAGON_ENSURE_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/** @deprecated gunakan wasLaragonEnsureRecently */
export function wasLaragonAutoStarted() {
  return wasLaragonEnsureRecently()
}

export function markLaragonAutoStarted() {
  markLaragonEnsureAttempt()
}

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * Init + pastikan Laragon/Apache siap (retry jika backend offline).
 * @returns {Promise<object|null>}
 */
export async function initShellForPwa(options = {}) {
  const wantLaragon = options.ensureLaragon !== false
  const skipEnsure = wasLaragonEnsureRecently()
  const maxWaitMs = options.maxWaitMs ?? 45000
  const startedAt = Date.now()
  let attempt = 0
  let spawnedLaragon = false

  if (wantLaragon && !skipEnsure) {
    markLaragonEnsureAttempt()
  }

  while (Date.now() - startedAt < maxWaitMs) {
    const data = await initShell({
      ensureLaragon: wantLaragon && !skipEnsure && attempt === 0,
    })
    if (data?.ok) {
      if (data.apacheRunning || data.laragon?.started === false) {
        markLaragonEnsureAttempt()
      }
      return data
    }

    attempt += 1
    if (!spawnedLaragon && !wasLaragonEnsureRecently()) {
      spawnedLaragon = true
      markLaragonEnsureAttempt()
      await startLaragon().catch(() => null)
    }

    await sleep(Math.min(2000, 500 + attempt * 300))
  }

  return null
}

/** PWA terpasang / standalone */
export function isPwaStandalone() {
  if (typeof window === 'undefined') return false
  if (window.navigator?.standalone === true) return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  return false
}

export function wasPwaDevAutoStarted() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function markPwaDevAutoStarted() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function isTerminalDevAlreadyRunning(initData) {
  if (!initData) return false
  return !!(
    initData.terminalDevRunning ||
    initData.devProcessRunning ||
    initData.viteRunning
  )
}

export function wasDevEnsureRecently() {
  try {
    const ts = Number(localStorage.getItem(DEV_ENSURE_KEY))
    return Number.isFinite(ts) && Date.now() - ts < DEV_ENSURE_COOLDOWN_MS
  } catch {
    return false
  }
}

export function markDevEnsureAttempt() {
  try {
    localStorage.setItem(DEV_ENSURE_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/** Lock singkat antar tab saat sedang spawn npm run dev */
export function tryAcquireDevAutoStartLock() {
  try {
    const raw = localStorage.getItem(DEV_START_LOCK_KEY)
    const now = Date.now()
    if (raw) {
      const ts = Number(raw)
      if (Number.isFinite(ts) && now - ts < DEV_START_LOCK_MS) {
        return false
      }
    }
    localStorage.setItem(DEV_START_LOCK_KEY, String(now))
    return true
  } catch {
    return true
  }
}

export function resolveAppPath(initData) {
  if (initData?.appPath) {
    return String(initData.appPath).replace(/\\/g, '/')
  }
  const home = String(initData?.home ?? 'C:/laragon/www').replace(/\\/g, '/')
  return `${home.replace(/\/$/, '')}/terminal`
}

/**
 * @param {object} initData
 * @returns {{ start: boolean, reason?: string, appPath?: string, vitePort?: number }}
 */
export function getAutoStartDevPlan(initData) {
  const vitePort = initData?.vitePort ?? 5173

  if (!initData?.ok || initData.mode !== 'real') {
    return { start: false, reason: 'backend offline (mode simulasi)' }
  }
  if (initData.autoStartDevPwa === false) {
    return { start: false, reason: 'auto_start_dev_pwa=false di config' }
  }

  if (isTerminalDevAlreadyRunning(initData)) {
    markPwaDevAutoStarted()
    markDevEnsureAttempt()
    const count = initData.devProcessCount ?? 0
    const reason = initData.devProcessRunning
      ? `npm/node sudah jalan (${count} proses) — tidak auto-start lagi`
      : `vite sudah jalan di port ${vitePort}`
    return {
      start: false,
      reason,
      vitePort,
      alreadyRunning: true,
    }
  }

  if (wasPwaDevAutoStarted()) {
    return { start: false, reason: 'sudah dijalankan tab ini (refresh tidak spawn ulang)' }
  }

  if (wasDevEnsureRecently()) {
    return {
      start: false,
      reason: 'tab lain sudah auto-start dev — tidak spawn npm kedua',
    }
  }

  return {
    start: true,
    appPath: resolveAppPath(initData),
    vitePort,
  }
}
