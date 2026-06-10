const STORAGE_KEY = '@tahirwiyan/theme'

/** @type {Record<string, { id: string, label: string, desc: string, style: string, vars: Record<string,string> }>} */
export const THEMES = {
  tahirwiyan: {
    id: 'tahirwiyan',
    label: '@tahirwiyan',
    desc: 'Biru · cyan · hijau · kuning (default)',
    style: 'powerline',
    vars: {
      '--tw-user-bg': '#0077c2',
      '--tw-user-fg': '#ffffff',
      '--tw-path-bg': '#00b4d8',
      '--tw-path-fg': '#001219',
      '--tw-git-bg': '#2ecc71',
      '--tw-git-fg': '#0d2818',
      '--tw-shell-bg': '#f1c40f',
      '--tw-shell-fg': '#1a1500',
      '--term-bg': '#0c0c0c',
      '--term-text': '#cccccc',
      '--term-cursor': '#ffffff',
      '--app-bg': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      '--chrome-bg': '#2d2d2d',
      '--selection-bg': 'rgba(0, 180, 216, 0.35)',
    },
  },
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    desc: 'Ungu gelap klasik developer',
    style: 'powerline',
    vars: {
      '--tw-user-bg': '#bd93f9',
      '--tw-user-fg': '#282a36',
      '--tw-path-bg': '#8be9fd',
      '--tw-path-fg': '#282a36',
      '--tw-git-bg': '#50fa7b',
      '--tw-git-fg': '#282a36',
      '--tw-shell-bg': '#ff79c6',
      '--tw-shell-fg': '#282a36',
      '--term-bg': '#282a36',
      '--term-text': '#f8f8f2',
      '--term-cursor': '#f8f8f2',
      '--app-bg': 'linear-gradient(135deg, #191724 0%, #282a36 50%, #44475a 100%)',
      '--chrome-bg': '#44475a',
      '--selection-bg': 'rgba(189, 147, 249, 0.35)',
    },
  },
  nord: {
    id: 'nord',
    label: 'Nord',
    desc: 'Arctic biru abu minimalis',
    style: 'rounded',
    vars: {
      '--tw-user-bg': '#5e81ac',
      '--tw-user-fg': '#eceff4',
      '--tw-path-bg': '#88c0d0',
      '--tw-path-fg': '#2e3440',
      '--tw-git-bg': '#a3be8c',
      '--tw-git-fg': '#2e3440',
      '--tw-shell-bg': '#b48ead',
      '--tw-shell-fg': '#eceff4',
      '--term-bg': '#2e3440',
      '--term-text': '#d8dee9',
      '--term-cursor': '#eceff4',
      '--app-bg': 'linear-gradient(135deg, #2e3440 0%, #3b4252 50%, #434c5e 100%)',
      '--chrome-bg': '#3b4252',
      '--selection-bg': 'rgba(136, 192, 208, 0.35)',
    },
  },
  monokai: {
    id: 'monokai',
    label: 'Monokai',
    desc: 'Neon hijau kuning editor',
    style: 'powerline',
    vars: {
      '--tw-user-bg': '#a6e22e',
      '--tw-user-fg': '#272822',
      '--tw-path-bg': '#66d9ef',
      '--tw-path-fg': '#272822',
      '--tw-git-bg': '#fd971f',
      '--tw-git-fg': '#272822',
      '--tw-shell-bg': '#f92672',
      '--tw-shell-fg': '#ffffff',
      '--term-bg': '#272822',
      '--term-text': '#f8f8f2',
      '--term-cursor': '#f8f8f2',
      '--app-bg': 'linear-gradient(135deg, #1d1e19 0%, #272822 50%, #3e3d32 100%)',
      '--chrome-bg': '#3e3d32',
      '--selection-bg': 'rgba(166, 226, 46, 0.3)',
    },
  },
  catppuccin: {
    id: 'catppuccin',
    label: 'Catppuccin',
    desc: 'Pastel mocha lembut',
    style: 'rounded',
    vars: {
      '--tw-user-bg': '#cba6f7',
      '--tw-user-fg': '#1e1e2e',
      '--tw-path-bg': '#89b4fa',
      '--tw-path-fg': '#1e1e2e',
      '--tw-git-bg': '#a6e3a1',
      '--tw-git-fg': '#1e1e2e',
      '--tw-shell-bg': '#fab387',
      '--tw-shell-fg': '#1e1e2e',
      '--term-bg': '#1e1e2e',
      '--term-text': '#cdd6f4',
      '--term-cursor': '#cdd6f4',
      '--app-bg': 'linear-gradient(135deg, #11111b 0%, #1e1e2e 50%, #313244 100%)',
      '--chrome-bg': '#313244',
      '--selection-bg': 'rgba(203, 166, 247, 0.35)',
    },
  },
  gruvbox: {
    id: 'gruvbox',
    label: 'Gruvbox',
    desc: 'Retro warm earth tones',
    style: 'flat',
    vars: {
      '--tw-user-bg': '#458588',
      '--tw-user-fg': '#ebdbb2',
      '--tw-path-bg': '#b16286',
      '--tw-path-fg': '#282828',
      '--tw-git-bg': '#98971a',
      '--tw-git-fg': '#282828',
      '--tw-shell-bg': '#d79921',
      '--tw-shell-fg': '#282828',
      '--term-bg': '#282828',
      '--term-text': '#ebdbb2',
      '--term-cursor': '#ebdbb2',
      '--app-bg': 'linear-gradient(135deg, #1d2021 0%, #282828 50%, #3c3836 100%)',
      '--chrome-bg': '#3c3836',
      '--selection-bg': 'rgba(250, 189, 47, 0.3)',
    },
  },
  tokyo: {
    id: 'tokyo',
    label: 'Tokyo Night',
    desc: 'Biru malam neon',
    style: 'powerline',
    vars: {
      '--tw-user-bg': '#7aa2f7',
      '--tw-user-fg': '#1a1b26',
      '--tw-path-bg': '#2ac3de',
      '--tw-path-fg': '#1a1b26',
      '--tw-git-bg': '#9ece6a',
      '--tw-git-fg': '#1a1b26',
      '--tw-shell-bg': '#bb9af7',
      '--tw-shell-fg': '#1a1b26',
      '--term-bg': '#1a1b26',
      '--term-text': '#c0caf5',
      '--term-cursor': '#c0caf5',
      '--app-bg': 'linear-gradient(135deg, #0f0f14 0%, #1a1b26 50%, #24283b 100%)',
      '--chrome-bg': '#24283b',
      '--selection-bg': 'rgba(122, 162, 247, 0.35)',
    },
  },
  rosepine: {
    id: 'rosepine',
    label: 'Rosé Pine',
    desc: 'Ungu pink elegan',
    style: 'rounded',
    vars: {
      '--tw-user-bg': '#c4a7e7',
      '--tw-user-fg': '#191724',
      '--tw-path-bg': '#9ccfd8',
      '--tw-path-fg': '#191724',
      '--tw-git-bg': '#31748f',
      '--tw-git-fg': '#faf4ed',
      '--tw-shell-bg': '#ebbcba',
      '--tw-shell-fg': '#191724',
      '--term-bg': '#191724',
      '--term-text': '#e0def4',
      '--term-cursor': '#e0def4',
      '--app-bg': 'linear-gradient(135deg, #0f0d14 0%, #191724 50%, #1f1d2e 100%)',
      '--chrome-bg': '#26233a',
      '--selection-bg': 'rgba(196, 167, 231, 0.35)',
    },
  },
  onedark: {
    id: 'onedark',
    label: 'One Dark',
    desc: 'Atom editor classic',
    style: 'powerline',
    vars: {
      '--tw-user-bg': '#61afef',
      '--tw-user-fg': '#282c34',
      '--tw-path-bg': '#56b6c2',
      '--tw-path-fg': '#282c34',
      '--tw-git-bg': '#98c379',
      '--tw-git-fg': '#282c34',
      '--tw-shell-bg': '#e5c07b',
      '--tw-shell-fg': '#282c34',
      '--term-bg': '#282c34',
      '--term-text': '#abb2bf',
      '--term-cursor': '#abb2bf',
      '--app-bg': 'linear-gradient(135deg, #1e2127 0%, #282c34 50%, #353b45 100%)',
      '--chrome-bg': '#353b45',
      '--selection-bg': 'rgba(97, 175, 239, 0.35)',
    },
  },
  cyberpunk: {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    desc: 'Neon pink & cyan futuristik',
    style: 'flat',
    vars: {
      '--tw-user-bg': '#ff2a6d',
      '--tw-user-fg': '#0d0221',
      '--tw-path-bg': '#05d9e8',
      '--tw-path-fg': '#0d0221',
      '--tw-git-bg': '#d1f7ff',
      '--tw-git-fg': '#0d0221',
      '--tw-shell-bg': '#fcee0a',
      '--tw-shell-fg': '#0d0221',
      '--term-bg': '#0d0221',
      '--term-text': '#d1f7ff',
      '--term-cursor': '#fcee0a',
      '--app-bg': 'linear-gradient(135deg, #0d0221 0%, #1a0533 50%, #240046 100%)',
      '--chrome-bg': '#240046',
      '--selection-bg': 'rgba(255, 42, 109, 0.35)',
    },
  },
  solarized: {
    id: 'solarized',
    label: 'Solarized',
    desc: 'Solarized dark kontras rendah',
    style: 'rounded',
    vars: {
      '--tw-user-bg': '#268bd2',
      '--tw-user-fg': '#fdf6e3',
      '--tw-path-bg': '#2aa198',
      '--tw-path-fg': '#002b36',
      '--tw-git-bg': '#859900',
      '--tw-git-fg': '#002b36',
      '--tw-shell-bg': '#cb4b16',
      '--tw-shell-fg': '#fdf6e3',
      '--term-bg': '#002b36',
      '--term-text': '#839496',
      '--term-cursor': '#93a1a1',
      '--app-bg': 'linear-gradient(135deg, #001e26 0%, #002b36 50%, #073642 100%)',
      '--chrome-bg': '#073642',
      '--selection-bg': 'rgba(38, 139, 210, 0.35)',
    },
  },
  nightowl: {
    id: 'nightowl',
    label: 'Night Owl',
    desc: 'Biru malam untuk coding malam',
    style: 'powerline',
    vars: {
      '--tw-user-bg': '#82aaff',
      '--tw-user-fg': '#011627',
      '--tw-path-bg': '#21c7a8',
      '--tw-path-fg': '#011627',
      '--tw-git-bg': '#c792ea',
      '--tw-git-fg': '#011627',
      '--tw-shell-bg': '#ffcb8b',
      '--tw-shell-fg': '#011627',
      '--term-bg': '#011627',
      '--term-text': '#d6deeb',
      '--term-cursor': '#d6deeb',
      '--app-bg': 'linear-gradient(135deg, #010e1a 0%, #011627 50%, #0b2942 100%)',
      '--chrome-bg': '#0b2942',
      '--selection-bg': 'rgba(130, 170, 255, 0.35)',
    },
  },
  material: {
    id: 'material',
    label: 'Material',
    desc: 'Material design gelap',
    style: 'flat',
    vars: {
      '--tw-user-bg': '#82b1ff',
      '--tw-user-fg': '#212121',
      '--tw-path-bg': '#80cbc4',
      '--tw-path-fg': '#212121',
      '--tw-git-bg': '#c3e88d',
      '--tw-git-fg': '#212121',
      '--tw-shell-bg': '#ffcb6b',
      '--tw-shell-fg': '#212121',
      '--term-bg': '#212121',
      '--term-text': '#eeffff',
      '--term-cursor': '#eeffff',
      '--app-bg': 'linear-gradient(135deg, #121212 0%, #212121 50%, #303030 100%)',
      '--chrome-bg': '#303030',
      '--selection-bg': 'rgba(130, 177, 255, 0.35)',
    },
  },
}

const SEG_KEYS = {
  user: ['--tw-user-bg', '--tw-user-fg'],
  path: ['--tw-path-bg', '--tw-path-fg'],
  git: ['--tw-git-bg', '--tw-git-fg'],
  shell: ['--tw-shell-bg', '--tw-shell-fg'],
}

export function getTheme(id) {
  return THEMES[id] ?? THEMES.tahirwiyan
}

export function getCurrentThemeState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { id: 'tahirwiyan', style: 'powerline', custom: {} }
    const parsed = JSON.parse(raw)
    return {
      id: parsed.id && THEMES[parsed.id] ? parsed.id : 'tahirwiyan',
      style: parsed.style || THEMES[parsed.id]?.style || 'powerline',
      custom: parsed.custom || {},
    }
  } catch {
    return { id: 'tahirwiyan', style: 'powerline', custom: {} }
  }
}

function applyVarsToRoot(vars) {
  const root = document.documentElement
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
}

export function applyTheme(id, options = {}) {
  const theme = getTheme(id)
  const saved = getCurrentThemeState()
  const style = options.style || theme.style || saved.style
  const custom = options.custom ?? saved.custom ?? {}

  applyVarsToRoot({ ...theme.vars, ...custom })

  const root = document.documentElement
  root.setAttribute('data-theme', id)
  root.setAttribute('data-prompt-style', style)

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, style, custom }))
  } catch {
    // ignore
  }

  return { id, style, label: theme.label, desc: theme.desc }
}

export function loadSavedTheme() {
  const { id, style, custom } = getCurrentThemeState()
  return applyTheme(id, { style, custom })
}

export function setPromptStyle(style) {
  const allowed = ['powerline', 'rounded', 'flat']
  if (!allowed.includes(style)) return false
  const current = getCurrentThemeState()
  document.documentElement.setAttribute('data-prompt-style', style)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, style }))
  } catch {
    // ignore
  }
  return true
}

export function applyCustomColors(colorMap) {
  const current = getCurrentThemeState()
  const custom = { ...current.custom }

  for (const [seg, hex] of Object.entries(colorMap)) {
    const keys = SEG_KEYS[seg]
    if (!keys || !hex) continue
    custom[keys[0]] = hex
    if (colorMap[`${seg}Fg`]) custom[keys[1]] = colorMap[`${seg}Fg`]
  }

  return applyTheme(current.id, { style: current.style, custom })
}

export function parseThemeCustomArgs(args) {
  const colors = {}
  for (const arg of args) {
    const m = arg.match(/^--?(user|path|git|shell)(?:-?(fg|bg))?=(.+)$/i)
    if (!m) continue
    const seg = m[1].toLowerCase()
    const part = (m[2] || 'bg').toLowerCase()
    if (part === 'fg') colors[`${seg}Fg`] = m[3]
    else colors[seg] = m[3]
  }
  return colors
}

export function formatThemeList(activeId) {
  return Object.values(THEMES).map((t) => {
    const mark = t.id === activeId ? '●' : '○'
    return `  ${mark} ${t.id.padEnd(14)} ${t.label} — ${t.desc}`
  })
}

export function formatThemeInfo() {
  const { id, style, custom } = getCurrentThemeState()
  const theme = getTheme(id)
  const lines = [
    `Tema aktif: ${theme.label} (${id})`,
    `  Gaya prompt: ${style}`,
    `  ${theme.desc}`,
    '',
    'Perintah:',
    '  theme list              — daftar tema',
    '  theme set <nama>        — ganti tema',
    '  theme style powerline   — panah powerline',
    '  theme style rounded     — sudut membulat',
    '  theme style flat        — flat tanpa panah',
    '  theme custom --user=#hex --path=#hex --git=#hex --shell=#hex',
  ]
  if (Object.keys(custom).length) lines.push('', '  Custom override aktif')
  return lines
}
