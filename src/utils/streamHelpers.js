export function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function isLongRunningCommand(cmd) {
  const trimmed = cmd.trim()
  return /^(npm\s+(run\s+)?(start|serve|dev)|npx\s+ng\s+serve|ng\s+serve|yarn\s+(start|dev|serve)|pnpm\s+(start|dev|serve)|php\s+artisan\s+serve|node\s+scripts\/)/i.test(
    trimmed,
  )
}

/** Angular: server listen dulu, webpack compile belakangan — BUKAN sinyal selesai */
export function isAngularWarmingLine(text) {
  return /Angular Live Development Server is listening on/i.test(text) && /:\d+/.test(text)
}

export function isBuildAtLine(text) {
  return /Build at:.*Time:\s*\d+ms/i.test(text)
}

/** Log proxy Angular — bukan error, membanjiri UI watch mode */
export function isHpmProxyNoiseLine(text) {
  return /^\[HPM\]/i.test(text.trim())
}

export function isWatchRebuildLine(text) {
  return /Generating browser application bundles|Compiling|File change detected|rebuilding/i.test(text)
}

export function isViteReadyLine(text) {
  return /Local:\s*https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i.test(text)
    || /\bready in \d+/i.test(text)
}

/** Server benar-benar siap — tanpa Preview awal (listening ≠ compile selesai) */
export function isDevServerReadyLine(text) {
  return isBuildAtLine(text) || isViteReadyLine(text)
}

export function isAngularDevCommand(command) {
  return /\b(npm(\s+run)?\s+(start|serve)|ng\s+serve|npx\s+ng\s+serve)\b/i.test(command || '')
}

/** Kapan watch mode aktif — Angular: tunggu Build at, Vite: Local/ready */
export function isWatchReadyLine(command, text) {
  if (isViteReadyLine(text)) return true
  if (isAngularDevCommand(command)) return isBuildAtLine(text)
  return isDevServerReadyLine(text)
}

export function normalizePreviewUrl(url, assignedPort = null) {
  if (!url && assignedPort) return `http://localhost:${assignedPort}/`
  if (!url) return null
  try {
    const raw = url.includes('://') ? url : `http://${url}`
    const parsed = new URL(raw)
    const host = parsed.hostname.toLowerCase()
    if (!['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) {
      return url
    }
    const port = parsed.port || assignedPort || '4201'
    return `http://localhost:${port}/`
  } catch {
    if (assignedPort) return `http://localhost:${assignedPort}/`
    return null
  }
}

/** @deprecated gunakan isDevServerReadyLine */
export function isAngularBuildDoneLine(text) {
  return isDevServerReadyLine(text)
}

/** Baris tabel chunk webpack/Angular — ribuan baris ini membekukan UI */
export function isWebpackChunkTableLine(text) {
  const t = text.trim()
  if (!t || /Build at:/i.test(t)) return false
  if (/Initial Chunk Files|Lazy Chunk Files|Entrypoint|chunk \{files/i.test(t)) return true
  if (/^[│|]/.test(t) && /\.(js|css|mjs)\b/i.test(t)) return true
  if (/\.(js|css|mjs)\s+[│|]\s*[\w.-]*\s+[│|]\s*[\d.]+\s*(kB|MB|bytes)/i.test(t)) return true
  if (/^default-[\w.-]+\.(js|css)\s+[│|]/i.test(t)) return true
  if (/^(?:src_|default-|common|vendor|polyfills|runtime|main|styles)[\w.-]*\.(js|css|mjs)$/i.test(t)) {
    return true
  }
  if (/^[\d.,]+\s*(kB|MB|GB|bytes)\s*$/i.test(t)) return true
  return false
}

/** Output webpack --verbose (harmony stats) — bukan sinyal server siap */
export function isWebpackVerboseNoiseLine(text) {
  const t = text.trim()
  if (!t) return false
  if (/^chunk \{/.test(t)) return true
  if (/harmony (?:side effect evaluation|import specifier)/i.test(t)) return true
  if (/from origin|dependent modules|\[used exports unknown\]/i.test(t)) return true
  if (/^\d+ reasons$/i.test(t)) return true
  if (/^\[built\] \[code generated\]/i.test(t)) return true
  if (/CommonJS bailout:/i.test(t)) return true
  if (/^cjs (?:require|self)/i.test(t)) return true
  if (/^Warning: Running a server with --disable-host-check/i.test(t)) return true
  return false
}

export function inferDevPortFromCommand(command, assignedPort = null) {
  if (assignedPort) return `http://localhost:${assignedPort}/`
  const m = command.match(/--port[=\s]+(\d+)/i)
  if (m) return `http://localhost:${m[1]}/`
  if (/\bng\s+serve\b/i.test(command)) return 'http://localhost:4201/'
  if (/\bnpm\s+(run\s+)?(start|dev|serve)\b/i.test(command)) return 'http://localhost:4201/'
  return null
}

export function isServerReadyLine(text) {
  return isDevServerReadyLine(text)
}

const SOURCE_FILE_RE = String.raw`[\w./\\@-]+\.(?:tsx?|jsx?|mjs|cjs|html|scss|sass|css|json)`

/** Hapus ANSI (warna CMD) — cegah kotak merah aneh di browser */
export function stripAnsi(text) {
  if (!text) return text
  return String(text)
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[(@-Z\\-_]/g, '')
    .replace(/\x9b[0-9;]*[ -/]*[@-~]/g, '')
}

export function isErrorCaretLine(text) {
  const t = stripAnsi(text)
  return /^[\s~^]+$/.test(t) && /[~^]/.test(t)
}

/** Baris kode di bawah error Angular: `1662     getFoo(): string {` */
export function isAngularCodeGutterLine(text) {
  const t = stripAnsi(text).trim()
  return /^\d{1,6}\s+\S/.test(t)
}

export function startsCompileErrorBlock(text) {
  const t = stripAnsi(text).trim()
  if (!t) return false
  if (parseCompileErrorDetail(t)) return true
  if (/^Error:\s+/i.test(t)) return true
  if (/^ERROR in /i.test(t)) return true
  if (/\berror (?:TS|NG)\d+:/i.test(t)) return true
  return false
}

/** Parse lokasi error Angular/TS/webpack — file, baris, kolom, kode */
export function parseCompileErrorDetail(text) {
  const t = text.trim()
  if (!t) return null

  const make = (file, line, col, code, message) => {
    const cleanFile = file.replace(/^\.\//, '').replace(/\\/g, '/')
    const lineNo = line != null ? Number(line) : null
    const colNo = col != null ? Number(col) : null
    const loc =
      lineNo != null
        ? `${cleanFile}:${lineNo}${colNo != null ? `:${colNo}` : ''}`
        : cleanFile
    const shortMsg = (message || '').trim().replace(/\s+/g, ' ')
    let summary = cleanFile
    if (lineNo != null) {
      summary = `${cleanFile} baris ${lineNo}`
      if (colNo != null) summary += ` kolom ${colNo}`
    }
    if (code) summary += ` · ${code}`
    if (shortMsg) summary += ` — ${shortMsg.slice(0, 120)}`

    return {
      file: cleanFile,
      line: lineNo,
      col: colNo,
      code: code || null,
      message: shortMsg || null,
      location: loc,
      summary,
    }
  }

  let m = t.match(
    new RegExp(
      `^Error:\\s*(${SOURCE_FILE_RE}):(\\d+):(\\d+)\\s*-\\s*(?:error\\s+)?((?:TS|NG)\\d+):\\s*(.+)$`,
      'i',
    ),
  )
  if (m) return make(m[1], m[2], m[3], m[4].toUpperCase(), m[5])

  m = t.match(
    new RegExp(
      `^(${SOURCE_FILE_RE}):(\\d+):(\\d+)\\s*-\\s*(?:error\\s+)?((?:TS|NG)\\d+):\\s*(.+)$`,
      'i',
    ),
  )
  if (m) return make(m[1], m[2], m[3], m[4].toUpperCase(), m[5])

  m = t.match(new RegExp(`^(${SOURCE_FILE_RE}):(\\d+):(\\d+)\\b`))
  if (m && /(?:error|TS\d+|NG\d+)/i.test(t)) {
    const code = t.match(/\b((?:TS|NG)\d+)\b/i)?.[1]?.toUpperCase() ?? null
    const msg = t.match(/(?:TS|NG)\d+:\s*(.+)$/i)?.[1] ?? t
    return make(m[1], m[2], m[3], code, msg)
  }

  m = t.match(new RegExp(`ERROR in\\s+(${SOURCE_FILE_RE})`, 'i'))
  if (m) return make(m[1], null, null, null, t)

  m = t.match(/Can't resolve '([^']+)'\s+in\s+'([^']+)'/i)
  if (m) {
    const dir = m[2].replace(/\\/g, '/')
    return {
      file: dir,
      line: null,
      col: null,
      code: 'MODULE',
      message: `Can't resolve '${m[1]}'`,
      location: dir,
      summary: `Import tidak ditemukan '${m[1]}' · folder: ${dir}`,
    }
  }

  m = t.match(/Module not found: (?:Error: )?Can't resolve '([^']+)'/i)
  if (m) {
    return {
      file: null,
      line: null,
      col: null,
      code: 'MODULE',
      message: `Can't resolve '${m[1]}'`,
      location: m[1],
      summary: `Modul tidak ditemukan: ${m[1]}`,
    }
  }

  return null
}

/** Baris error kompilasi / npm — sama seperti yang CMD tampilkan merah */
export function isBuildErrorLine(text) {
  const t = text.trim()
  if (!t) return false
  if (parseCompileErrorDetail(t)) return true
  if (new RegExp(`${SOURCE_FILE_RE}:\\d+:\\d+`).test(t) && /error/i.test(t)) return true
  if (/^(npm ERR!|npm error)/i.test(t)) return true
  if (/^Error:\s+/i.test(t) && !/0 errors/i.test(t)) return true
  if (/Failed to compile|Compilation failed|Failed to build/i.test(t)) return true
  if (/ERROR in /i.test(t)) return true
  if (/\berror TS\d+:/i.test(t)) return true
  if (/\bNG\d+:/i.test(t)) return true
  if (/Module not found|Can't resolve|Cannot find module/i.test(t)) return true
  if (/An unhandled exception occurred/i.test(t)) return true
  if (/SyntaxError:|ReferenceError:|TypeError:/i.test(t)) return true
  if (/ENOMEM|out of memory|heap out of memory/i.test(t)) return true
  if (/EADDRINUSE|address already in use/i.test(t)) return true
  if (/fatal:/i.test(t)) return true
  if (/[✖×]\s/.test(t) && /fail|error|compile/i.test(t)) return true
  return false
}

export function isBuildSuccessLine(text) {
  return /[√✓✔]\s*Compiled successfully|compiled successfully/i.test(text)
}

/** Ringkasan gagal Angular — detail file ada di baris berikutnya */
export function isCompileFailedSummary(text) {
  const t = text.trim()
  return /^[×✗x]\s*Failed to compile/i.test(t) || /^Failed to compile\.?$/i.test(t)
}

/** Baris detail error — header, snippet kode, caret (seperti CMD) */
export function isErrorContextLine(text) {
  const t = stripAnsi(text).trim()
  if (!t) return false
  if (isCompileFailedSummary(t)) return true
  if (parseCompileErrorDetail(t)) return true
  if (startsCompileErrorBlock(t)) return true
  if (/^Error:/i.test(t)) return true
  if (/^(ERROR|Error) in /i.test(t)) return true
  if (/\berror TS\d+:/i.test(t)) return true
  if (/\bNG\d+:/i.test(t)) return true
  if (/Module not found|Can't resolve/i.test(t)) return true
  if (isErrorCaretLine(text)) return true
  if (isAngularCodeGutterLine(text)) return true
  if (/^\s*\d+\s*\|/.test(text)) return true
  if (/unexpected token|SyntaxError/i.test(t)) return true
  return false
}

/** Ringkasan singkat penyebab error untuk status bar & footer */
export function extractBuildErrorHint(text) {
  const detail = parseCompileErrorDetail(text)
  if (detail) return detail.summary

  const t = text.trim()
  if (/EADDRINUSE|address already in use/i.test(t)) {
    const port = t.match(/:(\d+)/)?.[1]
    return port
      ? `Port ${port} sudah dipakai — coba: killport ${port}`
      : 'Port sudah dipakai — coba: killport 4201'
  }
  if (/Module not found|Can't resolve|Cannot find module/i.test(t)) {
    const mod = t.match(/'([^']+)'/)?.[1] || t.match(/"([^"]+)"/)?.[1]
    return mod ? `Modul tidak ditemukan: ${mod}` : 'Modul tidak ditemukan — cek import/path'
  }
  if (/\berror TS\d+:/i.test(t)) return t.replace(/\s+/g, ' ').slice(0, 160)
  if (/\bNG\d+:/i.test(t)) return t.replace(/\s+/g, ' ').slice(0, 160)
  if (/Failed to compile/i.test(t)) return 'Kompilasi gagal — lihat baris error di atas'
  if (/^npm ERR!/i.test(t)) return t.replace(/^npm ERR!\s*/i, '').slice(0, 160)
  if (/^Error:/i.test(t)) return t.slice(0, 160)
  if (/ERROR in /i.test(t)) return t.slice(0, 160)
  if (/out of memory|heap out of memory/i.test(t)) {
    return 'Node kehabisan memori — tutup npm start lain atau naikkan NODE_OPTIONS=--max-old-space-size'
  }
  return t.replace(/\s+/g, ' ').slice(0, 160)
}

/** Urutan fase — angka lebih tinggi = lebih maju, tidak boleh mundur */
export const BUILD_PHASE_RANK = {
  error: 0,
  setup: 1,
  building: 2,
  'emitting chunks': 3,
  compiled: 4,
  warming: 4,
  'build complete': 5,
  'server listening': 6,
  ready: 7,
}

export function parseWebpackPhase(text) {
  if (isBuildErrorLine(text)) return 'error'
  const match = text.match(/\(phase:\s*([^)]+)\)/i)
  if (match) return match[1].trim().toLowerCase()
  if (isAngularWarmingLine(text)) return 'warming'
  if (isBuildAtLine(text)) return 'build complete'
  if (/Application bundle generation complete/i.test(text)) return 'emitting chunks'
  if (/[√✓✔]\s*Compiled|compiled successfully/i.test(text)) return 'compiled'
  if (/Generating browser application bundles|Compiling|building modules/i.test(text)) return 'building'
  if (/Generating localized bundles|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(text)) return 'building'
  if (/harmony import|from origin|dependency graph/i.test(text)) return 'building'
  if (/Generating browser application bundles/i.test(text)) return 'setup'
  if (/bundle generation complete/i.test(text)) return 'emitting chunks'
  if (/\[rendered\]|\[built\]|split chunk|chunk \{/.test(text)) return 'emitting chunks'
  if (/Initial Chunk Files|Lazy Chunk Files/i.test(text)) return 'emitting chunks'
  if (/\d+ unchanged chunks/i.test(text)) return 'emitting chunks'
  return null
}

export function shouldAdvanceBuildPhase(current, next) {
  if (!next) return false
  if (!current) return true
  if (next === 'error') return true
  const curRank = BUILD_PHASE_RANK[current] ?? 0
  const nextRank = BUILD_PHASE_RANK[next] ?? 0
  return nextRank >= curRank
}

/** @deprecated gunakan getRunningBarText */
export function getBuildStatusHint(elapsedMs, phase = null) {
  return getRunningBarText(elapsedMs, 'npm start', phase)
}

/** Milestone waktu — dipakai status bar & log [⏱] setiap fase berjalan */
export const BUILD_TIME_MILESTONES = [
  { sec: 10, label: '0:10', hint: 'npm start jalan — webpack memuat config' },
  { sec: 20, label: '0:20', hint: 'Startup dev server — output pertama segera muncul' },
  { sec: 30, label: '0:30', hint: 'Fase awal — proxy & plugin webpack loading' },
  { sec: 45, label: '0:45', hint: 'Setup webpack — indexing modul (log bisa sedikit)' },
  { sec: 60, label: '1:00', hint: '1 menit — kompilasi dimulai, jeda tanpa log = normal di CMD' },
  { sec: 90, label: '1:30', hint: '1,5 menit — webpack compile file TypeScript/Angular' },
  { sec: 120, label: '2:00', hint: '2 menit — fase terlama, sabar seperti CMD' },
  { sec: 150, label: '2:30', hint: '2,5 menit — chunk files biasanya mulai muncul di log' },
  { sec: 180, label: '3:00', hint: '3 menit — hampir selesai, tunggu Build at / chunk table' },
  { sec: 240, label: '4:00', hint: '4 menit — build berat tapi masih wajar untuk project besar' },
  { sec: 300, label: '5:00', hint: '5 menit — jika stuck: killnode lalu npm start lagi' },
]

export function getBuildTimeMilestone(sec) {
  let current = null
  for (const m of BUILD_TIME_MILESTONES) {
    if (sec >= m.sec) current = m
    else break
  }
  return current
}

export function getNextBuildMilestone(sec) {
  return BUILD_TIME_MILESTONES.find((m) => m.sec > sec) ?? null
}

/** Persen progress — sinkron dengan fase aktual, 100% hanya saat server siap */
export function getBuildProgressPercent(elapsedMs, phase = null) {
  const sec = Math.floor(elapsedMs / 1000)
  if (phase === 'error') return 5
  if (phase === 'ready') return 100
  if (phase === 'build complete') return 95
  if (phase === 'warming') return 85
  if (phase === 'compiled') return 82
  if (phase === 'emitting chunks') return 72

  const milestone = getBuildTimeMilestone(sec)
  if (milestone) {
    return Math.min(88, Math.round((milestone.sec / 180) * 85) + 5)
  }
  return Math.min(12, 3 + sec)
}

/** Satu pesan status — berubah tiap milestone waktu (1 menit, 2 menit, dst) */
export function getRunningBarText(elapsedMs, command = '', phase = null, compileError = false) {
  const isNg = isLongRunningCommand(command)
  if (!isNg) {
    return 'Proses masih berjalan — input terminal bebas dipakai'
  }

  const sec = Math.floor(elapsedMs / 1000)
  const milestone = getBuildTimeMilestone(sec)
  const next = getNextBuildMilestone(sec)
  const eta = next ? ` → berikutnya ${next.label}` : ''

  if (phase === 'error') {
    return '✗ Error compile — cek file · baris · kolom di log merah'
  }
  if (phase === 'ready') {
    if (compileError) {
      return '⚠ Compile error · server tetap jalan · perbaiki file lalu simpan'
    }
    return `✓ Watch mode · ${formatElapsed(elapsedMs)} · simpan file = rebuild otomatis`
  }
  if (phase === 'warming') {
    return `⏱ ${milestone?.label ?? formatElapsed(elapsedMs)} — Server listen, webpack masih compile${eta}`
  }
  if (phase === 'build complete') {
    return `✓ Build at · ${formatElapsed(elapsedMs)} — menyelesaikan...`
  }
  if (phase === 'compiled') {
    return `⏱ ${milestone?.label ?? formatElapsed(elapsedMs)} — compile OK, tunggu chunk & server${eta}`
  }
  if (phase === 'emitting chunks') {
    return `⏱ ${milestone?.label ?? formatElapsed(elapsedMs)} — chunk files muncul di log${eta}`
  }
  if (phase === 'building') {
    return `⏱ ${milestone?.label ?? formatElapsed(elapsedMs)} — ${milestone?.hint ?? 'kompilasi webpack'}${eta}`
  }
  if (phase === 'setup') {
    return `⏱ ${milestone?.label ?? formatElapsed(elapsedMs)} — ${milestone?.hint ?? 'setup webpack'}${eta}`
  }

  if (milestone) {
    return `⏱ ${milestone.label} — ${milestone.hint}${eta}`
  }
  return 'Memulai npm start...'
}
