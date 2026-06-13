import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'index.source.html')
const target = path.join(root, 'index.html')

fs.copyFileSync(source, target)
console.log('restore-dev-index: index.source.html → index.html')
