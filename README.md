# @tahirwiyan

Terminal web bergaya **PowerShell / oh-my-posh** yang berjalan di browser. Dibangun dengan **React + Vite** sebagai **PWA**, dengan backend **PHP** (Laragon) untuk menjalankan perintah shell Windows secara nyata.

> Akses terminal dari mana saja — desktop, tablet, atau install sebagai aplikasi di home screen.

---

## Daftar Isi

- [Fitur](#fitur)
- [Demo & Screenshot](#demo--screenshot)
- [Persyaratan](#persyaratan)
- [Instalasi](#instalasi)
- [Menjalankan](#menjalankan)
- [Mode Operasi](#mode-operasi)
- [Perintah](#perintah)
- [Tema & Kustomisasi](#tema--kustomisasi)
- [Pintasan Keyboard](#pintasan-keyboard)
- [Streaming & Proses Panjang](#streaming--proses-panjang)
- [Git & GitHub](#git--github)
- [Konfigurasi Backend](#konfigurasi-backend)
- [Struktur Proyek](#struktur-proyek)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)

---

## Fitur

### Terminal UI

| Fitur | Deskripsi |
|-------|-----------|
| **Prompt powerline** | Segmen berwarna: user · path · git branch · shell |
| **13 tema preset** | Dracula, Nord, Monokai, Catppuccin, Gruvbox, Tokyo Night, Rose Pine, One Dark, Cyberpunk, Solarized, Night Owl, Material, dan default @tahirwiyan |
| **3 gaya prompt** | `powerline` · `rounded` · `flat` |
| **Tema kustom** | Ubah warna per segmen via perintah `theme custom` |
| **Theme switcher** | Panel UI di pojok untuk ganti tema tanpa perintah |
| **Font JetBrains Mono** | Tipografi monospace yang nyaman dibaca |
| **Window chrome** | Tampilan mirip jendela terminal (tombol merah/kuning/hijau) |

### Shell & Perintah

| Fitur | Deskripsi |
|-------|-----------|
| **Mode REAL** | Jalankan perintah Windows asli via PHP (`git`, `npm`, `ipconfig`, dll.) |
| **Mode simulasi** | File system virtual saat backend offline |
| **Path Windows asli** | `cd D:\folder`, `C:\laragon\www`, semua drive |
| **Perintah built-in** | `ls`, `cd`, `cat`, `grep`, `tree`, `find`, `mkdir`, `rm`, dan lainnya |
| **History perintah** | ↑ / ↓ navigasi, tersimpan di `localStorage` (10 terakhir) |
| **Autocomplete `cd`** | Dropdown folder saat mengetik `cd`, Tab untuk pilih, ↑↓ navigasi |
| **Alias & export** | `alias`, `export`, `env`, `printenv` |

### Streaming & Performa

| Fitur | Deskripsi |
|-------|-----------|
| **Output streaming** | Baris demi baris secara real-time (NDJSON) |
| **Timer elapsed** | `MM:SS` saat proses berjalan |
| **Status bar dinamis** | Indikator fase webpack/Angular (`setup`, `building`, dll.) |
| **Long-running detach** | `npm start` lepas setelah 6 detik — input terminal tetap bebas |
| **Ctrl+C** | Hentikan proses + kill process tree Windows |
| **Smart scroll** | Scroll ke atas tidak ditarik paksa ke bawah; tombol **↓ Output terbaru** |
| **Auto port** | `npm start` otomatis cari port kosong (`--port`) |
| **Log tailing** | Output webpack/Angular mirip CMD (bukan pipe buffer) |

### PWA

| Fitur | Deskripsi |
|-------|-----------|
| **Installable** | Tambah ke home screen (Android / iOS / desktop) |
| **Offline shell** | UI di-cache via Workbox |
| **Auto-update** | Service worker update otomatis |
| **Prompt install** | Banner "Install @tahirwiyan" saat browser mendukung |

### Keamanan Backend

| Fitur | Deskripsi |
|-------|-----------|
| **Whitelist shell** | Daftar perintah yang diizinkan (konfigurasi) |
| **Blocklist** | `format`, `diskpart`, `bcdedit`, `reg delete` diblokir |
| **Sanitasi input** | Karakter shell berbahaya (`;`, `&`, `` ` ``, `<`, `>`) ditolak |
| **Path restriction** | Opsional — batasi akses ke folder tertentu |

---

## Demo & Screenshot

```
┌─────────────────────────────────────────────────────────┐
│ ● ● ●          @tahirwiyan — terminal                   │
├─────────────────────────────────────────────────────────┤
│ @tahirwiyan │ C: ~/terminal │ ⎇ main │ ❯ pwsh          │
│ npm start                                               │
│ ○ Memulai dev server...                          00:45  │
│ ...chunk files...                                       │
│ ✓ Angular Live Development Server listening on :4203      │
│ ● Server siap — proses masih jalan di background        │
│ @tahirwiyan │ C: ~/terminal │ ⎇ main │ ❯ pwsh          │
└─────────────────────────────────────────────────────────┘
```

---

## Persyaratan

- **Windows** (diuji di Windows 10/11)
- **[Laragon](https://laragon.org/)** — Apache + PHP 8.x
- **Node.js** 18+ (untuk build frontend)
- **Git for Windows** (untuk perintah `git` — biasanya sudah ada di Laragon)

---

## Instalasi

### 1. Clone repositori

```bash
git clone https://github.com/uhuy-cuy/terminal.git
cd terminal
```

Letakkan di folder Laragon, misalnya:

```
C:\laragon\www\terminal
```

### 2. Install dependensi frontend

```bash
npm install
```

### 3. Build production (opsional)

```bash
npm run build
```

Output ada di folder `dist/`.

### 4. Akses via Laragon

Buka di browser:

```
http://terminal.test
```

atau

```
http://localhost/terminal
```

> Pastikan virtual host Laragon sudah mengarah ke folder proyek ini.

---

## Menjalankan

### Development (hot reload)

```bash
npm run dev
```

Buka `http://localhost:5173` — API di-proxy ke Laragon (`/api` → `http://localhost/terminal/api`).

### Production

```bash
npm run build
npm run preview   # preview lokal dist/
```

Atau serve `dist/` + `api/` via Apache Laragon.

### Install sebagai PWA

1. Buka aplikasi di Chrome / Edge
2. Klik ikon **Install** di address bar, atau gunakan banner di aplikasi
3. Aplikasi muncul di home screen / Start Menu

---

## Mode Operasi

| Mode | Kondisi | Perilaku |
|------|---------|----------|
| **REAL** | Backend PHP online (Laragon) | Perintah shell dijalankan di Windows asli |
| **Simulasi** | Backend offline | File system virtual, perintah terbatas |

Saat mode REAL aktif, banner startup menampilkan:

```
@tahirwiyan terminal v1.0 — mode REAL
Home: C:/laragon/www · Akses: seluruh Windows
```

---

## Perintah

Ketik `help` di terminal untuk daftar lengkap. Ringkasan:

### Navigasi

```
cd, pwd, ls, ll, la, tree, find
```

### File

```
cat, head, tail, touch, mkdir, rm, cp, mv, wc
```

### Teks

```
echo, grep, sort, uniq
```

### Shell

```
clear, cls, history, alias, which, man, reset, exit
```

### Info

```
neofetch, theme, date, cal, uptime, whoami, hostname
```

### Windows / Shell (mode REAL)

```
ipconfig, ping, tracert, netstat, nslookup, arp, getmac
systeminfo, tasklist, taskkill, whoami, ver, where, wmic
git, npm, npx, node, php, composer, python, docker, ...
```

### Kill proses Node

```bash
# Hentikan server di terminal
Ctrl+C

# Lihat proses node
tasklist | findstr node

# Matikan semua node.exe
taskkill /IM node.exe /F

# Cek port
netstat -ano | findstr :4200
```

---

## Tema & Kustomisasi

### Via UI

Klik panel **Theme** di pojok kanan bawah → pilih preset → opsional ganti gaya prompt.

### Via perintah

```bash
theme                    # info tema aktif
theme list               # daftar 13 tema
theme set dracula        # ganti preset
theme style rounded      # powerline | rounded | flat
theme custom --user=#bd93f9 --path=#8be9fd --git=#50fa7b --shell=#ff79c6
```

### Tema tersedia

`tahirwiyan` · `dracula` · `nord` · `monokai` · `catppuccin` · `gruvbox` · `tokyo` · `rosepine` · `onedark` · `cyberpunk` · `solarized` · `nightowl` · `material`

Preferensi disimpan di `localStorage` (`@tahirwiyan/theme`).

---

## Pintasan Keyboard

| Pintasan | Aksi |
|----------|------|
| `Enter` | Jalankan perintah |
| `↑` / `↓` | Navigasi history perintah |
| `Tab` | Pilih item autocomplete `cd` |
| `Escape` | Tutup dropdown `cd` |
| `Ctrl+C` | Batalkan input / hentikan proses streaming |
| `Ctrl+L` | Clear layar |
| Klik area terminal | Fokus ke input |

---

## Streaming & Proses Panjang

### Perintah yang di-stream

Perintah shell seperti `git pull`, `npm start`, `ng serve`, `ping`, dll. mengirim output **baris per baris** via `api/stream.php`.

### `npm start` / Angular

- Port otomatis dicari jika bentrok (`4201+`)
- Fase **setup/building** bisa 2–5 menit tanpa log baru — normal, sama seperti CMD
- Setelah server listen, status bar hijau: **Server siap — proses masih jalan di background**
- Input terminal bebas dipakai sambil server jalan
- `Ctrl+C` menghentikan process tree (`taskkill /F /T`)

### Scroll output

- Auto-scroll hanya jika Anda di bagian bawah
- Scroll ke atas → posisi tetap; klik **↓ Output terbaru** untuk kembali

---

## Git & GitHub

### Setup awal (sekali)

```bash
git config --global user.name "Nama Anda"
git config --global user.email "email@github.com"
git config --global credential.helper manager-core
```

> Git Laragon memakai `manager-core`, bukan `manager`.

### Push

```bash
git add .
git commit -m "pesan commit"
git push -u origin main
```

### Login pertama kali

Popup **Git Credential Manager** muncul di Windows. Login via browser atau **Personal Access Token** GitHub.

> **Rekomendasi:** login pertama dari **PowerShell/CMD** agar credential tersimpan. Setelah itu push dari terminal web bisa langsung jalan.

### Ganti akun GitHub

```bash
cmdkey /delete:LegacyGeneric:target=git:https://github.com
```

Atau: **Credential Manager** → Windows Credentials → hapus `git:https://github.com` → push lagi.

Backend otomatis mengatur `HOME`, `USERPROFILE`, dan credential helper untuk Git di lingkungan PHP/Laragon.

---

## Konfigurasi Backend

File: [`api/config.php`](api/config.php)

```php
return [
    'home_path'       => 'C:/laragon/www',  // direktori awal terminal
    'restrict_paths'  => false,              // true = batasi akses folder
    'allow_all_shell' => true,               // true = semua perintah shell
    'allowed_shell'   => [ 'git', 'npm', ... ],
    'blocked_shell'   => [ 'format', 'diskpart', ... ],
];
```

| Opsi | Default | Keterangan |
|------|---------|------------|
| `home_path` | `C:/laragon/www` | Working directory awal |
| `restrict_paths` | `false` | `true` = hanya boleh akses di bawah `home_path` |
| `allow_all_shell` | `true` | `false` = hanya perintah di `allowed_shell` |
| `blocked_shell` | perintah berbahaya | Selalu diblokir |

---

## Struktur Proyek

```
terminal/
├── api/
│   ├── config.php          # konfigurasi backend
│   ├── index.php           # REST API (init, exec, listdir)
│   ├── stream.php          # streaming NDJSON untuk shell
│   └── ShellHandler.php    # logika shell, git env, npm port
├── public/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
├── scripts/
│   └── generate-icons.mjs  # generate ikon PWA
├── src/
│   ├── components/
│   │   ├── Terminal.jsx        # komponen utama
│   │   ├── TerminalPrompt.jsx  # prompt bersegmen
│   │   ├── ThemeSwitcher.jsx
│   │   ├── CdAutocomplete.jsx
│   │   └── InstallPWA.jsx
│   ├── utils/
│   │   ├── commands.js         # handler perintah lokal
│   │   ├── shellApi.js         # klien API backend
│   │   ├── themes.js           # 13 preset tema
│   │   ├── streamHelpers.js    # timer, fase webpack
│   │   ├── pathComplete.js     # autocomplete cd
│   │   └── historyStorage.js   # history localStorage
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js          # Vite + PWA + proxy API
└── package.json
```

### Alur eksekusi perintah

```
User input
    │
    ▼
commands.js ──► perintah lokal? ──► executeCommand() ──► output langsung
    │
    ▼ (mode REAL + shell command)
shellApi.js ──► stream.php ──► ShellHandler.php ──► proc_open (Windows)
    │
    ▼
NDJSON stream ──► Terminal.jsx (baris per baris + timer + scroll)
```

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | React 19, Vite 6 |
| PWA | vite-plugin-pwa, Workbox |
| Styling | CSS custom properties (tema) |
| Backend | PHP 8.x (Laragon Apache) |
| Shell | `proc_open` + `cmd /C` (Windows) |
| Font | JetBrains Mono (Google Fonts) |

---

## Troubleshooting

### Backend offline / mode simulasi

- Pastikan Laragon **Apache + PHP** running
- Buka via `http://terminal.test` atau `http://localhost/terminal`
- Cek `api/index.php?action=init` mengembalikan JSON

### `npm start` macet / tidak ada output

- Fase building Angular bisa 2–5 menit — tunggu
- Cek RAM: `tasklist | findstr node` — terlalu banyak `node.exe`?
- `taskkill /IM node.exe /F` lalu coba lagi

### Port sudah dipakai (`EADDRINUSE`)

```bash
netstat -ano | findstr :4200
taskkill /PID <id> /T /F
```

### Git: `fatal: $HOME not set`

Sudah ditangani backend — refresh halaman. Jika masih error, jalankan dari CMD:

```bash
git config --global credential.helper manager-core
```

### Git: `could not read Username`

Login pertama harus dari PowerShell/CMD (popup Windows). Setelah credential tersimpan, push dari web terminal berfungsi.

### Scroll tidak bisa ke atas

Refresh halaman — fitur smart scroll aktif setelah update terbaru.

---

## Lisensi

Proyek pribadi — [@uhuy-cuy](https://github.com/uhuy-cuy).

---

<p align="center">
  <strong>@tahirwiyan</strong> — terminal web untuk developer Windows
</p>
