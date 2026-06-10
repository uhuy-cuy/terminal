export const INITIAL_FILE_SYSTEM = {
  '/': {
    type: 'dir',
    children: {
      bin: {
        type: 'dir',
        children: {
          sh: { type: 'file', content: '', executable: true },
          ls: { type: 'file', content: '', executable: true },
        },
      },
      etc: {
        type: 'dir',
        children: {
          hostname: { type: 'file', content: 'local' },
          'os-release': { type: 'file', content: 'NAME="@tahirwiyan"\nVERSION="1.0.0"' },
        },
      },
      home: {
        type: 'dir',
        children: {
          tahirwiyan: {
            type: 'dir',
            children: {
              documents: {
                type: 'dir',
                children: {
                  'readme.txt': {
                    type: 'file',
                    content:
                      'Selamat datang di @tahirwiyan terminal!\nKetik "help" untuk melihat perintah yang tersedia.',
                  },
                  'notes.md': {
                    type: 'file',
                    content:
                      '# Catatan\n\n- Terminal @tahirwiyan\n- Ketik help untuk daftar perintah lengkap',
                  },
                  'todo.txt': {
                    type: 'file',
                    content: '- [ ] Belajar perintah terminal\n- [x] Install PWA @tahirwiyan',
                  },
                },
              },
              downloads: { type: 'dir', children: {} },
              projects: {
                type: 'dir',
                children: {
                  terminal: {
                    type: 'dir',
                    children: {
                      'package.json': {
                        type: 'file',
                        content: '{\n  "name": "@tahirwiyan",\n  "version": "1.0.0"\n}',
                      },
                      README: {
                        type: 'file',
                        content: '# @tahirwiyan Terminal\n\nTerminal web berbasis React.',
                      },
                      src: {
                        type: 'dir',
                        children: {
                          'App.jsx': {
                            type: 'file',
                            content: 'export default function App() { return <Terminal /> }',
                          },
                          'main.jsx': {
                            type: 'file',
                            content: "import { createRoot } from 'react-dom/client'",
                          },
                        },
                      },
                    },
                  },
                  website: {
                    type: 'dir',
                    children: {
                      'index.html': { type: 'file', content: '<!DOCTYPE html><html></html>' },
                    },
                  },
                },
              },
              '.bashrc': {
                type: 'file',
                content: 'export PS1="@tahirwiyan"\nalias ll="ls -l"',
              },
              '.gitconfig': {
                type: 'file',
                content: '[user]\n  name = tahirwiyan\n  email = tahir@local.dev',
              },
            },
          },
        },
      },
      tmp: { type: 'dir', children: {} },
      usr: {
        type: 'dir',
        children: {
          bin: { type: 'dir', children: {} },
        },
      },
      var: {
        type: 'dir',
        children: {
          log: {
            type: 'dir',
            children: {
              'system.log': { type: 'file', content: '[info] @tahirwiyan terminal started' },
            },
          },
        },
      },
    },
  },
}

export function cloneFileSystem() {
  return structuredClone(INITIAL_FILE_SYSTEM)
}

export function normalizePath(cwd, input) {
  if (!input) return cwd
  if (input === '~') return '/home/tahirwiyan'
  if (input.startsWith('~/')) return normalizePath('/home/tahirwiyan', input.slice(2))

  let parts
  if (input.startsWith('/')) {
    parts = input.split('/').filter(Boolean)
  } else {
    parts = [...cwd.split('/').filter(Boolean), ...input.split('/').filter(Boolean)]
  }

  const resolved = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return '/' + resolved.join('/')
}

export function getNode(fs, path) {
  if (path === '/') return fs['/']
  const parts = path.split('/').filter(Boolean)
  let node = fs['/']
  for (const part of parts) {
    if (!node?.children?.[part]) return null
    node = node.children[part]
  }
  return node
}

export function getParent(fs, path) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const name = parts.pop()
  const parentPath = '/' + parts.join('/')
  const parent = parts.length === 0 ? fs['/'] : getNode(fs, parentPath)
  if (!parent?.children) return null
  return { parent, name, parentPath: parts.length === 0 ? '/' : parentPath }
}

export function listDir(fs, path) {
  const node = getNode(fs, path)
  if (!node) return { error: `ls: cannot access '${path}': No such file or directory` }
  if (node.type !== 'dir') return { error: `ls: cannot access '${path}': Not a directory` }
  return {
    entries: Object.entries(node.children).map(([name, n]) => ({
      name,
      type: n.type,
      content: n.content ?? '',
    })),
  }
}

export function readFile(fs, path) {
  const node = getNode(fs, path)
  if (!node) return { error: `cat: ${path}: No such file or directory` }
  if (node.type === 'dir') return { error: `cat: ${path}: Is a directory` }
  return { content: node.content ?? '' }
}

export function writeFile(fs, path, content = '') {
  const info = getParent(fs, path)
  if (!info) return { error: `touch: cannot touch '${path}': Invalid path` }
  const existing = info.parent.children[info.name]
  if (existing?.type === 'dir') return { error: `touch: cannot touch '${path}': Is a directory` }
  info.parent.children[info.name] = { type: 'file', content }
  return { ok: true }
}

export function mkdir(fs, path, recursive = false) {
  if (getNode(fs, path)) return { error: `mkdir: cannot create directory '${path}': File exists` }

  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return { error: `mkdir: cannot create directory '${path}': Invalid path` }

  const parentPath = parts.length === 1 ? '/' : '/' + parts.slice(0, -1).join('/')
  const name = parts[parts.length - 1]
  const parent = parts.length === 1 ? fs['/'] : getNode(fs, parentPath)

  if (!parent || parent.type !== 'dir') {
    return { error: `mkdir: cannot create directory '${path}': No such file or directory` }
  }

  if (!recursive && parts.length > 1 && !getNode(fs, parentPath)) {
    return { error: `mkdir: cannot create directory '${path}': No such file or directory` }
  }

  if (recursive) {
    let current = fs['/']
    let built = ''
    for (const part of parts) {
      built += '/' + part
      if (!current.children) current.children = {}
      if (!current.children[part]) current.children[part] = { type: 'dir', children: {} }
      current = current.children[part]
    }
    return { ok: true }
  }

  parent.children[name] = { type: 'dir', children: {} }
  return { ok: true }
}

export function removePath(fs, path, recursive = false) {
  const info = getParent(fs, path)
  if (!info) return { error: `rm: cannot remove '${path}': No such file or directory` }
  const node = info.parent.children[info.name]
  if (!node) return { error: `rm: cannot remove '${path}': No such file or directory` }
  if (node.type === 'dir' && Object.keys(node.children).length > 0 && !recursive) {
    return { error: `rm: cannot remove '${path}': Is a directory` }
  }
  delete info.parent.children[info.name]
  return { ok: true }
}

export function movePath(fs, from, to) {
  const srcInfo = getParent(fs, from)
  if (!srcInfo?.parent.children[srcInfo.name]) {
    return { error: `mv: cannot stat '${from}': No such file or directory` }
  }
  const node = structuredClone(srcInfo.parent.children[srcInfo.name])
  const dest = normalizePath('/', to.startsWith('/') ? to : normalizePath(srcInfo.parentPath === '/' ? srcInfo.parentPath : srcInfo.parentPath, to))

  let destPath = dest
  const destNode = getNode(fs, dest)
  if (destNode?.type === 'dir') {
    destPath = normalizePath(dest, srcInfo.name)
  }

  const destInfo = getParent(fs, destPath)
  if (!destInfo) return { error: `mv: cannot move to '${to}': No such file or directory` }
  if (destInfo.parent.children[destInfo.name]) {
    return { error: `mv: cannot move to '${to}': File exists` }
  }

  destInfo.parent.children[destInfo.name] = node
  delete srcInfo.parent.children[srcInfo.name]
  return { ok: true, path: destPath }
}

export function copyPath(fs, from, to) {
  const srcNode = getNode(fs, from)
  if (!srcNode) return { error: `cp: cannot stat '${from}': No such file or directory` }

  let destPath = normalizePath('/', to)
  const destNode = getNode(fs, destPath)
  if (destNode?.type === 'dir') {
    const base = from.split('/').pop()
    destPath = normalizePath(destPath, base)
  }

  const destInfo = getParent(fs, destPath)
  if (!destInfo) return { error: `cp: cannot create '${to}': No such file or directory` }
  if (destInfo.parent.children[destInfo.name]) {
    return { error: `cp: cannot create '${to}': File exists` }
  }

  destInfo.parent.children[destInfo.name] = structuredClone(srcNode)
  return { ok: true }
}

export function buildTree(fs, path, prefix = '', isLast = true, lines = []) {
  const node = getNode(fs, path)
  if (!node) return lines

  const name = path === '/' ? '/' : path.split('/').pop()
  const connector = isLast ? '└── ' : '├── '
  lines.push(prefix + connector + name + (node.type === 'dir' ? '/' : ''))

  if (node.type === 'dir' && node.children) {
    const entries = Object.keys(node.children).sort()
    const ext = isLast ? '    ' : '│   '
    entries.forEach((entry, i) => {
      buildTree(fs, normalizePath(path, entry), prefix + ext, i === entries.length - 1, lines)
    })
  }
  return lines
}

export function findFiles(fs, dir, pattern, results = []) {
  const node = getNode(fs, dir)
  if (!node?.children) return results

  const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')

  for (const [name, child] of Object.entries(node.children)) {
    const full = normalizePath(dir, name)
    if (regex.test(name)) results.push(full)
    if (child.type === 'dir') findFiles(fs, full, pattern, results)
  }
  return results
}

export function formatSize(content = '') {
  const bytes = new TextEncoder().encode(content).length
  if (bytes < 1024) return `${bytes}`
  return `${(bytes / 1024).toFixed(1)}K`
}

export function formatDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

export function getDisplayPath(cwd) {
  if (cwd === '/home/tahirwiyan') return '~'
  if (cwd.startsWith('/home/tahirwiyan/')) return '~' + cwd.slice('/home/tahirwiyan'.length)
  return cwd
}

export function getGitBranch(cwd) {
  if (cwd.includes('/projects/terminal') || cwd.includes('/projects/website')) return 'main'
  return null
}
