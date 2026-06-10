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

export function isServerReadyLine(text) {
  return /\[terminal\] ▶ Preview:|listening on|compiled successfully|webpack compiled|Angular Live Development Server|bundle generation complete|Initial Chunk Files|Lazy Chunk Files|Local:\s*http|ready in \d/i.test(
    text,
  )
}

export function parseWebpackPhase(text) {
  const match = text.match(/\(phase:\s*([^)]+)\)/i)
  if (match) return match[1].trim().toLowerCase()
  if (/Generating browser application bundles/i.test(text)) return 'setup'
  if (/bundle generation complete/i.test(text)) return 'build complete'
  if (/listening on/i.test(text)) return 'server listening'
  if (/Initial Chunk Files/i.test(text)) return 'build complete'
  return null
}

export function getBuildStatusHint(elapsedMs, phase = null) {
  const sec = Math.floor(elapsedMs / 1000)

  if (phase) {
    const key = phase.toLowerCase()
    const phaseHints = {
      setup: 'Fase setup — webpack index modul (1-3 menit, CMD juga diam di sini)',
      building: 'Fase building — compile ribuan file (paling lama)',
      sealing: 'Fase sealing — hampir selesai, chunk files segera muncul',
      emitting: 'Fase emitting — menulis bundle ke disk',
      'build complete': 'Build selesai — dev server starting...',
      'server listening': 'Server siap — buka browser',
    }
    return phaseHints[key] || `Webpack fase: ${phase}`
  }

  if (sec < 20) {
    return 'Memulai dev server...'
  }
  if (sec < 90) {
    return 'Kompilasi webpack — jeda tanpa log = normal di fase setup/building'
  }
  if (sec < 180) {
    return 'Masih kompilasi Angular (2-3 menit wajar, sama seperti CMD)'
  }
  if (sec < 300) {
    return 'Build berat — tunggu sampai muncul chunk files'
  }
  return 'RAM/Node penuh? Tutup npm start lama: taskkill /IM node.exe /F'
}

export function getRunningBarText(elapsedMs, command = '', phase = null) {
  const isNg = /npm\s+(run\s+)?start|ng\s+serve/i.test(command)
  if (!isNg) {
    return 'Proses masih berjalan — input terminal bebas dipakai'
  }
  return getBuildStatusHint(elapsedMs, phase)
}
