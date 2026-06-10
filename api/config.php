<?php

return [
    'home_path' => 'C:/laragon/www',
    // false = akses seluruh drive/path Windows
    'restrict_paths' => false,
    // true = jalankan perintah shell apa pun (ipconfig, ping, docker, dll.)
    'allow_all_shell' => true,
    'allowed_shell' => [
        'git', 'npm', 'npx', 'node', 'php', 'composer', 'yarn', 'pnpm', 'python', 'pip',
        'ipconfig', 'ping', 'tracert', 'pathping', 'nslookup', 'netstat', 'arp', 'getmac',
        'systeminfo', 'tasklist', 'taskkill', 'whoami', 'hostname', 'ver', 'where', 'wmic',
        'powershell', 'pwsh', 'curl', 'wget', 'docker', 'kubectl', 'code', 'artisan',
        'mysql', 'mysqldump', 'redis-cli', 'sqlite3', 'ffmpeg', 'magick',
    ],
    'blocked_shell' => ['format', 'diskpart', 'bcdedit', 'reg delete'],
];
