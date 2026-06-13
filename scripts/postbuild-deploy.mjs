/**
 * Salin hasil build ke root proyek agar Laragon (http://localhost/terminal/) 
 * memuat file production, bukan index.html dev (/src/main.jsx).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name)
    const dest = path.join(destDir, name)
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest)
    } else {
      copyFile(src, dest)
    }
  }
}

if (!fs.existsSync(dist)) {
  console.error('postbuild-deploy: folder dist tidak ada — jalankan npm run build dulu')
  process.exit(1)
}

copyFile(path.join(dist, 'index.html'), path.join(root, 'index.html'))
copyDir(path.join(dist, 'assets'), path.join(root, 'assets'))

for (const name of fs.readdirSync(dist)) {
  if (name === 'index.html' || name === 'assets') continue
  const src = path.join(dist, name)
  if (fs.statSync(src).isFile()) {
    copyFile(src, path.join(root, name))
  }
}

console.log('postbuild-deploy: dist → root Laragon (/terminal/)')
