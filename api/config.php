<?php

return [
    'home_path' => 'C:/laragon/www',
    // Saat buka PWA, otomatis jalankan npm run dev di folder app terminal
    'auto_start_dev_pwa' => true,
    // Saat buka PWA, otomatis jalankan Laragon jika Apache belum jalan
    'auto_start_laragon_pwa' => true,
    'laragon_path' => 'C:/laragon',
    // false = akses seluruh drive/path Windows
    'restrict_paths' => false,
    // true = jalankan perintah shell apa pun (ipconfig, ping, docker, dll.)
    'allow_all_shell' => true,
    // true = npm start / ng serve dibuka di jendela CMD Windows (log asli, tanpa stream PHP)
    'delegate_long_run_to_cmd' => true,
    'allowed_shell' => [
        'git', 'npm', 'npx', 'node', 'php', 'composer', 'yarn', 'pnpm', 'python', 'pip',
        'ipconfig', 'ping', 'tracert', 'pathping', 'nslookup', 'netstat', 'arp', 'getmac',
        'systeminfo', 'tasklist', 'taskkill', 'whoami', 'hostname', 'ver', 'where', 'wmic',
        'powershell', 'pwsh', 'curl', 'wget', 'docker', 'kubectl', 'code', 'artisan',
        'mysql', 'mysqldump', 'redis-cli', 'sqlite3', 'ffmpeg', 'magick',
    ],
    'blocked_shell' => ['format', 'diskpart', 'bcdedit', 'reg delete'],
];
