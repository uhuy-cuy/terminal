/**
 * Windows / browser sering mengubah:
 *   --  → — (em dash)
 *   ''  → ‘’ (smart quotes)
 * Git menganggap — sebagai opsi invalid.
 */
export function normalizeTerminalInput(text) {
  if (!text) return text

  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2014-?/g, '--')
    .replace(/\u2013-?/g, '--')
    .replace(/\u2212/g, '-')
}
