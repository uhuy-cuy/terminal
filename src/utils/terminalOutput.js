export const OUTPUT_CHUNK = 50

/** Saat npm/build stream aktif — tampilkan lebih banyak baris live seperti CMD */
export const STREAM_OUTPUT_CHUNK = 400

/** Watch mode setelah server siap — ringan, hindari flood HPM */
export const WATCH_OUTPUT_CHUNK = 100

/** Setelah stream selesai — tampilkan semua log perintah jika di bawah batas ini */
export const STREAM_EXPAND_MAX = 2500

/** Index awal jendela agar 50 baris terakhir yang tampil */
export function bottomWindowStart(total, chunk = OUTPUT_CHUNK) {
  return Math.max(0, total - chunk)
}

export function maxWindowStart(total, chunk = OUTPUT_CHUNK) {
  return Math.max(0, total - chunk)
}

export function clampWindowStart(start, total, chunk = OUTPUT_CHUNK) {
  return Math.min(Math.max(0, start), maxWindowStart(total, chunk))
}
