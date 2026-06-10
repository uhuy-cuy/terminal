import { execShell, execShellStream, isRealMode, isStreamCommand } from './shellApi.js'
import { HISTORY_LIMIT, loadCommandHistory } from './historyStorage.js'
import {
  applyCustomColors,
  applyTheme,
  formatThemeInfo,
  formatThemeList,
  getCurrentThemeState,
  getTheme,
  parseThemeCustomArgs,
  setPromptStyle,
  THEMES,
} from './themes.js'
import {
  buildTree,
  cloneFileSystem,
  copyPath,
  findFiles,
  formatDate,
  formatSize,
  getNode,
  listDir,
  mkdir,
  movePath,
  normalizePath,
  readFile,
  removePath,
  writeFile,
} from './filesystem.js'

export function getDisplayPath(cwd, home = '/home/tahirwiyan') {
  const norm = String(cwd).replace(/\\/g, '/')
  const homeNorm = String(home).replace(/\\/g, '/')

  if (norm.toLowerCase() === homeNorm.toLowerCase()) return '~'
  if (norm.toLowerCase().startsWith(homeNorm.toLowerCase() + '/')) {
    return '~' + norm.slice(homeNorm.length)
  }

  if (cwd === '/home/tahirwiyan') return '~'
  if (cwd.startsWith('/home/tahirwiyan/')) return '~' + cwd.slice('/home/tahirwiyan'.length)
  return norm
}

export function getGitBranch(cwd, state = null) {
  if (state?.realMode) return state.gitBranch || null
  if (cwd.includes('/projects/terminal') || cwd.includes('/projects/website')) return 'main'
  return null
}

const MAN_PAGES = {
  ls: 'ls [opsi] [path]\n  -a  tampilkan file tersembunyi\n  -l  format panjang\n  -la kombinasi -l -a',
  cd: 'cd [path]\n  cd ~   ke home\n  cd ..  naik satu level\n  cd -   direktori sebelumnya',
  cat: 'cat <file>...  — tampilkan isi file',
  grep: 'grep <pattern> [file]  — cari teks',
  mkdir: 'mkdir [-p] <dir>  — buat direktori',
  rm: 'rm [-r] <path>  — hapus file/direktori',
  cp: 'cp <src> <dest>  — salin file',
  mv: 'mv <src> <dest>  — pindah/rename file',
  touch: 'touch <file>  — buat file kosong atau update timestamp',
  echo: 'echo <teks>  — cetak teks ($VAR didukung)',
  export: 'export VAR=nilai  — set environment variable',
  alias: 'alias [name=cmd]  — kelola alias',
  git: 'git status | branch | log  — perintah git simulasi',
}

export const INITIAL_STATE = {
  cwd: '/home/tahirwiyan',
  prevCwd: null,
  user: 'tahirwiyan',
  hostname: 'local',
  history: [],
  historyIndex: -1,
  realMode: false,
  gitBranch: null,
  home: '/home/tahirwiyan',
  fs: cloneFileSystem(),
  env: {
    HOME: '/home/tahirwiyan',
    USER: 'tahirwiyan',
    SHELL: '/bin/sh',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    TERM: 'xterm-256color',
  },
  aliases: {
    ll: 'ls -l',
    la: 'ls -la',
    cls: 'clear',
    dir: 'ls',
    md: 'mkdir',
    del: 'rm',
    copy: 'cp',
    move: 'mv',
    h: 'history',
  },
}

function parseArgs(input) {
  const tokens = []
  let current = ''
  let inQuote = null

  for (const char of input) {
    if (inQuote) {
      if (char === inQuote) inQuote = null
      else current += char
    } else if (char === '"' || char === "'") {
      inQuote = char
    } else if (char === ' ') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }
  if (current) tokens.push(current)
  return tokens
}

function expandEnv(text, env) {
  return text.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key) => env[key] ?? '')
}

function expandAliases(input, aliases) {
  const trimmed = input.trim()
  const space = trimmed.indexOf(' ')
  const name = space === -1 ? trimmed : trimmed.slice(0, space)
  const rest = space === -1 ? '' : trimmed.slice(space + 1)
  if (aliases[name]) return rest ? `${aliases[name]} ${rest}` : aliases[name]
  return input
}

function splitChains(input) {
  const parts = []
  let current = ''
  let inQuote = null

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (inQuote) {
      current += char
      if (char === inQuote) inQuote = null
      continue
    }
    if (char === '"' || char === "'") {
      inQuote = char
      current += char
      continue
    }
    if (char === ';') {
      if (current.trim()) parts.push({ cmd: current.trim(), op: ';' })
      current = ''
      continue
    }
    if (char === '&' && input[i + 1] === '&') {
      if (current.trim()) parts.push({ cmd: current.trim(), op: '&&' })
      current = ''
      i++
      continue
    }
    current += char
  }
  if (current.trim()) parts.push({ cmd: current.trim(), op: null })
  return parts
}

function splitPipe(input) {
  const parts = []
  let current = ''
  let inQuote = null

  for (const char of input) {
    if (inQuote) {
      current += char
      if (char === inQuote) inQuote = null
      continue
    }
    if (char === '"' || char === "'") {
      inQuote = char
      current += char
      continue
    }
    if (char === '|') {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function formatLsEntry(entry, long) {
  if (!long) {
    const suffix = entry.type === 'dir' ? '/' : ''
    return entry.name + suffix
  }
  const perm = entry.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--'
  const size = entry.type === 'dir' ? '-' : formatSize(entry.content)
  return `${perm}  1 tahirwiyan  ${String(size).padStart(6)}  ${formatDate()}  ${entry.name}${entry.type === 'dir' ? '/' : ''}`
}

function runLs(args, state) {
  let showAll = false
  let long = false
  const paths = []

  for (const arg of args) {
    if (arg.startsWith('-') && arg.length > 1) {
      if (arg.includes('a')) showAll = true
      if (arg.includes('l')) long = true
    } else paths.push(arg)
  }

  const targets = paths.length ? paths : ['.']
  const output = []

  for (const p of targets) {
    const target = normalizePath(state.cwd, p)
    const result = listDir(state.fs, target)
    if (result.error) return { output: [result.error], newState: state }

    let entries = result.entries
    if (!showAll) entries = entries.filter((e) => !e.name.startsWith('.'))
    entries.sort((a, b) => a.name.localeCompare(b.name))

    if (paths.length > 1) output.push(`${p}:`)
    if (long) output.push(...entries.map((e) => formatLsEntry(e, true)))
    else output.push(entries.map((e) => formatLsEntry(e, false)).join('  ') || '')
  }

  return { output: output.filter((l) => l !== undefined), newState: state }
}

function runGit(args, state) {
  const sub = args[0]?.toLowerCase()
  const inRepo = getGitBranch(state.cwd)

  if (!sub || sub === 'status') {
    if (!inRepo) return { output: ['fatal: not a git repository'], newState: state }
    return {
      output: [
        `On branch ${inRepo}`,
        'Your branch is up to date with origin/main.',
        '',
        'nothing to commit, working tree clean',
      ],
      newState: state,
    }
  }

  if (sub === 'branch') {
    if (!inRepo) return { output: ['fatal: not a git repository'], newState: state }
    return { output: [`* ${inRepo}`], newState: state }
  }

  if (sub === 'log') {
    if (!inRepo) return { output: ['fatal: not a git repository'], newState: state }
    return {
      output: [
        'commit a1b2c3d (@tahirwiyan)',
        'Author: tahirwiyan <tahir@local.dev>',
        'Date:   Mon Jun 9 2026',
        '',
        '    feat: terminal PWA @tahirwiyan',
      ],
      newState: state,
    }
  }

  return { output: [`git: '${sub}' is not a git command.`], newState: state }
}

function runSingleCommand(input, state) {
  const pipeParts = splitPipe(input)
  let pipeData = null
  let output = []
  let newState = { ...state, env: { ...state.env, PWD: state.cwd } }

  for (let i = 0; i < pipeParts.length; i++) {
    const part = expandAliases(expandEnv(pipeParts[i], newState.env), newState.aliases)
    const tokens = parseArgs(part)
    if (!tokens.length) continue

    const [cmdRaw, ...args] = tokens
    const cmd = cmdRaw.toLowerCase()
    let segmentOutput = []

    if (cmd === 'grep' && i > 0 && pipeData) {
      const pattern = args[0]
      if (!pattern) segmentOutput = ['grep: missing pattern']
      else {
        const regex = new RegExp(pattern, 'i')
        segmentOutput = pipeData.filter((line) => regex.test(line))
      }
      pipeData = segmentOutput
      output = segmentOutput
      continue
    }

    switch (cmd) {
      case 'help':
        segmentOutput = [
          'Perintah yang tersedia (@tahirwiyan):',
          '',
          '  Navigasi:     cd, pwd, ls, ll, la, tree, find',
          '  File:         cat, head, tail, touch, mkdir, rm, cp, mv, wc',
          '  Teks:         echo, grep, sort, uniq',
          '  Shell:        clear, history, alias, which, man, reset, exit',
          '  Info:         neofetch, theme, date, cal, uptime',
          '  Tema:         theme list · theme set dracula · theme style rounded',
          '                theme custom --user=#hex --path=#hex',
          '',
          '  Windows/Shell (real-time):',
          '    ipconfig, ping, tracert, netstat, nslookup, arp, getmac',
          '    systeminfo, tasklist, whoami, hostname, ver, where, wmic',
          '    git, npm, npx, node, php, composer, python, docker, dll.',
          '',
          '  Kill proses Node (Windows):',
          '    Ctrl+C              — hentikan server/npm yang masih jalan di terminal',
          '    tasklist | findstr node     — lihat proses node.exe',
          '    taskkill /IM node.exe /F    — matikan semua proses node',
          '    taskkill /PID <id> /T /F    — matikan satu proses + child-nya',
          '    netstat -ano | findstr :4200 — cek PID yang pakai port 4200',
          '',
          '  Git / push ke GitHub:',
          '    git config --global user.name "Nama Anda"',
          '    git config --global user.email "email@github.com"',
          '    git config --global credential.helper manager-core',
          '    git remote -v                  — cek remote origin',
          '    git add .',
          '    git commit -m "pesan commit"',
          '    git push -u origin main        — push branch main',
          '    Catatan Laragon: login pertama kali lebih aman dari PowerShell/CMD',
          '    (popup Windows), setelah itu push dari terminal web bisa pakai token tersimpan.',
          '',
          newState.realMode
            ? '  Mode: REAL — akses penuh Windows (semua drive & path)'
            : '  Mode: SIMULASI — jalankan via Laragon untuk shell asli',
          '',
          '  Tips: ↑↓ history · cd D:\\folder · history tersimpan (10 terakhir)',
        ]
        break

      case 'clear':
      case 'cls':
        return { output: [], newState, clear: true }

      case 'reset':
        return {
          output: ['Terminal direset.'],
          newState: { ...INITIAL_STATE, history: loadCommandHistory(), realMode: newState.realMode, cwd: newState.cwd, home: newState.home, gitBranch: newState.gitBranch },
          clear: true,
        }

      case 'exit':
        segmentOutput = ['@tahirwiyan: session attached. Ketik reset untuk mulai ulang.']
        break

      case 'pwd':
        segmentOutput = [newState.cwd]
        break

      case 'cd': {
        if (args[0] === '-') {
          if (!newState.prevCwd) {
            segmentOutput = ['cd: OLDPWD not set']
            break
          }
          const tmp = newState.cwd
          newState.cwd = newState.prevCwd
          newState.prevCwd = tmp
          newState.env.PWD = newState.cwd
          break
        }
        const prev = newState.cwd
        if (!args[0] || args[0] === '~') {
          newState.cwd = '/home/tahirwiyan'
        } else {
          const target = normalizePath(newState.cwd, args[0])
          const node = getNode(newState.fs, target)
          if (!node) segmentOutput = [`cd: ${args[0]}: No such file or directory`]
          else if (node.type !== 'dir') segmentOutput = [`cd: ${args[0]}: Not a directory`]
          else {
            newState.prevCwd = prev
            newState.cwd = target
          }
        }
        newState.env.PWD = newState.cwd
        break
      }

      case 'ls':
      case 'dir': {
        const result = runLs(args, newState)
        segmentOutput = result.output
        newState = result.newState
        break
      }

      case 'tree': {
        const target = args[0] ? normalizePath(newState.cwd, args[0]) : newState.cwd
        const node = getNode(newState.fs, target)
        if (!node) segmentOutput = [`tree: ${args[0]}: No such file or directory`]
        else if (node.type !== 'dir') segmentOutput = [`tree: ${args[0]}: Not a directory`]
        else {
          const name = target === '/' ? '/' : target.split('/').pop()
          segmentOutput = [name, ...buildTree(newState.fs, target, '', true, []).slice(1)]
        }
        break
      }

      case 'find': {
        const searchPath = args[0] ? normalizePath(newState.cwd, args[0]) : newState.cwd
        const pattern = args[1] ?? '*'
        segmentOutput = findFiles(newState.fs, searchPath, pattern)
        if (!segmentOutput.length) segmentOutput = []
        break
      }

      case 'cat': {
        if (!args.length) {
          segmentOutput = ['cat: missing file operand']
          break
        }
        for (const arg of args) {
          const target = normalizePath(newState.cwd, arg)
          const result = readFile(newState.fs, target)
          if (result.error) segmentOutput.push(result.error)
          else segmentOutput.push(...result.content.split('\n'))
        }
        break
      }

      case 'head': {
        const n = args[0]?.startsWith('-') ? parseInt(args[0].slice(1), 10) || 10 : 10
        const file = args[0]?.startsWith('-') ? args[1] : args[0]
        if (!file) {
          segmentOutput = ['head: missing file operand']
          break
        }
        const result = readFile(newState.fs, normalizePath(newState.cwd, file))
        if (result.error) segmentOutput = [result.error]
        else segmentOutput = result.content.split('\n').slice(0, n)
        break
      }

      case 'tail': {
        const n = args[0]?.startsWith('-') ? parseInt(args[0].slice(1), 10) || 10 : 10
        const file = args[0]?.startsWith('-') ? args[1] : args[0]
        if (!file) {
          segmentOutput = ['tail: missing file operand']
          break
        }
        const result = readFile(newState.fs, normalizePath(newState.cwd, file))
        if (result.error) segmentOutput = [result.error]
        else {
          const lines = result.content.split('\n')
          segmentOutput = lines.slice(Math.max(0, lines.length - n))
        }
        break
      }

      case 'touch': {
        if (!args.length) {
          segmentOutput = ['touch: missing file operand']
          break
        }
        for (const arg of args) {
          const target = normalizePath(newState.cwd, arg)
          const existing = readFile(newState.fs, target)
          const content = existing.error ? '' : existing.content
          const result = writeFile(newState.fs, target, content)
          if (result.error) segmentOutput.push(result.error)
        }
        break
      }

      case 'mkdir': {
        const recursive = args.includes('-p')
        const dirs = args.filter((a) => !a.startsWith('-'))
        for (const dir of dirs) {
          const target = normalizePath(newState.cwd, dir)
          const result = mkdir(newState.fs, target, recursive)
          if (result.error) segmentOutput.push(result.error)
        }
        break
      }

      case 'rm':
      case 'del': {
        const recursive = args.includes('-r') || args.includes('-rf')
        const paths = args.filter((a) => !a.startsWith('-'))
        for (const p of paths) {
          const result = removePath(newState.fs, normalizePath(newState.cwd, p), recursive)
          if (result.error) segmentOutput.push(result.error)
        }
        break
      }

      case 'cp':
      case 'copy': {
        if (args.length < 2) {
          segmentOutput = ['cp: missing file operand']
          break
        }
        const result = copyPath(newState.fs, normalizePath(newState.cwd, args[0]), args[1])
        segmentOutput = result.error ? [result.error] : []
        break
      }

      case 'mv':
      case 'move': {
        if (args.length < 2) {
          segmentOutput = ['mv: missing file operand']
          break
        }
        const result = movePath(newState.fs, normalizePath(newState.cwd, args[0]), args[1])
        if (result.error) segmentOutput = [result.error]
        else if (result.path === newState.cwd || normalizePath(newState.cwd, args[0]) === newState.cwd) {
          newState.cwd = result.path
          newState.env.PWD = result.path
        }
        break
      }

      case 'echo':
        segmentOutput = [expandEnv(args.join(' '), newState.env)]
        break

      case 'printf':
        segmentOutput = [expandEnv(args.join(' '), newState.env).replace(/\\n/g, '\n')]
        break

      case 'grep': {
        const pattern = args[0]
        if (!pattern) {
          segmentOutput = ['grep: missing pattern']
          break
        }
        const file = args[1]
        if (!file) {
          segmentOutput = ['grep: missing file operand']
          break
        }
        const result = readFile(newState.fs, normalizePath(newState.cwd, file))
        if (result.error) segmentOutput = [result.error]
        else {
          const regex = new RegExp(pattern, 'i')
          segmentOutput = result.content.split('\n').filter((line) => regex.test(line))
        }
        break
      }

      case 'sort': {
        const file = args[0]
        if (!file) {
          segmentOutput = ['sort: missing file operand']
          break
        }
        const result = readFile(newState.fs, normalizePath(newState.cwd, file))
        if (result.error) segmentOutput = [result.error]
        else segmentOutput = result.content.split('\n').sort()
        break
      }

      case 'uniq': {
        const file = args[0]
        if (!file) {
          segmentOutput = ['uniq: missing file operand']
          break
        }
        const result = readFile(newState.fs, normalizePath(newState.cwd, file))
        if (result.error) segmentOutput = [result.error]
        else {
          const lines = result.content.split('\n')
          segmentOutput = lines.filter((line, idx) => idx === 0 || line !== lines[idx - 1])
        }
        break
      }

      case 'wc': {
        const file = args[args.length - 1]
        if (!file) {
          segmentOutput = ['wc: missing file operand']
          break
        }
        const result = readFile(newState.fs, normalizePath(newState.cwd, file))
        if (result.error) segmentOutput = [result.error]
        else {
          const lines = result.content.split('\n')
          const words = result.content.trim() ? result.content.trim().split(/\s+/).length : 0
          const bytes = new TextEncoder().encode(result.content).length
          segmentOutput = [`${lines.length}  ${words}  ${bytes} ${file}`]
        }
        break
      }

      case 'whoami':
        segmentOutput = [newState.user]
        break

      case 'id':
        segmentOutput = [`uid=1000(${newState.user}) gid=1000(${newState.user}) groups=1000(${newState.user})`]
        break

      case 'hostname':
        segmentOutput = [newState.hostname]
        break

      case 'uname': {
        const flag = args[0]
        if (flag === '-a') segmentOutput = ['@tahirwiyan local 1.0.0 Web React Terminal x86_64']
        else segmentOutput = ['@tahirwiyan']
        break
      }

      case 'date':
        segmentOutput = [new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long' })]
        break

      case 'cal': {
        const now = new Date()
        segmentOutput = [
          `     ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
          'Su Mo Tu We Th Fr Sa',
          '                   1',
          ' 2  3  4  5  6  7  8',
          ' 9 10 11 12 13 14 15',
          '16 17 18 19 20 21 22',
          '23 24 25 26 27 28 29',
          '30',
        ]
        break
      }

      case 'uptime':
        segmentOutput = [`up ${Math.floor(performance.now() / 60000) || 1} min, 1 user, load average: 0.00, 0.00, 0.00`]
        break

      case 'env':
      case 'printenv':
        segmentOutput = Object.entries(newState.env).map(([k, v]) => `${k}=${v}`)
        break

      case 'export': {
        const arg = args.join(' ')
        const eq = arg.indexOf('=')
        if (eq === -1) {
          segmentOutput = [`export: '${arg}': not a valid identifier`]
          break
        }
        const key = arg.slice(0, eq)
        const val = expandEnv(arg.slice(eq + 1), newState.env)
        newState.env = { ...newState.env, [key]: val }
        break
      }

      case 'history': {
        const hist = newState.history.slice(-HISTORY_LIMIT)
        segmentOutput = hist.length
          ? hist.map((h, idx) => `  ${String(idx + 1).padStart(4)}  ${h}`)
          : [`  (kosong — ${HISTORY_LIMIT} perintah terakhir disimpan di browser)`]
        break
      }

      case 'alias': {
        if (!args.length) {
          segmentOutput = Object.entries(newState.aliases).map(([k, v]) => `alias ${k}='${v}'`)
          break
        }
        const def = args.join(' ')
        const eq = def.indexOf('=')
        if (eq === -1) {
          const name = def.replace(/=$/, '')
          segmentOutput = newState.aliases[name] ? [`alias ${name}='${newState.aliases[name]}'`] : [`alias: ${name}: not found`]
          break
        }
        const name = def.slice(0, eq)
        const val = def.slice(eq + 1).replace(/^['"]|['"]$/g, '')
        newState.aliases = { ...newState.aliases, [name]: val }
        break
      }

      case 'which': {
        if (!args[0]) {
          segmentOutput = ['which: missing argument']
          break
        }
        const name = args[0]
        if (newState.aliases[name]) segmentOutput = [`alias ${name}='${newState.aliases[name]}'`]
        else segmentOutput = [`/${name}`]
        break
      }

      case 'man': {
        const page = args[0]?.toLowerCase()
        if (!page || !MAN_PAGES[page]) {
          segmentOutput = [`No manual entry for ${page ?? 'undefined'}`]
          break
        }
        segmentOutput = [`NAME\n  ${page} - @tahirwiyan shell builtin`, '', 'SYNOPSIS', `  ${MAN_PAGES[page]}`]
        break
      }

      case 'ping': {
        const host = args[0] ?? 'localhost'
        segmentOutput = [
          `PING ${host} (@tahirwiyan sim): 56 data bytes`,
          `64 bytes from ${host}: icmp_seq=1 ttl=64 time=0.4 ms`,
          `64 bytes from ${host}: icmp_seq=2 ttl=64 time=0.3 ms`,
          '',
          `--- ${host} ping statistics ---`,
          '2 packets transmitted, 2 received, 0% packet loss',
        ]
        break
      }

      case 'curl': {
        const url = args.find((a) => a.startsWith('http')) ?? 'https://tahirwiyan.dev'
        segmentOutput = [
          `[simulasi] GET ${url}`,
          'HTTP/1.1 200 OK',
          'Content-Type: text/html',
          '',
          '<!-- @tahirwiyan terminal -->',
        ]
        break
      }

      case 'wget':
        segmentOutput = [`[simulasi] saved '${args[0] ?? 'file.txt'}'`]
        break

      case 'sudo':
        segmentOutput = [`${newState.user} is not in the sudoers file. 😄`]
        break

      case 'git':
        ({ output: segmentOutput, newState } = runGit(args, newState))
        break

      case 'theme': {
        const sub = args[0]?.toLowerCase()
        if (!sub) {
          segmentOutput = formatThemeInfo()
          break
        }
        if (sub === 'list') {
          const { id } = getCurrentThemeState()
          segmentOutput = ['Tema tersedia:', ...formatThemeList(id)]
          break
        }
        if (sub === 'set' && args[1]) {
          const id = args[1].toLowerCase()
          if (!THEMES[id]) {
            segmentOutput = [`Tema '${args[1]}' tidak ditemukan. Ketik 'theme list'.`]
            break
          }
          const r = applyTheme(id, { custom: {}, style: getTheme(id).style })
          window.dispatchEvent(new Event('tw-theme-change'))
          segmentOutput = [`Tema diganti → ${r.label} (${r.id})`]
          break
        }
        if (sub === 'style' && args[1]) {
          const styleName = args[1].toLowerCase()
          if (!setPromptStyle(styleName)) {
            segmentOutput = ['Gaya tidak valid. Pilihan: powerline | rounded | flat']
            break
          }
          window.dispatchEvent(new Event('tw-theme-change'))
          segmentOutput = [`Gaya prompt → ${styleName}`]
          break
        }
        if (sub === 'custom') {
          const colors = parseThemeCustomArgs(args.slice(1))
          if (!Object.keys(colors).length) {
            segmentOutput = [
              'Usage: theme custom --user=#hex [--user-fg=#hex]',
              '       --path=#hex --git=#hex --shell=#hex',
            ]
            break
          }
          const r = applyCustomColors(colors)
          window.dispatchEvent(new Event('tw-theme-change'))
          segmentOutput = [`Custom warna diterapkan pada ${r.label}`]
          break
        }
        segmentOutput = formatThemeInfo()
        break
      }

      case 'neofetch': {
        const { id: themeId, style: promptStyle } = getCurrentThemeState()
        const activeTheme = getTheme(themeId)
        segmentOutput = [
          '       ████████████          tahirwiyan@local',
          '     ██            ██        ─────────────────',
          '    ██   ██████     ██       OS: @tahirwiyan v1.0',
          '    ██  ██    ██    ██       Host: Web Browser (PWA)',
          '    ██  ██    ██    ██       Shell: sh (simulated)',
          `     ██  ██████   ██         Theme: ${activeTheme.label} (${promptStyle})`,
          '       ██████████            Terminal: React + Vite',
          '',
          `       ${getDisplayPath(newState.cwd, newState.home)}`,
        ]
        break
      }

      default:
        segmentOutput = [`${cmd}: command not found. Ketik 'help' untuk bantuan.`]
    }

    output = segmentOutput
    pipeData = segmentOutput
  }

  return { output, newState }
}

export function executeCommand(input, state) {
  const trimmed = input.trim()
  if (!trimmed) return { output: [], newState: state }

  const chains = splitChains(trimmed)
  let newState = { ...state, fs: state.fs, aliases: { ...state.aliases }, env: { ...state.env } }
  let output = []
  let failed = false

  for (const { cmd, op } of chains) {
    if (failed) break
    const result = runSingleCommand(cmd, newState)
    if (result.clear) return { ...result, newState: { ...result.newState, history: state.history } }
    newState = result.newState
    output = [...output, ...result.output]
    if (op === '&&' && result.output.some((line) => line.includes('error') || line.includes('not found') || line.includes('fatal'))) {
      failed = true
    }
  }

  return { output, newState }
}

const LOCAL_COMMANDS = new Set([
  'help', 'history', 'theme', 'neofetch', 'alias', 'export', 'env', 'printenv',
  'reset', 'exit', 'whoami', 'id', 'hostname', 'uname', 'date', 'cal', 'uptime',
  'ping', 'curl', 'wget', 'sudo', 'man', 'which', 'clear', 'cls',
])

function resolveLocalCommand(input, aliases) {
  const first = input.trim().split(/\s+/)[0]?.toLowerCase()
  if (!first) return false
  if (LOCAL_COMMANDS.has(first)) return true
  const expanded = aliases[first]
  if (expanded) {
    const inner = expanded.split(/\s+/)[0]?.toLowerCase()
    return LOCAL_COMMANDS.has(inner)
  }
  return false
}

export async function executeCommandAsync(input, state, handlers = {}) {
  const trimmed = input.trim()
  if (!trimmed) return { output: [], newState: state }

  if (!isRealMode(state) || resolveLocalCommand(trimmed, state.aliases)) {
    return executeCommand(trimmed, state)
  }

  try {
    if (isStreamCommand(trimmed, state.aliases)) {
      const data = await execShellStream(trimmed, state.cwd, state.prevCwd, {
        signal: handlers.signal,
        onStart: handlers.onStart,
        onStatus: handlers.onStatus,
        onLine: handlers.onLine,
        onClear: handlers.onClear,
      })

      if (data.cancelled) {
        return {
          cancelled: true,
          streamed: true,
          output: [],
          newState: {
            ...state,
            cwd: data.cwd ?? state.cwd,
            prevCwd: data.prevCwd ?? state.prevCwd,
            gitBranch: data.gitBranch ?? state.gitBranch,
            home: state.home,
          },
        }
      }

      if (!data.ok) {
        return { output: [data.error || 'Perintah gagal'], newState: state }
      }

      return {
        streamed: true,
        output: [],
        newState: {
          ...state,
          cwd: data.cwd ?? state.cwd,
          prevCwd: data.prevCwd ?? state.prevCwd,
          gitBranch: data.gitBranch ?? null,
          home: state.home,
        },
        clear: data.clear,
      }
    }

    const data = await execShell(trimmed, state.cwd, state.prevCwd)
    if (!data.ok) {
      return { output: [data.error || 'Perintah gagal'], newState: state }
    }

    return {
      output: data.output ?? [],
      newState: {
        ...state,
        cwd: data.cwd ?? state.cwd,
        prevCwd: data.prevCwd ?? state.prevCwd,
        gitBranch: data.gitBranch ?? null,
        home: state.home,
      },
      clear: data.clear,
    }
  } catch (err) {
    return {
      output: [err?.message || 'Backend Laragon tidak tersedia. Buka via http://terminal.test'],
      newState: state,
    }
  }
}

export function createRealState(apiData) {
  return {
    ...INITIAL_STATE,
    realMode: true,
    history: loadCommandHistory(),
    cwd: apiData.cwd,
    home: apiData.home,
    user: apiData.user,
    hostname: apiData.hostname,
    gitBranch: apiData.gitBranch ?? null,
    env: {
      ...INITIAL_STATE.env,
      HOME: apiData.home,
      USER: apiData.user,
      PWD: apiData.cwd,
    },
    aliases: {
      ...INITIAL_STATE.aliases,
      www: 'cd C:/laragon/www',
    },
  }
}
