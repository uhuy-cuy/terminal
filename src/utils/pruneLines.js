/** @param {number} from 1-based inclusive */
/** @param {number} to 1-based inclusive */
export function pruneLineRange(lines, from, to) {
  const total = lines.length
  if (total === 0) return { lines, removed: 0, message: 'Tidak ada baris untuk dihapus.' }

  const start = Math.max(1, Math.min(from, total))
  const end = Math.max(start, Math.min(to, total))

  const removed = end - start + 1
  return {
    lines: [...lines.slice(0, start - 1), ...lines.slice(end)],
    removed,
    message: `✓ Dihapus ${removed} baris (#${start}–#${end} dari ${total})`,
  }
}

export function pruneStreamLines(lines) {
  const next = lines.filter((line) => !(line.type === 'output' && line.stream))
  const removed = lines.length - next.length
  return {
    lines: next,
    removed,
    message:
      removed > 0
        ? `✓ Dihapus ${removed} baris log stream (npm/build)`
        : 'Tidak ada baris log stream untuk dihapus.',
  }
}

export function parsePruneCommand(cmd) {
  const trimmed = cmd.trim()

  if (/^prune\s+stream$/i.test(trimmed)) {
    return { mode: 'stream' }
  }

  const range = trimmed.match(/^prune\s+(\d+)\s*-\s*(\d+)$/i)
  if (range) {
    return { mode: 'range', from: Number(range[1]), to: Number(range[2]) }
  }

  const spaced = trimmed.match(/^prune\s+(\d+)\s+(\d+)$/i)
  if (spaced) {
    return { mode: 'range', from: Number(spaced[1]), to: Number(spaced[2]) }
  }

  return null
}
