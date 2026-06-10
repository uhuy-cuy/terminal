import { getNode, listDir, normalizePath } from './filesystem.js'

export function isCdCompleteInput(input) {
  return /^cd(\s|$)/i.test(input)
}

export function parseCdInput(input) {
  if (!isCdCompleteInput(input)) return null

  const trimmed = input.replace(/^\s+/, '')
  if (!/^cd(\s|$)/i.test(trimmed)) return null

  const afterCmd = trimmed.replace(/^cd\s*/i, '')
  if (afterCmd === '') {
    return { relativePath: '.', filter: '', inputPrefix: trimmed.endsWith(' ') ? trimmed : `${trimmed} ` }
  }

  const lastSlash = Math.max(afterCmd.lastIndexOf('/'), afterCmd.lastIndexOf('\\'))
  if (lastSlash === -1) {
    return { relativePath: '.', filter: afterCmd, inputPrefix: 'cd ' }
  }

  const relativePath = afterCmd.slice(0, lastSlash + 1)
  const filter = afterCmd.slice(lastSlash + 1)

  return {
    relativePath,
    filter,
    inputPrefix: `cd ${relativePath}`,
  }
}

export function filterEntries(entries, filter) {
  const q = filter.toLowerCase()
  if (!q) return entries
  return entries.filter((entry) => entry.name.toLowerCase().startsWith(q))
}

export function buildCdSelection(inputPrefix, name, type) {
  const isDir = type === 'dir'
  const suffix = isDir && name !== '.' && name !== '..' ? `${name}/` : name
  return `${inputPrefix}${suffix}`
}

export function listDirSim(fs, cwd, home, relativePath = '.') {
  const isWin = /\\|\w:/.test(String(cwd))

  if (isWin) {
    return { ok: false, error: 'Simulasi mode — gunakan Laragon untuk path Windows', entries: [] }
  }

  let targetPath = cwd
  const rel = relativePath.replace(/\\/g, '/').replace(/\/+$/, '') || '.'

  if (rel === '.' || rel === '') {
    targetPath = cwd
  } else if (rel.startsWith('/')) {
    targetPath = normalizePath('/', rel)
  } else {
    targetPath = normalizePath(cwd, rel)
  }

  const result = listDir(fs, targetPath)
  if (result.error) {
    return { ok: false, error: result.error, entries: [] }
  }

  const entries = result.entries.map((entry) => ({
    name: entry.name,
    type: entry.type === 'dir' ? 'dir' : 'file',
  }))

  entries.unshift({ name: '..', type: 'dir' })
  entries.unshift({ name: '.', type: 'dir' })

  entries.sort((a, b) => {
    if (a.name === '..') return -1
    if (b.name === '..') return 1
    if (a.name === '.') return -1
    if (b.name === '.') return 1
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return { ok: true, path: targetPath, entries }
}
