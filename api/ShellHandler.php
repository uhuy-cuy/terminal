<?php

declare(strict_types=1);

class ShellHandler
{
    private string $homePath;
    private bool $restrictPaths;
    private bool $allowAllShell;
    /** @var string[] */
    private array $allowedShell;
    /** @var string[] */
    private array $blockedShell;
    private ?int $streamAssignedPort = null;
    private ?string $emittedPreviewUrl = null;
    private ?string $streamDetachedCommand = null;
    private ?string $streamDetachedCwd = null;

    /** @var resource[] Proses npm/ng yang sengaja tidak di-proc_close agar tetap hidup di Windows */
    private static array $keptAliveProcesses = [];

    public function __construct(array $config)
    {
        $homeResolved = realpath($config['home_path'] ?? 'C:/laragon/www');
        $this->homePath = $homeResolved ?: rtrim(str_replace('\\', '/', $config['home_path'] ?? 'C:/laragon/www'), '/');
        $this->restrictPaths = (bool) ($config['restrict_paths'] ?? false);
        $this->allowAllShell = (bool) ($config['allow_all_shell'] ?? false);
        $this->allowedShell = $config['allowed_shell'] ?? [];
        $this->blockedShell = array_map('strtolower', $config['blocked_shell'] ?? []);
    }

    public function init(bool $ensureLaragon = false): array
    {
        $appPath = realpath(dirname(__DIR__)) ?: dirname(__DIR__);
        $appPathNorm = $this->normalizePath($appPath);
        $vitePort = 5173;
        $laragonStatus = null;

        if ($ensureLaragon && ($this->getConfigFlag('auto_start_laragon_pwa') ?? true)) {
            $laragonStatus = $this->ensureLaragonStarted();
        }

        $devProcs = $this->listDevRelatedProcesses();
        $terminalDevPids = $this->collectProcessTreePids(
            $this->findDevServerSeedPids($appPathNorm, $devProcs),
            $devProcs,
        );
        $devProcessRunning = $terminalDevPids !== [];
        $viteRunning = $this->probeLocalHttp($vitePort) === 'ok';

        return [
            'ok' => true,
            'mode' => 'real',
            'cwd' => $this->homePath,
            'home' => $this->homePath,
            'user' => 'tahirwiyan',
            'hostname' => php_uname('n') ?: 'local',
            'gitBranch' => $this->detectGitBranch($this->homePath),
            'unrestricted' => !$this->restrictPaths,
            'appPath' => $appPathNorm,
            'vitePort' => $vitePort,
            'viteRunning' => $viteRunning,
            'devProcessRunning' => $devProcessRunning,
            'devProcessCount' => count($terminalDevPids),
            'terminalDevRunning' => $devProcessRunning || $viteRunning,
            'apacheRunning' => $this->isApacheListening(),
            'autoStartDevPwa' => (bool) ($this->getConfigFlag('auto_start_dev_pwa') ?? true),
            'autoStartLaragonPwa' => (bool) ($this->getConfigFlag('auto_start_laragon_pwa') ?? true),
            'laragon' => $laragonStatus,
        ];
    }

    /** @return array{ok: bool, started: bool, apache: bool, message: string, waitedMs?: int} */
    public function ensureLaragonStarted(): array
    {
        if (!($this->getConfigFlag('auto_start_laragon_pwa') ?? true)) {
            return [
                'ok' => true,
                'started' => false,
                'apache' => $this->isApacheListening(),
                'message' => 'auto_start_laragon_pwa dinonaktifkan',
            ];
        }

        $root = $this->resolveLaragonRoot();
        if ($root === null) {
            return [
                'ok' => false,
                'started' => false,
                'apache' => $this->isApacheListening(),
                'message' => 'laragon.exe tidak ditemukan',
            ];
        }

        if ($this->isApacheListening()) {
            return [
                'ok' => true,
                'started' => false,
                'apache' => true,
                'message' => 'Apache sudah aktif — Laragon tidak dijalankan ulang',
            ];
        }

        $laragonAlreadyUp = $this->isLaragonAppRunning();
        if ($laragonAlreadyUp) {
            $this->triggerLaragonStartAll($root);
        } else {
            $this->spawnLaragonExe($root);
        }

        $waitedMs = 0;
        for ($i = 0; $i < 40; $i++) {
            if ($this->isApacheListening()) {
                return [
                    'ok' => true,
                    'started' => !$laragonAlreadyUp,
                    'apache' => true,
                    'message' => $laragonAlreadyUp
                        ? 'Laragon sudah jalan — Apache siap'
                        : 'Laragon & Apache siap',
                    'waitedMs' => $waitedMs,
                ];
            }
            usleep(500000);
            $waitedMs += 500;
        }

        return [
            'ok' => true,
            'started' => true,
            'apache' => false,
            'message' => 'Laragon diluncurkan — Apache belum ready (tunggu 10-20 detik)',
            'waitedMs' => $waitedMs,
        ];
    }

    private function resolveLaragonRoot(): ?string
    {
        $configured = $this->getConfigFlag('laragon_path');
        if (is_string($configured) && $configured !== '') {
            $path = realpath(str_replace('\\', '/', $configured));
            if ($path && is_file($path . DIRECTORY_SEPARATOR . 'laragon.exe')) {
                return $this->normalizePath($path);
            }
        }

        $home = str_replace('\\', '/', $this->homePath);
        if (preg_match('#^(.*)/laragon/www$#i', $home, $m)) {
            $guess = $m[1] . '/laragon';
            if (is_file(str_replace('/', DIRECTORY_SEPARATOR, $guess . '/laragon.exe'))) {
                return $guess;
            }
        }

        if (is_file('C:/laragon/laragon.exe')) {
            return 'C:/laragon';
        }

        return null;
    }

    private function isApacheListening(): bool
    {
        if ($this->findPidsOnPort(80) !== []) {
            return true;
        }

        return $this->probeLocalHttp(80, 0.5) !== 'fail';
    }

    private function isLaragonAppRunning(): bool
    {
        foreach ($this->listWinProcesses('laragon.exe') as $proc) {
            if ($proc['pid'] > 0) {
                return true;
            }
        }

        return false;
    }

    private function spawnLaragonExe(string $root): void
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return;
        }

        if ($this->isLaragonAppRunning() || $this->isApacheListening()) {
            return;
        }

        $exe = str_replace('/', '\\', $root) . '\\laragon.exe';
        if (!is_file($exe)) {
            return;
        }

        $cmd = 'start "" /MIN ' . escapeshellarg($exe);
        @pclose(@popen($cmd, 'r'));
    }

    private function triggerLaragonStartAll(string $root): void
    {
        if (PHP_OS_FAMILY !== 'Windows' || $this->isApacheListening()) {
            return;
        }

        $apacheVersion = $this->readLaragonApacheVersion($root);
        if ($apacheVersion === null) {
            return;
        }

        $httpd = str_replace(
            '/',
            '\\',
            $root . '/bin/apache/' . $apacheVersion . '/bin/httpd.exe',
        );
        $conf = str_replace('/', '\\', $root . '/etc/apache2/httpd.conf');
        if (!is_file($httpd) || !is_file($conf)) {
            return;
        }

        $cmd = 'start "" /MIN ' . escapeshellarg($httpd) . ' -f ' . escapeshellarg($conf);
        @pclose(@popen($cmd, 'r'));
    }

    private function readLaragonApacheVersion(string $root): ?string
    {
        $iniPath = str_replace('/', DIRECTORY_SEPARATOR, $root . '/usr/laragon.ini');
        if (!is_readable($iniPath)) {
            return 'httpd-2.4.54-win64-VS16';
        }

        $ini = parse_ini_file($iniPath, true, INI_SCANNER_RAW);
        $version = $ini['apache']['Version'] ?? null;

        return is_string($version) && $version !== '' ? $version : null;
    }

    private function getConfigFlag(string $key): mixed
    {
        static $config = null;
        if ($config === null) {
            $path = dirname(__DIR__) . '/config.php';
            $config = is_readable($path) ? (require $path) : [];
        }

        return $config[$key] ?? null;
    }

    public function listDirectory(string $cwd, string $relative = '.'): array
    {
        $relative = trim($relative);
        if ($relative === '') {
            $relative = '.';
        }

        try {
            if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $relative)) {
                $target = str_replace('/', DIRECTORY_SEPARATOR, $relative);
            } elseif ($relative === '.' || $relative === './') {
                $resolved = $this->resolveCwd($cwd);
                if (!$resolved) {
                    return ['ok' => false, 'error' => 'cwd tidak valid', 'entries' => []];
                }
                $target = $resolved;
            } else {
                $target = $this->resolvePath($cwd, rtrim(str_replace('/', DIRECTORY_SEPARATOR, $relative), DIRECTORY_SEPARATOR));
            }
        } catch (Throwable $e) {
            return ['ok' => false, 'error' => $e->getMessage(), 'entries' => []];
        }

        if (!is_dir($target)) {
            return ['ok' => false, 'error' => 'Bukan direktori', 'entries' => []];
        }

        $entries = [];
        $scan = scandir($target) ?: [];

        foreach ($scan as $entry) {
            if ($entry === '.' || $entry === '..') {
                $entries[] = ['name' => $entry, 'type' => 'dir'];
                continue;
            }
            $full = $target . DIRECTORY_SEPARATOR . $entry;
            $entries[] = [
                'name' => $entry,
                'type' => is_dir($full) ? 'dir' : 'file',
            ];
        }

        usort($entries, static function (array $a, array $b): int {
            if ($a['name'] === '..') {
                return -1;
            }
            if ($b['name'] === '..') {
                return 1;
            }
            if ($a['name'] === '.') {
                return -1;
            }
            if ($b['name'] === '.') {
                return 1;
            }
            if ($a['type'] !== $b['type']) {
                return $a['type'] === 'dir' ? -1 : 1;
            }
            return strcasecmp($a['name'], $b['name']);
        });

        return [
            'ok' => true,
            'path' => $this->normalizePath($target),
            'entries' => $entries,
        ];
    }

    public function execute(string $command, string $cwd, ?string $prevCwd = null): array
    {
        $command = trim($this->normalizeCommandInput($command));
        if ($command === '') {
            return $this->wrap($cwd, []);
        }

        if ($this->looksLikePath($command)) {
            return $this->cmdCd($cwd, $command, $prevCwd);
        }

        $tokens = $this->parseArgs($command);
        $cmd = strtolower($tokens[0] ?? '');
        $args = array_slice($tokens, 1);

        switch ($cmd) {
            case 'cd':
                return $this->cmdCd($cwd, $args[0] ?? '~', $prevCwd);
            case 'pwd':
                return $this->wrap($cwd, [$cwd]);
            case 'ls':
            case 'dir':
                return $this->cmdLs($cwd, $args);
            case 'cat':
            case 'type':
                return $this->cmdCat($cwd, $args);
            case 'head':
                return $this->cmdHeadTail($cwd, $args, true);
            case 'tail':
                return $this->cmdHeadTail($cwd, $args, false);
            case 'touch':
                return $this->cmdTouch($cwd, $args);
            case 'mkdir':
            case 'md':
                return $this->cmdMkdir($cwd, $args);
            case 'rm':
            case 'del':
                return $this->cmdRm($cwd, $args);
            case 'cp':
            case 'copy':
                return $this->cmdCp($cwd, $args);
            case 'mv':
            case 'move':
                return $this->cmdMv($cwd, $args);
            case 'echo':
                return $this->wrap($cwd, [implode(' ', $args)]);
            case 'find':
                return $this->cmdFind($cwd, $args);
            case 'tree':
                return $this->cmdTree($cwd, $args);
            case 'wc':
                return $this->cmdWc($cwd, $args);
            case 'grep':
                return $this->cmdGrep($cwd, $args);
            case 'clear':
            case 'cls':
                return ['ok' => true, 'output' => [], 'cwd' => $cwd, 'clear' => true, 'gitBranch' => $this->detectGitBranch($cwd)];
            case 'killport':
            case 'kp':
                return $this->cmdKillPort($cwd, $args);
            case 'killnode':
            case 'kn':
                return $this->cmdKillNode($cwd, $args);
            case 'ports':
            case 'listen':
                return $this->cmdPorts($cwd, $args);
            case 'running':
            case 'rn':
            case 'dev':
                return $this->cmdRunning($cwd);
            default:
                if ($this->isAllowedShell($cmd)) {
                    return $this->runShell($command, $cwd);
                }
                return $this->wrap($cwd, ["{$cmd}: command not found. Ketik 'help' untuk bantuan."]);
        }
    }

    private function cmdPorts(string $cwd, array $args): array
    {
        $filter = null;
        $raw = trim((string) ($args[0] ?? ''));
        if ($raw !== '') {
            $filter = $this->parsePortArg($raw);
            if ($filter === null && preg_match('/^\d{1,5}$/', $raw)) {
                $filter = (int) $raw;
            }
            if ($filter === null) {
                return $this->wrap($cwd, ["ports: port tidak valid — {$raw}"]);
            }
        }

        $entries = $this->listListeningEntries($filter);
        if ($entries === []) {
            $msg = $filter !== null
                ? "Tidak ada proses LISTENING di port {$filter}"
                : 'Tidak ada port LISTENING terdeteksi';
            return $this->wrap($cwd, [$msg]);
        }

        $pids = array_values(array_unique(array_column($entries, 'pid')));
        $names = $this->resolveProcessNames($pids);

        $lines = [
            sprintf('%-6s  %-7s  %-16s  %s', 'PORT', 'PID', 'PROSES', 'ALAMAT'),
            str_repeat('-', 52),
        ];

        usort($entries, static fn(array $a, array $b): int => $a['port'] <=> $b['port'] ?: $a['pid'] <=> $b['pid']);

        foreach ($entries as $entry) {
            $name = $names[$entry['pid']] ?? '?';
            $lines[] = sprintf(
                '%-6d  %-7d  %-16s  %s',
                $entry['port'],
                $entry['pid'],
                substr($name, 0, 16),
                $entry['addr']
            );
        }

        $lines[] = '';
        $lines[] = count($entries) . ' listener · killport <port> untuk hentikan';

        return $this->wrap($cwd, $lines);
    }

    private function cmdKillPort(string $cwd, array $args): array
    {
        $raw = trim((string) ($args[0] ?? ''));
        if ($raw === '') {
            return $this->wrap($cwd, [
                'Usage: killport <port|url>',
                '  killport 4201',
                '  killport http://localhost:4201/',
                '  kp 5173                    — alias singkat',
                '',
                'Menghentikan listener + worker node/npm terkait port & folder ini.',
                'Jika masih berat: killnode',
            ]);
        }

        $port = $this->parsePortArg($raw);
        if ($port === null) {
            return $this->wrap($cwd, ["killport: port tidak valid — {$raw}"]);
        }

        return $this->killByPort($cwd, $port);
    }

    private function cmdKillNode(string $cwd, array $args): array
    {
        $raw = strtolower(trim((string) ($args[0] ?? '')));

        if ($raw === '' || $raw === 'here' || $raw === 'cwd') {
            return $this->killByCwd($cwd);
        }

        if ($raw === 'all') {
            return $this->killAllNode();
        }

        if (preg_match('/^\d{1,5}$/', $raw)) {
            return $this->killByPort($cwd, (int) $raw);
        }

        return $this->wrap($cwd, [
            'Usage: killnode [opsi]',
            '  killnode           — hentikan node/npm di folder kerja ini (+ child)',
            '  killnode 4201        — sama seperti killport 4201',
            '  killnode all         — hentikan SEMUA node.exe (hati-hati)',
            '  kn                   — alias singkat',
        ]);
    }

    private function killByPort(string $cwd, int $port): array
    {
        $allProcs = $this->listDevRelatedProcesses();
        $pids = array_merge(
            $this->findPidsOnPort($port),
            $this->findPidsByPortHint($port, $allProcs),
            $this->findDevServerSeedPids($cwd, $allProcs),
        );
        $pids = $this->collectProcessTreePids($pids, $allProcs);

        if ($pids === []) {
            return $this->wrap($cwd, [
                "killport: tidak ada proses terkait port {$port}",
                'Coba: killnode — untuk bersihkan semua node di folder ini',
            ]);
        }

        $killResult = $this->executeKillPids($pids, "Port {$port}", $allProcs);
        $lines = $killResult['lines'];
        usleep(400000);

        $stillListen = $this->findPidsOnPort($port);
        if ($stillListen === []) {
            $lines[] = "✓ Port {$port} bebas";
        } else {
            $lines[] = '⚠ Port masih LISTENING — PID: ' . implode(', ', $stillListen);
            $lines[] = 'Jalankan: killnode';
        }

        $left = count($this->findPidsByCwd($cwd, $this->listWinProcesses()));
        if ($left > 0) {
            $lines[] = "⚠ Masih {$left} proses node/npm di folder ini — jalankan: killnode";
        }

        return $this->wrap($cwd, $lines);
    }

    private function killByCwd(string $cwd): array
    {
        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            return $this->wrap($cwd, ['killnode: cwd tidak valid']);
        }

        $allProcs = $this->listDevRelatedProcesses();
        $pids = $this->collectProcessTreePids($this->findDevServerSeedPids($cwd, $allProcs), $allProcs);

        if ($pids === []) {
            return $this->wrap($cwd, ['killnode: tidak ada proses node/npm di folder ini']);
        }

        $killResult = $this->executeKillPids($pids, 'Folder ' . $this->normalizePath($cwdReal), $allProcs);
        $lines = $killResult['lines'];

        if ($killResult['killed'] === 0) {
            $ports = $this->collectDevPortsForCwd($cwd, $allProcs);
            foreach ($ports as $port) {
                foreach (array_unique($this->findPidsOnPort($port)) as $portPid) {
                    if (!$this->pidExists($portPid)) {
                        continue;
                    }
                    $result = $this->killPidTree($portPid);
                    $lines[] = $result . " · port {$port} · PID {$portPid}";
                    if (str_starts_with($result, '✓') || str_starts_with($result, '⊙')) {
                        $killResult['killed']++;
                    }
                }
            }
            if ($killResult['killed'] > 0) {
                $lines[] = '→ fallback killport: ' . $killResult['killed'] . ' proses dihentikan';
            }
        }

        usleep(400000);

        $left = $this->countDevProcessesInCwd($cwd);
        $ports = $this->collectDevPortsForCwd($cwd, $this->listDevRelatedProcesses());
        $portHint = $ports !== [] ? implode(', ', $ports) : '4201';

        if ($left === 0 && $killResult['killed'] > 0) {
            $lines[] = '✓ Semua proses node/npm di folder ini dihentikan';
        } elseif ($left === 0) {
            $lines[] = '⊙ Tidak ada proses aktif di folder ini (sudah bersih)';
        } elseif ($killResult['killed'] > 0) {
            $lines[] = "⚠ Masih {$left} proses aktif — jalankan killnode lagi";
        } else {
            $lines[] = "⚠ Masih {$left} proses aktif — coba: killport {$portHint}";
        }

        return $this->wrap($cwd, $lines);
    }

    private function killAllNode(): array
    {
        $pids = array_column($this->listWinProcesses('node.exe'), 'pid');
        $pids = array_values(array_unique(array_filter($pids)));

        if ($pids === []) {
            return $this->wrap(getcwd() ?: 'C:/', ['killnode: tidak ada proses node.exe']);
        }

        $killResult = $this->executeKillPids($pids, 'Semua node.exe');
        $lines = $killResult['lines'];
        $lines[] = '✓ Perintah killnode all selesai — cek Task Manager jika masih ada';

        return $this->wrap(getcwd() ?: 'C:/', $lines);
    }

    /**
     * @param int[] $pids
     * @param list<array{pid: int, ppid: int, name: string, cmd: string}>|null $allProcs
     * @return array{lines: string[], killed: int, roots: int}
     */
    private function executeKillPids(array $pids, string $label, ?array $allProcs = null): array
    {
        if ($allProcs !== null) {
            $byPid = [];
            foreach ($allProcs as $proc) {
                $byPid[$proc['pid']] = $proc;
            }
            $pids = $this->reduceToKillRoots($pids, $byPid);
        }

        $pids = array_values(array_unique(array_filter($pids, static fn(int $p): bool => $p > 0)));

        if ($pids === []) {
            return [
                'lines' => [$label . ' — tidak ada PID untuk dihentikan'],
                'killed' => 0,
                'roots' => 0,
            ];
        }

        $names = $this->resolveProcessNames($pids);
        $treeSize = count($pids);
        $lines = [sprintf('%s — menghentikan %d proses induk (+ child otomatis)...', $label, $treeSize)];
        $killed = 0;

        rsort($pids);
        foreach ($pids as $pid) {
            if (!$this->pidExists($pid)) {
                $lines[] = "⊙ PID {$pid} sudah tidak ada (mati dari kill sebelumnya)";
                continue;
            }

            $result = $this->killPidTree($pid);
            $name = substr($names[$pid] ?? '?', 0, 20);
            $lines[] = $result . " · {$name} · PID {$pid}";
            if (str_starts_with($result, '✓') || str_starts_with($result, '⊙')) {
                $killed++;
            }
        }

        $lines[] = "→ {$killed}/{$treeSize} proses induk dihentikan";

        return ['lines' => $lines, 'killed' => $killed, 'roots' => $treeSize];
    }

    private function pidExists(int $pid): bool
    {
        if ($pid <= 0) {
            return false;
        }

        if (PHP_OS_FAMILY === 'Windows') {
            $script = 'if (Get-Process -Id ' . $pid . ' -ErrorAction SilentlyContinue) { Write-Output 1 } else { Write-Output 0 }';
            $cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command ' . escapeshellarg($script);
            $out = trim((string) shell_exec($cmd));
            if ($out === '1') {
                return true;
            }
            if ($out === '0') {
                return false;
            }
        }

        $output = [];
        @exec('tasklist /FI "PID eq ' . $pid . '" /FO CSV /NH 2>NUL', $output);
        foreach ($output as $line) {
            if (preg_match('/"(\d+)"/', $line, $m) && (int) $m[1] === $pid) {
                return true;
            }
        }

        return false;
    }

    /**
     * Hanya kill akar pohon — taskkill /T sudah membunuh anak, hindari kill PID anak satu per satu.
     *
     * @param int[] $pids
     * @param array<int, array{pid: int, ppid: int, name: string, cmd: string}> $byPid
     * @return int[]
     */
    private function reduceToKillRoots(array $pids, array $byPid): array
    {
        $set = array_fill_keys($pids, true);
        $roots = [];

        foreach ($pids as $pid) {
            $ppid = (int) ($byPid[$pid]['ppid'] ?? 0);
            if ($ppid > 0 && isset($set[$ppid])) {
                continue;
            }
            $roots[] = $pid;
        }

        return array_values(array_unique($roots));
    }

    private function countDevProcessesInCwd(string $cwd): int
    {
        $allProcs = $this->listDevRelatedProcesses();

        return count($this->collectProcessTreePids($this->findDevServerSeedPids($cwd, $allProcs), $allProcs));
    }

    private function parsePortArg(string $raw): ?int
    {
        if (preg_match('/:(\d{1,5})(?:\/|$|\s)/', $raw, $m)) {
            $port = (int) $m[1];
            return ($port >= 1 && $port <= 65535) ? $port : null;
        }

        if (preg_match('/^\d{1,5}$/', $raw)) {
            $port = (int) $raw;
            return ($port >= 1 && $port <= 65535) ? $port : null;
        }

        return null;
    }

    /**
     * @return list<array{port: int, pid: int, addr: string}>
     */
    private function listListeningEntries(?int $filterPort = null): array
    {
        $output = [];
        @exec('netstat -ano 2>NUL', $output);

        $entries = [];
        foreach ($output as $line) {
            if (!preg_match('/^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/i', $line, $m)) {
                continue;
            }

            $port = (int) $m[2];
            $pid = (int) $m[3];
            if ($pid <= 0 || ($filterPort !== null && $port !== $filterPort)) {
                continue;
            }

            $key = $port . ':' . $pid . ':' . $m[1];
            $entries[$key] = [
                'port' => $port,
                'pid' => $pid,
                'addr' => $m[1],
            ];
        }

        return array_values($entries);
    }

    /** @return int[] */
    private function findPidsOnPort(int $port): array
    {
        $pids = [];
        foreach ($this->listListeningEntries($port) as $entry) {
            $pids[] = $entry['pid'];
        }

        return array_values(array_unique($pids));
    }

    private function isBroadParentCwd(string $cwdReal): bool
    {
        $norm = strtolower(str_replace('\\', '/', $this->normalizePath($cwdReal)));

        return (bool) preg_match('#/(www|htdocs|public_html|wwwroot)$#', $norm);
    }

    /** @return 'ok'|'empty'|'fail' */
    private function probeLocalHttp(int $port, float $timeoutSec = 0.8): string
    {
        $errno = 0;
        $errstr = '';
        $fp = @fsockopen('127.0.0.1', $port, $errno, $errstr, $timeoutSec);
        if ($fp === false) {
            return 'fail';
        }

        stream_set_timeout($fp, (int) ceil($timeoutSec));
        @fwrite($fp, "GET / HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
        $chunk = @fread($fp, 768);
        @fclose($fp);

        if (!is_string($chunk) || $chunk === '') {
            return 'empty';
        }

        if (preg_match('/HTTP\/\d\.\d\s+(200|304|301|302)/i', $chunk)) {
            return 'ok';
        }

        return strlen($chunk) > 48 ? 'ok' : 'empty';
    }

    private function describeHttpProbe(int $port): string
    {
        $probe = $this->probeLocalHttp($port);
        if ($probe === 'ok') {
            return '✓ HTTP merespons — http://localhost:' . $port . '/';
        }
        if ($probe === 'empty') {
            return '△ port terbuka tapi halaman kosong — tunggu compile Angular selesai';
        }

        return '✗ port LISTENING tapi HTTP tidak merespons — killnode lalu npm start sekali';
    }

    private function countAngularLikeProcesses(array $pids, array $byPid): int
    {
        $count = 0;
        foreach ($pids as $pid) {
            $cmd = strtolower((string) ($byPid[$pid]['cmd'] ?? ''));
            if (
                str_contains($cmd, 'run-ng.js')
                || str_contains($cmd, 'ng serve')
                || str_contains($cmd, 'npm start')
                || str_contains($cmd, 'npm-cli.js')
            ) {
                $count++;
            }
        }

        return $count;
    }

    /** @param int[] $pids @return array<int, string> */
    private function resolveProcessNames(array $pids): array
    {
        if ($pids === []) {
            return [];
        }

        $want = array_fill_keys($pids, true);
        $map = [];
        $output = [];
        @exec('tasklist /FO CSV /NH 2>NUL', $output);

        foreach ($output as $line) {
            if (!preg_match('/"([^"]+)","(\d+)"/', $line, $m)) {
                continue;
            }
            $pid = (int) $m[2];
            if (isset($want[$pid])) {
                $map[$pid] = $m[1];
            }
        }

        return $map;
    }

    private function killPidTree(int $pid): string
    {
        if ($pid <= 0) {
            return '✗ PID tidak valid';
        }

        $output = [];
        $code = 1;

        if (PHP_OS_FAMILY === 'Windows') {
            @exec('taskkill /PID ' . $pid . ' /F /T 2>&1', $output, $code);
        } else {
            @exec('kill -9 ' . $pid . ' 2>&1', $output, $code);
        }

        if ($code === 0) {
            return "✓ PID {$pid} dihentikan (+ child process)";
        }

        $msg = trim(implode(' ', $output));
        if (stripos($msg, 'not found') !== false) {
            return "⊙ PID {$pid} sudah tidak ada";
        }

        return "✗ PID {$pid}" . ($msg !== '' ? ": {$msg}" : ': gagal dihentikan');
    }

    /**
     * @return list<array{pid: int, ppid: int, name: string, cmd: string}>
     */
    private function listWinProcesses(?string $name = null): array
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return [];
        }

        $filter = $name !== null
            ? " -Filter \"name='" . str_replace("'", "''", $name) . "'\""
            : '';

        $script = "Get-CimInstance Win32_Process{$filter}"
            . ' | Select-Object ProcessId,ParentProcessId,Name,CommandLine'
            . ' | ConvertTo-Json -Compress';

        $cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command ' . escapeshellarg($script);
        $raw = shell_exec($cmd);
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode(trim($raw), true);
        if (!is_array($decoded)) {
            return [];
        }

        if (isset($decoded['ProcessId'])) {
            $decoded = [$decoded];
        }

        $rows = [];
        foreach ($decoded as $row) {
            if (!is_array($row)) {
                continue;
            }
            $pid = (int) ($row['ProcessId'] ?? 0);
            if ($pid <= 0) {
                continue;
            }
            $rows[] = [
                'pid' => $pid,
                'ppid' => (int) ($row['ParentProcessId'] ?? 0),
                'name' => (string) ($row['Name'] ?? ''),
                'cmd' => (string) ($row['CommandLine'] ?? ''),
            ];
        }

        return $rows;
    }

    /**
     * Hanya proses dev (bukan seluruh Win32_Process) — jauh lebih cepat untuk `running`.
     *
     * @return list<array{pid: int, ppid: int, name: string, cmd: string}>
     */
    private function listDevRelatedProcesses(): array
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return $this->listWinProcesses();
        }

        $names = ['node.exe', 'npm.cmd', 'npx.cmd', 'ng.cmd', 'cmd.exe', 'esbuild.exe'];
        $quoted = implode(',', array_map(static fn(string $n): string => "'" . str_replace("'", "''", $n) . "'", $names));
        $script = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -in @(' . $quoted . ') }'
            . ' | Select-Object ProcessId,ParentProcessId,Name,CommandLine'
            . ' | ConvertTo-Json -Compress';

        $cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command ' . escapeshellarg($script);
        $raw = shell_exec($cmd);
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode(trim($raw), true);
        if (!is_array($decoded)) {
            return [];
        }

        if (isset($decoded['ProcessId'])) {
            $decoded = [$decoded];
        }

        $rows = [];
        foreach ($decoded as $row) {
            if (!is_array($row)) {
                continue;
            }
            $pid = (int) ($row['ProcessId'] ?? 0);
            if ($pid <= 0) {
                continue;
            }
            $rows[] = [
                'pid' => $pid,
                'ppid' => (int) ($row['ParentProcessId'] ?? 0),
                'name' => (string) ($row['Name'] ?? ''),
                'cmd' => (string) ($row['CommandLine'] ?? ''),
            ];
        }

        return $rows;
    }

    /** @return string[] */
    private function cwdNeedles(string $cwd): array
    {
        $n = $this->normalizePath($cwd);
        $needles = [
            $n,
            str_replace('/', '\\', $n),
            str_replace('\\', '/', $n),
        ];

        $parts = preg_split('/[\\\\\\/]+/', $n) ?: [];
        if (count($parts) >= 2) {
            $needles[] = $parts[count($parts) - 2] . DIRECTORY_SEPARATOR . $parts[count($parts) - 1];
            $needles[] = str_replace('\\', '/', $parts[count($parts) - 2] . '/' . $parts[count($parts) - 1]);
        }

        return array_values(array_unique(array_filter($needles, static fn(string $v): bool => strlen($v) >= 4)));
    }

    /**
     * @param list<array{pid: int, ppid: int, name: string, cmd: string}> $allProcs
     * @return int[]
     */
    private function findPidsByCwd(string $cwd, array $allProcs): array
    {
        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            return [];
        }

        $needles = $this->cwdNeedles($cwdReal);
        $wantNames = ['node.exe', 'npm.cmd', 'ng.cmd', 'npx.cmd', 'cmd.exe'];
        $pids = [];

        foreach ($allProcs as $proc) {
            if (!in_array(strtolower($proc['name']), $wantNames, true)) {
                continue;
            }
            $hay = strtolower($proc['cmd']);
            foreach ($needles as $needle) {
                if (str_contains($hay, strtolower($needle))) {
                    $pids[] = $proc['pid'];
                    break;
                }
            }
        }

        return array_values(array_unique($pids));
    }

    /**
     * @param list<array{pid: int, ppid: int, name: string, cmd: string}> $allProcs
     * @return int[]
     */
    private function findPidsByPortHint(int $port, array $allProcs): array
    {
        $portStr = (string) $port;
        $wantNames = ['node.exe', 'npm.cmd', 'ng.cmd', 'npx.cmd', 'cmd.exe'];
        $pids = [];

        foreach ($allProcs as $proc) {
            if (!in_array(strtolower($proc['name']), $wantNames, true)) {
                continue;
            }
            $cmd = strtolower($proc['cmd']);
            if (
                str_contains($cmd, ':' . $portStr)
                || str_contains($cmd, '--port ' . $portStr)
                || str_contains($cmd, '--port=' . $portStr)
                || preg_match('/\b' . preg_quote($portStr, '/') . '\b/', $cmd)
            ) {
                $pids[] = $proc['pid'];
            }
        }

        return array_values(array_unique($pids));
    }

    /**
     * @param int[] $seedPids
     * @param list<array{pid: int, ppid: int, name: string, cmd: string}> $allProcs
     * @return int[]
     */
    private function collectProcessTreePids(array $seedPids, array $allProcs): array
    {
        if ($seedPids === [] || $allProcs === []) {
            return array_values(array_unique(array_filter($seedPids)));
        }

        $byParent = [];
        $byPid = [];
        foreach ($allProcs as $proc) {
            $byParent[$proc['ppid']][] = $proc['pid'];
            $byPid[$proc['pid']] = $proc;
        }

        $treeNames = [
            'node.exe', 'npm.cmd', 'ng.cmd', 'npx.cmd', 'cmd.exe',
            'pwsh.exe', 'powershell.exe', 'conhost.exe',
        ];

        $found = [];
        $queue = array_values(array_unique(array_filter($seedPids)));

        while ($queue !== []) {
            $pid = array_shift($queue);
            if ($pid <= 0 || isset($found[$pid])) {
                continue;
            }
            $found[$pid] = true;

            foreach ($byParent[$pid] ?? [] as $child) {
                $queue[] = $child;
            }

            $ppid = $byPid[$pid]['ppid'] ?? 0;
            if ($ppid > 0 && !isset($found[$ppid]) && isset($byPid[$ppid])) {
                $pname = strtolower($byPid[$ppid]['name']);
                if (in_array($pname, $treeNames, true)) {
                    $queue[] = $ppid;
                }
            }
        }

        return array_map('intval', array_keys($found));
    }

    private function cmdRunning(string $cwd): array
    {
        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            return $this->wrap($cwd, ['running: cwd tidak valid']);
        }

        $cwdNorm = $this->normalizePath($cwdReal);
        $allProcs = $this->listDevRelatedProcesses();
        $pids = $this->collectProcessTreePids($this->findDevServerSeedPids($cwd, $allProcs), $allProcs);

        if ($pids === []) {
            $hints = [
                'Tidak ada npm/node/server dev yang terdeteksi di folder ini.',
                'Folder: ' . $cwdNorm,
            ];
            $pkgPort = $this->detectProjectDevPort($cwdReal);
            if ($pkgPort) {
                $hints[] = 'Port project (package.json): ' . $pkgPort . ' — jalankan npm start lalu running lagi';
            } else {
                $hints[] = 'Jalankan: npm start · Cek port: ports';
            }

            return $this->wrap($cwd, $hints);
        }

        $byPid = [];
        foreach ($allProcs as $proc) {
            $byPid[$proc['pid']] = $proc;
        }

        $listenByPid = [];
        foreach ($this->listListeningEntries() as $entry) {
            $listenByPid[$entry['pid']][] = $entry;
        }

        $names = $this->resolveProcessNames($pids);
        $lines = [
            'npm / server dev di folder ini:',
            'Folder: ' . $cwdNorm,
            '',
        ];

        if ($this->isBroadParentCwd($cwdReal)) {
            $lines[] = '⚠ Folder terlalu luas (parent www) — hasil campur vite terminal + angular.';
            $lines[] = '  cd ke folder project dulu (mis. cd hris_corp) lalu jalankan running lagi.';
            $lines[] = '';
        }

        $angularLike = $this->countAngularLikeProcesses($pids, $byPid);
        if ($angularLike > 2) {
            $lines[] = "⚠ {$angularLike} proses npm/angular terdeteksi — biasanya cukup 1.";
            $lines[] = '  Bersihkan: killnode · lalu npm start sekali (jangan dobel dari CMD + terminal web).';
            $lines[] = '';
        }

        $portsChecked = [];
        foreach ($pids as $pid) {
            foreach ($listenByPid[$pid] ?? [] as $entry) {
                $port = (int) $entry['port'];
                if ($port >= 1024 && $port <= 65535) {
                    $portsChecked[$port] = true;
                }
            }
        }
        ksort($portsChecked);

        if ($portsChecked !== []) {
            $lines[] = 'Cek HTTP (port proses di folder ini saja):';
            $probeLimit = 4;
            $probed = 0;
            foreach (array_keys($portsChecked) as $port) {
                if ($probed >= $probeLimit) {
                    $lines[] = '  … ' . (count($portsChecked) - $probeLimit) . ' port lain (hanya LISTENING, tanpa probe HTTP)';
                    break;
                }
                $lines[] = '  ' . $this->describeHttpProbe((int) $port);
                $probed++;
            }
            $lines[] = '';
        }

        foreach ($pids as $pid) {
            $proc = $byPid[$pid] ?? null;
            $name = $names[$pid] ?? ($proc['name'] ?? '?');
            $lines[] = "● PID {$pid} · {$name}";

            $cmd = trim((string) ($proc['cmd'] ?? ''));
            if ($cmd !== '') {
                $lines[] = '  ' . (strlen($cmd) > 96 ? substr($cmd, 0, 93) . '...' : $cmd);
            }

            foreach ($listenByPid[$pid] ?? [] as $entry) {
                $lines[] = '  → port ' . $entry['port'] . ' LISTENING · ' . $entry['addr'];
            }
            $lines[] = '';
        }

        $lines[] = count($pids) . ' proses · Hentikan: killnode · killport <port>';

        return $this->wrap($cwd, $lines);
    }

    private function cmdCd(string $cwd, ?string $target, ?string $prevCwd): array
    {
        if ($target === '-' && $prevCwd) {
            return $this->changeDir($prevCwd, $cwd, $cwd);
        }

        if ($target === null || $target === '' || $target === '~') {
            return $this->changeDir($this->homePath, $cwd, $this->homePath);
        }

        try {
            $resolved = $this->resolvePath($cwd, $target);
        } catch (RuntimeException $e) {
            return $this->wrap($cwd, ["cd: {$target}: " . $e->getMessage()]);
        }

        if (!is_dir($resolved)) {
            return $this->wrap($cwd, ["cd: {$target}: No such file or directory"]);
        }

        return $this->changeDir($resolved, $cwd, $resolved);
    }

    private function changeDir(string $newCwd, string $oldCwd, string $resolved): array
    {
        $normalized = $this->normalizePath($resolved);
        return [
            'ok' => true,
            'output' => [],
            'cwd' => $normalized,
            'prevCwd' => $this->normalizePath($oldCwd),
            'gitBranch' => $this->detectGitBranch($normalized),
        ];
    }

    private function cmdLs(string $cwd, array $args): array
    {
        $showAll = false;
        $long = false;
        $paths = [];

        foreach ($args as $arg) {
            if (str_starts_with($arg, '-')) {
                if (str_contains($arg, 'a')) $showAll = true;
                if (str_contains($arg, 'l')) $long = true;
            } else {
                $paths[] = $arg;
            }
        }

        if (!$paths) $paths = ['.'];
        $output = [];

        foreach ($paths as $p) {
            try {
                $target = $this->resolvePath($cwd, $p);
            } catch (RuntimeException $e) {
                return $this->wrap($cwd, ["ls: cannot access '{$p}': " . $e->getMessage()]);
            }

            if (!file_exists($target)) {
                return $this->wrap($cwd, ["ls: cannot access '{$p}': No such file or directory"]);
            }

            if (is_file($target)) {
                $output[] = $long ? $this->formatEntry(basename($target), $target) : basename($target);
                continue;
            }

            if (count($paths) > 1) $output[] = "{$p}:";

            $entries = scandir($target) ?: [];
            sort($entries);
            foreach ($entries as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                if (!$showAll && str_starts_with($entry, '.')) continue;
                $full = $target . DIRECTORY_SEPARATOR . $entry;
                if ($long) {
                    $output[] = $this->formatEntry($entry, $full);
                } else {
                    $output[] = is_dir($full) ? $entry . '/' : $entry;
                }
            }
        }

        return $this->wrap($cwd, $output);
    }

    private function formatEntry(string $name, string $full): string
    {
        $isDir = is_dir($full);
        $perm = $isDir ? 'drwxr-xr-x' : '-rw-r--r--';
        $size = $isDir ? '-' : (string) filesize($full);
        $date = date('M d H:i', filemtime($full) ?: time());
        $label = $isDir ? $name . '/' : $name;
        return sprintf('%-11s %4s %9s  %s  %s', $perm, '1', $size, $date, $label);
    }

    private function cmdCat(string $cwd, array $args): array
    {
        if (!$args) return $this->wrap($cwd, ['cat: missing file operand']);
        $output = [];
        foreach ($args as $arg) {
            try {
                $path = $this->resolvePath($cwd, $arg);
            } catch (RuntimeException $e) {
                $output[] = "cat: {$arg}: " . $e->getMessage();
                continue;
            }
            if (!file_exists($path)) {
                $output[] = "cat: {$arg}: No such file or directory";
                continue;
            }
            if (is_dir($path)) {
                $output[] = "cat: {$arg}: Is a directory";
                continue;
            }
            $content = file_get_contents($path);
            if ($content !== false) {
                $output = array_merge($output, preg_split('/\r\n|\r|\n/', $content) ?: []);
            }
        }
        return $this->wrap($cwd, $output);
    }

    private function cmdHeadTail(string $cwd, array $args, bool $head): array
    {
        $n = 10;
        $file = null;
        foreach ($args as $arg) {
            if (preg_match('/^-(\d+)$/', $arg, $m)) $n = (int) $m[1];
            else $file = $arg;
        }
        if (!$file) return $this->wrap($cwd, [($head ? 'head' : 'tail') . ': missing file operand']);

        try {
            $path = $this->resolvePath($cwd, $file);
        } catch (RuntimeException $e) {
            return $this->wrap($cwd, ["cat: {$file}: " . $e->getMessage()]);
        }

        if (!is_file($path)) return $this->wrap($cwd, ["cat: {$file}: No such file or directory"]);
        $lines = preg_split('/\r\n|\r|\n/', (string) file_get_contents($path)) ?: [];
        $slice = $head ? array_slice($lines, 0, $n) : array_slice($lines, -$n);
        return $this->wrap($cwd, $slice);
    }

    private function cmdTouch(string $cwd, array $args): array
    {
        if (!$args) return $this->wrap($cwd, ['touch: missing file operand']);
        foreach ($args as $arg) {
            try {
                $path = $this->resolvePath($cwd, $arg);
                $this->assertAllowed($path);
            } catch (RuntimeException $e) {
                return $this->wrap($cwd, ["touch: {$arg}: " . $e->getMessage()]);
            }
            if (is_dir($path)) return $this->wrap($cwd, ["touch: {$arg}: Is a directory"]);
            if (!file_exists($path)) {
                $dir = dirname($path);
                if (!is_dir($dir)) mkdir($dir, 0777, true);
                file_put_contents($path, '');
            } else {
                touch($path);
            }
        }
        return $this->wrap($cwd, []);
    }

    private function cmdMkdir(string $cwd, array $args): array
    {
        $recursive = in_array('-p', $args, true);
        $dirs = array_values(array_filter($args, fn($a) => !str_starts_with($a, '-')));
        if (!$dirs) return $this->wrap($cwd, ['mkdir: missing operand']);

        foreach ($dirs as $dir) {
            try {
                $path = $this->resolvePath($cwd, $dir);
                $this->assertAllowed(dirname($path));
            } catch (RuntimeException $e) {
                return $this->wrap($cwd, ["mkdir: cannot create directory '{$dir}': " . $e->getMessage()]);
            }
            if (file_exists($path)) return $this->wrap($cwd, ["mkdir: cannot create directory '{$dir}': File exists"]);
            if (!mkdir($path, 0777, $recursive)) {
                return $this->wrap($cwd, ["mkdir: cannot create directory '{$dir}'"]);
            }
        }
        return $this->wrap($cwd, []);
    }

    private function cmdRm(string $cwd, array $args): array
    {
        $recursive = in_array('-r', $args, true) || in_array('-rf', $args, true);
        $paths = array_values(array_filter($args, fn($a) => !str_starts_with($a, '-')));
        if (!$paths) return $this->wrap($cwd, ['rm: missing operand']);

        foreach ($paths as $p) {
            try {
                $path = $this->resolvePath($cwd, $p);
                $this->assertAllowed($path);
            } catch (RuntimeException $e) {
                return $this->wrap($cwd, ["rm: cannot remove '{$p}': " . $e->getMessage()]);
            }
            if (!file_exists($path)) return $this->wrap($cwd, ["rm: cannot remove '{$p}': No such file or directory"]);
            if (is_dir($path)) {
                if (!$recursive) return $this->wrap($cwd, ["rm: cannot remove '{$p}': Is a directory"]);
                $this->removeDir($path);
            } else {
                unlink($path);
            }
        }
        return $this->wrap($cwd, []);
    }

    private function cmdCp(string $cwd, array $args): array
    {
        if (count($args) < 2) return $this->wrap($cwd, ['cp: missing file operand']);
        try {
            $src = $this->resolvePath($cwd, $args[0]);
            $dest = $this->resolvePath($cwd, $args[1]);
            $this->assertAllowed($src);
            $this->assertAllowed(dirname($dest));
        } catch (RuntimeException $e) {
            return $this->wrap($cwd, ['cp: ' . $e->getMessage()]);
        }
        if (!file_exists($src)) return $this->wrap($cwd, ["cp: cannot stat '{$args[0]}': No such file or directory"]);
        if (is_dir($src)) return $this->wrap($cwd, ["cp: -r not implemented for directories"]);
        if (!copy($src, $dest)) return $this->wrap($cwd, ["cp: cannot create '{$args[1]}'"]);
        return $this->wrap($cwd, []);
    }

    private function cmdMv(string $cwd, array $args): array
    {
        if (count($args) < 2) return $this->wrap($cwd, ['mv: missing file operand']);
        try {
            $src = $this->resolvePath($cwd, $args[0]);
            $dest = $this->resolvePath($cwd, $args[1]);
            $this->assertAllowed($src);
            $this->assertAllowed(dirname($dest));
        } catch (RuntimeException $e) {
            return $this->wrap($cwd, ['mv: ' . $e->getMessage()]);
        }
        if (!file_exists($src)) return $this->wrap($cwd, ["mv: cannot stat '{$args[0]}': No such file or directory"]);
        if (!rename($src, $dest)) return $this->wrap($cwd, ["mv: cannot move to '{$args[1]}'"]);
        $newCwd = $cwd;
        if ($this->normalizePath($cwd) === $this->normalizePath($src)) {
            $newCwd = $this->normalizePath($dest);
        }
        return $this->wrap($newCwd, []);
    }

    private function cmdFind(string $cwd, array $args): array
    {
        $search = $cwd;
        $pattern = '*';
        if (isset($args[0])) {
            try { $search = $this->resolvePath($cwd, $args[0]); } catch (RuntimeException $e) {
                return $this->wrap($cwd, ["find: " . $e->getMessage()]);
            }
        }
        if (isset($args[1])) $pattern = $args[1];
        $regex = '/^' . str_replace(['.', '*'], ['\.', '.*'], preg_quote($pattern, '/')) . '$/i';
        $results = [];
        $this->walkFind($search, $regex, $results);
        return $this->wrap($cwd, $results);
    }

    private function walkFind(string $dir, string $regex, array &$results): void
    {
        if (!is_dir($dir)) return;
        $entries = scandir($dir) ?: [];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') continue;
            $full = $dir . DIRECTORY_SEPARATOR . $entry;
            try { $this->assertAllowed($full); } catch (RuntimeException) { continue; }
            if (preg_match($regex, $entry)) $results[] = $this->normalizePath($full);
            if (is_dir($full)) $this->walkFind($full, $regex, $results);
        }
    }

    private function cmdTree(string $cwd, array $args): array
    {
        $target = $cwd;
        if (isset($args[0])) {
            try { $target = $this->resolvePath($cwd, $args[0]); } catch (RuntimeException $e) {
                return $this->wrap($cwd, ["tree: " . $e->getMessage()]);
            }
        }
        if (!is_dir($target)) return $this->wrap($cwd, ["tree: {$args[0]}: Not a directory"]);
        $lines = [$this->normalizePath($target)];
        $this->buildTree($target, '', true, $lines);
        return $this->wrap($cwd, $lines);
    }

    private function buildTree(string $dir, string $prefix, bool $isLast, array &$lines): void
    {
        $entries = array_values(array_filter(scandir($dir) ?: [], fn($e) => $e !== '.' && $e !== '..'));
        sort($entries);
        foreach ($entries as $i => $entry) {
            $last = $i === count($entries) - 1;
            $full = $dir . DIRECTORY_SEPARATOR . $entry;
            try { $this->assertAllowed($full); } catch (RuntimeException) { continue; }
            $connector = $last ? '└── ' : '├── ';
            $lines[] = $prefix . $connector . $entry . (is_dir($full) ? '/' : '');
            if (is_dir($full)) {
                $ext = $last ? '    ' : '│   ';
                $this->buildTree($full, $prefix . $ext, $last, $lines);
            }
        }
    }

    private function cmdWc(string $cwd, array $args): array
    {
        $file = $args[count($args) - 1] ?? null;
        if (!$file) return $this->wrap($cwd, ['wc: missing file operand']);
        try { $path = $this->resolvePath($cwd, $file); } catch (RuntimeException $e) {
            return $this->wrap($cwd, ['wc: ' . $e->getMessage()]);
        }
        if (!is_file($path)) return $this->wrap($cwd, ["wc: {$file}: No such file"]);
        $content = (string) file_get_contents($path);
        $lines = $content === '' ? 0 : substr_count($content, "\n") + (str_ends_with($content, "\n") ? 0 : 1);
        $words = $content === '' ? 0 : str_word_count($content);
        $bytes = strlen($content);
        return $this->wrap($cwd, ["{$lines}  {$words}  {$bytes} {$file}"]);
    }

    private function cmdGrep(string $cwd, array $args): array
    {
        if (!isset($args[0])) return $this->wrap($cwd, ['grep: missing pattern']);
        if (!isset($args[1])) return $this->wrap($cwd, ['grep: missing file operand']);
        $pattern = $args[0];
        try { $path = $this->resolvePath($cwd, $args[1]); } catch (RuntimeException $e) {
            return $this->wrap($cwd, ['grep: ' . $e->getMessage()]);
        }
        if (!is_file($path)) return $this->wrap($cwd, ["grep: {$args[1]}: No such file"]);
        $lines = preg_split('/\r\n|\r|\n/', (string) file_get_contents($path)) ?: [];
        $matched = array_values(array_filter($lines, fn($l) => stripos($l, $pattern) !== false));
        return $this->wrap($cwd, $matched);
    }

    private function normalizeCommandInput(string $command): string
    {
        $command = str_replace(
            ["\u{2018}", "\u{2019}", "\u{2032}", "\u{201C}", "\u{201D}", "\u{2033}"],
            ["'", "'", "'", '"', '"', '"'],
            $command
        );

        // AutoCorrect Windows: -- sering jadi — atau —-
        $command = preg_replace('/\x{2014}-?/u', '--', $command) ?? $command;
        $command = preg_replace('/\x{2013}-?/u', '--', $command) ?? $command;
        $command = str_replace("\u{2212}", '-', $command);

        return $command;
    }

    private function runShell(string $command, string $cwd): array
    {
        $command = $this->normalizeCommandInput($command);

        if (preg_match('/[;&`<>]/', $command)) {
            return $this->wrap($cwd, ['Blocked: karakter shell berbahaya tidak diizinkan']);
        }

        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            return $this->wrap($cwd, ['cwd tidak valid']);
        }

        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open(
            'cmd /C ' . $command,
            $descriptors,
            $pipes,
            $cwdReal,
            $this->buildProcessEnv(),
            ['bypass_shell' => true]
        );

        if (!is_resource($proc)) {
            return $this->wrap($cwd, ['Gagal menjalankan perintah']);
        }

        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]) ?: '';
        $stderr = stream_get_contents($pipes[2]) ?: '';
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);

        $text = trim($stdout . ($stderr ? "\n" . $stderr : ''));
        $output = $text === '' ? [] : (preg_split('/\r\n|\r|\n/', $text) ?: []);

        return [
            'ok' => true,
            'output' => $output,
            'cwd' => $this->normalizePath($cwdReal),
            'gitBranch' => $this->detectGitBranch($cwdReal),
        ];
    }

    private function detectGitBranch(string $cwd): ?string
    {
        $gitDir = rtrim(str_replace('/', DIRECTORY_SEPARATOR, $cwd), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '.git';
        if (!is_dir($gitDir)) return null;

        $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open(
            'git branch --show-current',
            $descriptors,
            $pipes,
            str_replace('/', DIRECTORY_SEPARATOR, $cwd),
            $this->buildProcessEnv()
        );
        if (!is_resource($proc)) return null;
        fclose($pipes[0]);
        $branch = trim(stream_get_contents($pipes[1]) ?: '');
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        return $branch !== '' ? $branch : 'main';
    }

    private function isBuiltinCommand(string $cmd): bool
    {
        static $builtins = [
            'cd', 'pwd', 'ls', 'dir', 'cat', 'type', 'head', 'tail', 'touch',
            'mkdir', 'md', 'rm', 'del', 'cp', 'copy', 'mv', 'move', 'echo',
            'find', 'tree', 'wc', 'grep', 'clear', 'cls',             'killport', 'kp', 'killnode', 'kn', 'ports', 'listen',
            'running', 'rn', 'dev',
        ];

        return in_array(strtolower($cmd), $builtins, true);
    }

    private function isAllowedShell(string $cmd): bool
    {
        $cmd = strtolower($cmd);
        if ($this->isBuiltinCommand($cmd)) {
            return false;
        }
        if (in_array($cmd, $this->blockedShell, true)) {
            return false;
        }
        if ($this->allowAllShell) {
            return true;
        }
        return in_array($cmd, $this->allowedShell, true);
    }

    public function shouldStream(string $command): bool
    {
        $tokens = $this->parseArgs(trim($command));
        $cmd = strtolower($tokens[0] ?? '');
        return $this->isAllowedShell($cmd);
    }

    public function executeStreaming(string $command, string $cwd, ?string $prevCwd, callable $emit): void
    {
        $command = trim($this->normalizeCommandInput($command));
        $emit(['type' => 'start', 'command' => $command]);

        if ($command === '') {
            $emit(['type' => 'done', 'ok' => true, 'cwd' => $this->normalizePath($cwd), 'gitBranch' => $this->detectGitBranch($cwd)]);
            return;
        }

        $tokens = $this->parseArgs($command);
        $cmd = strtolower($tokens[0] ?? '');

        if ($this->isBuiltinCommand($cmd)) {
            $result = $this->execute($command, $cwd, $prevCwd);
            if (!empty($result['clear'])) {
                $emit(['type' => 'clear']);
            }
            foreach ($result['output'] ?? [] as $line) {
                $emit(['type' => 'line', 'text' => $line]);
            }
            $emit([
                'type' => 'done',
                'ok' => $result['ok'] ?? true,
                'cwd' => $result['cwd'] ?? $this->normalizePath($cwd),
                'prevCwd' => $result['prevCwd'] ?? null,
                'gitBranch' => $result['gitBranch'] ?? null,
                'clear' => $result['clear'] ?? false,
            ]);
            return;
        }

        if ($this->isAllowedShell($cmd)) {
            if ($this->shouldDelegateToExternalCmd($command)) {
                $finalCwd = $this->delegateToExternalCmd($command, $cwd, $emit);
                $emit([
                    'type' => 'done',
                    'ok' => true,
                    'cwd' => $this->normalizePath($finalCwd),
                    'gitBranch' => $this->detectGitBranch($finalCwd),
                    'clear' => false,
                    'delegatedToCmd' => true,
                ]);

                return;
            }

            $finalCwd = $this->runShellStream($this->enhanceStreamCommand($command, $cwd), $cwd, $emit);
            $emit([
                'type' => 'done',
                'ok' => true,
                'cwd' => $this->normalizePath($finalCwd),
                'gitBranch' => $this->detectGitBranch($finalCwd),
                'clear' => false,
            ]);
            return;
        }

        $result = $this->execute($command, $cwd, $prevCwd);
        if (!empty($result['clear'])) {
            $emit(['type' => 'clear']);
        }

        foreach ($result['output'] ?? [] as $line) {
            $emit(['type' => 'line', 'text' => $line]);
        }

        $emit([
            'type' => 'done',
            'ok' => $result['ok'] ?? true,
            'cwd' => $result['cwd'] ?? $this->normalizePath($cwd),
            'prevCwd' => $result['prevCwd'] ?? null,
            'gitBranch' => $result['gitBranch'] ?? null,
            'clear' => $result['clear'] ?? false,
        ]);
    }

    private function enhanceStreamCommand(string $command, string $cwd = '.'): string
    {
        $trimmed = trim($command);
        $this->streamAssignedPort = null;
        $cwdReal = $this->resolveCwd($cwd);

        if (preg_match('/--port[=\s]+(\d+)/i', $trimmed, $portMatch)) {
            $this->streamAssignedPort = (int) $portMatch[1];
        }

        if (preg_match('/^git\s+(pull|fetch|clone|push)(\s|$)/i', $trimmed) && !preg_match('/--progress/i', $trimmed)) {
            return $trimmed . ' --progress';
        }

        if (preg_match('/^npm\s+(run\s+)?start(\s|$)/i', $trimmed) && !preg_match('/--port\b/i', $trimmed)) {
            $pkgPort = $cwdReal ? $this->detectProjectDevPort($cwdReal) : null;
            if ($pkgPort !== null) {
                $this->streamAssignedPort = $pkgPort;

                return $trimmed;
            }

            $port = $this->pickAvailablePort(4201);
            $this->streamAssignedPort = $port;

            return $trimmed . ' -- --port ' . $port;
        }

        if ($this->streamAssignedPort === null && $cwdReal) {
            $this->streamAssignedPort = $this->detectProjectDevPort($cwdReal);
        }

        if (preg_match('/^npm\s+run\s+dev(\s|$)/i', $trimmed) && !preg_match('/--port\b/i', $trimmed)) {
            $port = ($cwdReal ? $this->detectProjectDevPort($cwdReal) : null) ?? $this->pickAvailablePort(5173);
            $this->streamAssignedPort = $port;
            return $trimmed . ' -- --port ' . $port;
        }

        if (preg_match('/^(npx\s+)?ng\s+serve(\s|$)/i', $trimmed) && !preg_match('/--port\b/i', $trimmed)) {
            $port = ($cwdReal ? $this->detectProjectDevPort($cwdReal) : null) ?? $this->pickAvailablePort(4201);
            $this->streamAssignedPort = $port;
            return $trimmed . ' --port ' . $port;
        }

        return $trimmed;
    }

    private function detectProjectDevPort(string $cwdReal): ?int
    {
        $pkgPath = $cwdReal . DIRECTORY_SEPARATOR . 'package.json';
        if (is_readable($pkgPath)) {
            $json = json_decode((string) file_get_contents($pkgPath), true);
            if (is_array($json)) {
                foreach (['start', 'dev', 'serve'] as $scriptKey) {
                    $script = (string) ($json['scripts'][$scriptKey] ?? '');
                    if (preg_match('/--port[=\s]+(\d+)/i', $script, $m)) {
                        $port = (int) $m[1];
                        if ($port >= 1 && $port <= 65535) {
                            return $port;
                        }
                    }
                }
            }
        }

        $angularPath = $cwdReal . DIRECTORY_SEPARATOR . 'angular.json';
        if (is_readable($angularPath)) {
            $json = json_decode((string) file_get_contents($angularPath), true);
            $projects = $json['projects'] ?? [];
            if (is_array($projects)) {
                foreach ($projects as $project) {
                    $port = $project['architect']['serve']['options']['port'] ?? null;
                    if (is_int($port) || (is_string($port) && ctype_digit($port))) {
                        return (int) $port;
                    }
                }
            }
        }

        return null;
    }

    /**
     * @param list<array{pid: int, ppid: int, name: string, cmd: string}> $allProcs
     * @return int[]
     */
    /** @return int[] */
    private function collectDevPortsForCwd(string $cwd, array $allProcs): array
    {
        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            return [];
        }

        $ports = [];
        $pkgPort = $this->detectProjectDevPort($cwdReal);
        if ($pkgPort) {
            $ports[$pkgPort] = true;
        }

        $seeds = $this->collectProcessTreePids($this->findPidsByCwd($cwd, $allProcs), $allProcs);
        $listenByPid = [];
        foreach ($this->listListeningEntries() as $entry) {
            $listenByPid[$entry['pid']][] = (int) $entry['port'];
        }
        foreach ($seeds as $pid) {
            foreach ($listenByPid[$pid] ?? [] as $port) {
                $ports[$port] = true;
            }
        }

        $isAngularProject = is_readable($cwdReal . DIRECTORY_SEPARATOR . 'package.json');
        if ($isAngularProject) {
            foreach ($allProcs as $proc) {
                if (!preg_match('/run-ng\.js|ng serve|npm\.cmd start|npm-cli\.js/i', $proc['cmd'])) {
                    continue;
                }
                if (preg_match('/--port[=\s]+(\d+)/i', $proc['cmd'], $m)) {
                    $ports[(int) $m[1]] = true;
                }
            }
        }

        ksort($ports);

        return array_map('intval', array_keys($ports));
    }

    private function findDevServerSeedPids(string $cwd, array $allProcs): array
    {
        $pids = $this->findPidsByCwd($cwd, $allProcs);
        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            return array_values(array_unique($pids));
        }

        foreach ($this->collectDevPortsForCwd($cwd, $allProcs) as $port) {
            $pids = array_merge(
                $pids,
                $this->findPidsOnPort($port),
                $this->findPidsByPortHint($port, $allProcs),
            );
        }

        return array_values(array_unique(array_filter($pids)));
    }

    private function shouldDelegateToExternalCmd(string $command): bool
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return false;
        }

        if (!($this->config['delegate_long_run_to_cmd'] ?? false)) {
            return false;
        }

        return $this->isLongRunningStreamCommand($command);
    }

    /**
     * Buka jendela CMD Windows — log & error 100% seperti CMD asli (tanpa stream PHP).
     */
    private function delegateToExternalCmd(string $command, string $cwd, callable $emit): string
    {
        $command = $this->enhanceStreamCommand($command, $cwd);
        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            $emit(['type' => 'line', 'text' => 'cwd tidak valid']);
            return $cwd;
        }

        $dupMsg = $this->duplicateDevStartMessage($command, $cwdReal);
        if ($dupMsg !== null) {
            $emit(['type' => 'line', 'text' => $dupMsg]);
            $port = $this->detectProjectDevPort($cwdReal);
            if ($port && $this->probeLocalHttp($port) === 'ok') {
                $emit([
                    'type' => 'line',
                    'text' => '[terminal] ▶ Server masih aktif — http://localhost:' . $port . '/',
                ]);
            } else {
                $emit(['type' => 'line', 'text' => '[terminal] Cek: running · Hentikan: killnode']);
            }

            return $this->normalizePath($cwdReal);
        }

        $port = $this->streamAssignedPort;
        $emit(['type' => 'status', 'text' => '▶ Membuka CMD Windows...']);
        $emit([
            'type' => 'meta',
            'assignedPort' => $port,
            'delegatedToCmd' => true,
        ]);

        $this->spawnExternalCmdWindow($command, $cwdReal);

        $emit(['type' => 'line', 'text' => '']);
        $emit([
            'type' => 'line',
            'text' => '[terminal] ✓ Dibuka di CMD Windows — semua log & error compile ada di jendela itu',
        ]);
        $emit([
            'type' => 'line',
            'text' => '[terminal] Folder: ' . $this->normalizePath($cwdReal),
        ]);
        $emit(['type' => 'line', 'text' => '[terminal] Perintah: ' . $command]);
        if ($port) {
            $emit([
                'type' => 'line',
                'text' => '[terminal] Preview: http://localhost:' . $port . '/ (setelah compile selesai)',
            ]);
        }
        $emit([
            'type' => 'line',
            'text' => '[terminal] Terminal web tetap dipakai untuk cd, git, killport, dll.',
        ]);
        $emit([
            'type' => 'line',
            'text' => '[terminal] Cek proses: running · Hentikan: killport ' . ($port ?? '4201') . ' / killnode',
        ]);

        return $this->normalizePath($cwdReal);
    }

    /** Jendela CMD terlihat (bukan minimize) — log dev server seperti biasa */
    private function spawnExternalCmdWindow(string $command, string $cwdReal): void
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return;
        }

        $cwd = str_replace('/', '\\', $this->normalizePath($cwdReal));
        $folder = basename($cwd);
        $title = $folder . ' — ' . preg_replace('/\s+/', ' ', substr($command, 0, 36));
        $inner = 'cd /d "' . str_replace('"', '""', $cwd) . '" && ' . $command;
        $startLine = 'start "' . str_replace('"', '""', $title) . '" cmd /K ' . escapeshellarg($inner);
        @pclose(@popen($startLine, 'r'));
    }

    private function isLongRunningStreamCommand(string $command): bool
    {
        $trimmed = trim($command);

        return (bool) preg_match(
            '/^(npm\s+(run\s+)?(start|serve|dev)|npx\s+ng\s+serve|ng\s+serve|yarn\s+(start|dev|serve)|pnpm\s+(start|dev|serve)|php\s+artisan\s+serve)\b/i',
            $trimmed,
        );
    }

    private function isAngularProjectDir(string $cwd): bool
    {
        $pkg = $cwd . DIRECTORY_SEPARATOR . 'package.json';
        if (!is_readable($pkg)) {
            return false;
        }

        $data = json_decode((string) file_get_contents($pkg), true);
        if (!is_array($data)) {
            return false;
        }

        $deps = array_merge($data['dependencies'] ?? [], $data['devDependencies'] ?? []);

        return isset($deps['@angular/core']);
    }

    private function duplicateDevStartMessage(string $command, string $cwdReal): ?string
    {
        if (!$this->isLongRunningStreamCommand($command)) {
            return null;
        }

        $allProcs = $this->listDevRelatedProcesses();
        $pids = $this->collectProcessTreePids(
            $this->findDevServerSeedPids($cwdReal, $allProcs),
            $allProcs,
        );
        if ($pids === []) {
            return null;
        }

        $port = $this->detectProjectDevPort($cwdReal);
        $count = count($pids);
        $portHint = $port ? " (port {$port})" : '';

        return "[terminal] ✗ npm/node sudah jalan di folder ini — {$count} proses{$portHint}."
            . ' Tidak memulai instance kedua (hemat RAM).'
            . ($port ? " Hentikan: killport {$port}" : ' Hentikan: killnode');
    }

    /**
     * Windows: npm.cmd sering selesai duluan sementara node (ng serve) masih jalan —
     * stream PHP putus & log rebuild hilang. Expand npm start → isi scripts.* (biasanya node ...).
     */
    private function resolveDirectDevCommand(string $command, string $cwdReal): ?string
    {
        $trimmed = trim($command);
        $scriptKey = null;
        $extraArgs = '';

        if (preg_match('/^npm(?:\.cmd)?\s+start\b(.*)$/i', $trimmed, $m)) {
            $scriptKey = 'start';
            $extraArgs = trim($m[1]);
        } elseif (preg_match('/^npm(?:\.cmd)?\s+run\s+([\w:@.-]+)(.*)$/i', $trimmed, $m)) {
            $scriptKey = $m[1];
            $extraArgs = trim($m[2]);
        } else {
            return null;
        }

        if (!$this->isLongRunningStreamCommand($trimmed)) {
            return null;
        }

        $pkgPath = rtrim(str_replace('/', DIRECTORY_SEPARATOR, $cwdReal), DIRECTORY_SEPARATOR)
            . DIRECTORY_SEPARATOR . 'package.json';
        if (!is_readable($pkgPath)) {
            return null;
        }

        $pkg = json_decode((string) file_get_contents($pkgPath), true);
        if (!is_array($pkg)) {
            return null;
        }

        $scripts = $pkg['scripts'] ?? [];
        if (!isset($scripts[$scriptKey])) {
            return null;
        }

        $body = trim((string) $scripts[$scriptKey]);
        if ($body === '') {
            return null;
        }

        if (!preg_match('/\b(serve|dev|run-ng|ng\s+serve|vite|next\s+dev)\b/i', $body)) {
            return null;
        }

        if ($extraArgs !== '') {
            $body .= ' ' . $extraArgs;
        }

        if (preg_match('/^(node|npx|yarn|pnpm)\s+/i', $body)) {
            return $body;
        }

        if (preg_match('/^ng\s+/i', $body)) {
            return 'npx ' . $body;
        }

        return null;
    }

    private function buildStreamProcCommand(string $command, string $cwdReal = ''): string
    {
        if ($cwdReal !== '') {
            $resolved = $this->resolveDirectDevCommand($command, $cwdReal);
            if ($resolved !== null) {
                $command = $resolved;
            }
        }

        // node/npx langsung — proses stream = proses dev server (tidak putus di Windows)
        if (preg_match('/^(node|npx|yarn|pnpm)\s+/i', $command)) {
            return $command;
        }

        if (PHP_OS_FAMILY === 'Windows') {
            if (preg_match('/^npm\s+/i', $command)) {
                return preg_replace('/^npm\s+/i', 'npm.cmd ', $command, 1);
            }
            if (preg_match('/^npx\s+/i', $command)) {
                return preg_replace('/^npx\s+/i', 'npx.cmd ', $command, 1);
            }

            return 'cmd /C ' . $command;
        }

        return $command;
    }

    /**
     * @param resource|false $proc
     * @param array<int, resource> $pipes
     */
    private function releaseStreamProcessHandles($proc, array &$pipes): void
    {
        foreach ([0, 1, 2] as $index) {
            if (is_resource($pipes[$index] ?? null)) {
                @fclose($pipes[$index]);
            }
        }
        // Sengaja tanpa proc_close — npm/ng dev server tetap jalan di background.
    }

    private function emitLongRunningStreamDone(callable $emit): void
    {
        $port = $this->streamAssignedPort;
        $emit(['type' => 'line', 'text' => '']);

        if ($port) {
            $probe = $this->probeLocalHttp($port);
            if ($probe === 'ok') {
                $url = 'http://localhost:' . $port . '/';
                $emit([
                    'type' => 'line',
                    'text' => '[terminal] ▶ Watch mode — server aktif ' . $url . ' · npm TIDAK di-kill · simpan file = rebuild',
                ]);
                $emit(['type' => 'line', 'text' => '[terminal] Cek: running · Hentikan: killport ' . $port]);
                return;
            }

            if ($this->findPidsOnPort($port) !== []) {
                $emit([
                    'type' => 'line',
                    'text' => '[terminal] Port ' . $port . ' LISTENING tapi HTTP belum merespons — tunggu compile selesai',
                ]);
                $emit(['type' => 'line', 'text' => '[terminal] Cek: running · Hentikan: killport ' . $port]);
                return;
            }
        }

        $emit([
            'type' => 'line',
            'text' => '[terminal] ⚠ Server tidak terdeteksi di port '
                . ($port ?? '?')
                . ' — proses npm mungkin mati saat stream PHP selesai (Windows)',
        ]);
        $emit([
            'type' => 'line',
            'text' => '[terminal] Solusi: killnode · npm start lagi · atau jalankan npm start dari CMD biasa',
        ]);
    }

    private function spawnDetachedWindowsDevServer(string $command, string $cwdReal): void
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return;
        }

        $cwd = str_replace('/', '\\', $this->normalizePath($cwdReal));
        $inner = 'cd /d "' . str_replace('"', '""', $cwd) . '" && ' . $command;
        $startLine = 'start "" /MIN cmd /C ' . escapeshellarg($inner);
        @pclose(@popen($startLine, 'r'));
    }

    private function ensureDevServerSurvivesDetach($proc, callable $emit): void
    {
        $port = $this->streamAssignedPort;
        if ($port === null) {
            return;
        }

        if (is_resource($proc)) {
            self::$keptAliveProcesses[] = $proc;
        }

        usleep(300000);

        $probe = $this->probeLocalHttp($port, 1.0);
        if ($probe === 'ok') {
            return;
        }

        $portBusy = $this->findPidsOnPort($port) !== [];
        if (
            !$portBusy
            && $this->streamDetachedCommand !== null
            && $this->streamDetachedCwd !== null
            && PHP_OS_FAMILY === 'Windows'
        ) {
            $this->spawnDetachedWindowsDevServer($this->streamDetachedCommand, $this->streamDetachedCwd);
            $emit([
                'type' => 'line',
                'text' => '[terminal] Mencoba meluncurkan npm di background Windows (proses stream terputus)',
            ]);
            usleep(800000);
        }
    }

    /**
     * @param resource|false $proc
     * @param array<int, resource> $pipes
     */
    private function finishLongRunningStreamDetach($proc, array &$pipes, callable $emit, string $cwdReal): string
    {
        $this->releaseStreamProcessHandles($proc, $pipes);
        $this->ensureDevServerSurvivesDetach($proc, $emit);
        $this->emitLongRunningStreamDone($emit);

        return $this->normalizePath($cwdReal);
    }

    /**
     * @param resource|false $proc
     * @param array<int, resource> $pipes
     */
    private function detachStreamWithoutKill($proc, array &$pipes, callable $emit, string $cwdReal): string
    {
        return $this->finishLongRunningStreamDetach($proc, $pipes, $emit, $cwdReal);
    }

    private function pickAvailablePort(int $start = 4201): int
    {
        for ($port = $start; $port <= $start + 200; $port++) {
            if ($this->isPortAvailable($port)) {
                return $port;
            }
        }

        return $start + 200;
    }

    private function isPortAvailable(int $port): bool
    {
        if (function_exists('socket_create')) {
            $socket = @socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
            if ($socket !== false) {
                $available = @socket_bind($socket, '0.0.0.0', $port);
                @socket_close($socket);
                if ($available) {
                    return true;
                }
            }
        }

        $sock = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.05);
        if ($sock === false) {
            return true;
        }
        fclose($sock);

        return false;
    }

    private function maybeEmitPortHint(string $line, callable $emit): void
    {
        if (!preg_match('/EADDRINUSE|address already in use|port.*(?:in use|already used)/i', $line)) {
            return;
        }

        $emit([
            'type' => 'line',
            'text' => '[terminal] Port sudah dipakai — coba: killport 4201 lalu killnode',
        ]);
    }

    private function isLocalDevUrl(string $url): bool
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!is_string($host) || $host === '') {
            return false;
        }

        $host = strtolower(trim($host, '[]'));
        if (in_array($host, ['localhost', '127.0.0.1', '0.0.0.0', '::1'], true)) {
            return true;
        }

        return (bool) preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/', $host);
    }

    private function maybeEmitPreviewUrl(string $line, callable $emit): void
    {
        if (preg_match('/run-ng\.js|npm-cli\.js|> node scripts\//i', $line)) {
            return;
        }

        if (preg_match('/listening on (?:https?:\/\/)?(?:localhost|127\.0\.0\.1):\d+/i', $line, $match)) {
            if (preg_match('/:(\d+)/', $line, $portMatch)) {
                $this->emitPreviewOnce('http://localhost:' . $portMatch[1] . '/', $emit);
            }

            return;
        }

        if (preg_match_all('/https?:\/\/[^\s\]\)<>"]+/i', $line, $matches)) {
            foreach ($matches[0] as $raw) {
                $url = rtrim($raw, '.,)]');
                if ($this->isLocalDevUrl($url) && preg_match('/:(\d+)/', $url)) {
                    $this->emitPreviewOnce($this->normalizePreviewUrl($url), $emit);
                    return;
                }
            }
        }

        if ($this->streamAssignedPort === null) {
            return;
        }

        if (!preg_match(
            '/Angular Live Development Server is listening|Build at:.*Time:\s*\d+ms|Local:\s*https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i',
            $line,
        )) {
            return;
        }

        $this->emitPreviewOnce('http://localhost:' . $this->streamAssignedPort . '/', $emit);
    }

    private function normalizePreviewUrl(string $url): string
    {
        if (preg_match('/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?\/?/i', $url, $m)) {
            $port = $m[1] ?? $this->streamAssignedPort ?? 4201;

            return 'http://localhost:' . $port . '/';
        }

        return $url;
    }

    private function emitPreviewOnce(string $url, callable $emit): void
    {
        $url = $this->normalizePreviewUrl($url);
        if (!$this->isLocalDevUrl($url) || !preg_match('/:(\d+)/', $url)) {
            return;
        }

        if ($this->emittedPreviewUrl === $url) {
            return;
        }

        $this->emittedPreviewUrl = $url;
        $emit(['type' => 'line', 'text' => '']);
        $emit(['type' => 'line', 'text' => '[terminal] ▶ Preview: ' . $url]);
    }

    /** @return array<string, string> */
    private function buildProcessEnv(): array
    {
        $env = [];
        foreach ($_ENV as $key => $value) {
            if (is_string($value)) {
                $env[$key] = $value;
            }
        }
        foreach ($_SERVER as $key => $value) {
            if (is_string($value) && !isset($env[$key])) {
                $env[$key] = $value;
            }
        }

        $path = getenv('PATH') ?: getenv('Path');
        if (is_string($path) && $path !== '') {
            $env['Path'] = $path;
            $env['PATH'] = $path;
        }

        $home = $this->resolveUserHome();
        $env['HOME'] = $home;
        $env['USERPROFILE'] = $home;
        if (preg_match('/^([A-Za-z]:)(.*)$/', $home, $m)) {
            $env['HOMEDRIVE'] = $m[1];
            $env['HOMEPATH'] = $m[2] !== '' ? $m[2] : '\\';
        }

        $this->applyGitWindowsEnv($env);

        $env['FORCE_COLOR'] = '1';
        $env['npm_config_color'] = 'true';
        $env['npm_config_progress'] = 'true';
        $env['NODE_NO_READLINE'] = '1';
        $env['WEBPACK_PROGRESS'] = 'true';
        $env['CI'] = '1';

        return $env;
    }

    private function resolveUserHome(): string
    {
        $candidates = [
            getenv('USERPROFILE') ?: null,
            getenv('HOME') ?: null,
            $_SERVER['USERPROFILE'] ?? null,
            $_SERVER['HOME'] ?? null,
        ];

        $drive = getenv('HOMEDRIVE') ?: ($_SERVER['HOMEDRIVE'] ?? '');
        $homePath = getenv('HOMEPATH') ?: ($_SERVER['HOMEPATH'] ?? '');
        if (is_string($drive) && $drive !== '' && is_string($homePath) && $homePath !== '') {
            $candidates[] = $drive . $homePath;
        }

        $user = getenv('USERNAME') ?: ($_SERVER['USERNAME'] ?? '');
        if (is_string($user) && $user !== '') {
            $candidates[] = 'C:/Users/' . $user;
        }

        foreach ($candidates as $candidate) {
            if (!is_string($candidate) || $candidate === '') {
                continue;
            }
            $normalized = str_replace('\\', '/', $candidate);
            $resolved = realpath($normalized);
            if ($resolved !== false && is_dir($resolved)) {
                return str_replace('\\', '/', $resolved);
            }
        }

        return $this->homePath;
    }

    /** @param array<string, string> $env */
    private function applyGitWindowsEnv(array &$env): void
    {
        if (PHP_OS_FAMILY !== 'Windows') {
            return;
        }

        $this->prependGitPaths($env);

        // Lewati gitconfig sistem (helper-selector / manager) — langsung manager-core
        $env['GIT_CONFIG_NOSYSTEM'] = '1';
        $helper = $this->gitCredentialHelperDirective();
        $env['GIT_CONFIG_COUNT'] = '1';
        $env['GIT_CONFIG_KEY_0'] = 'credential.helper';
        $env['GIT_CONFIG_VALUE_0'] = $helper;

        $env['GCM_INTERACTIVE'] = 'always';
        $env['GCM_ALLOW_AUTHENTICATION_POPUP'] = '1';
        $env['GIT_TERMINAL_PROMPT'] = '0';

        unset($env['GIT_ASKPASS'], $env['SSH_ASKPASS']);
    }

    /** @param array<string, string> $env */
    private function prependGitPaths(array &$env): void
    {
        $path = $env['PATH'] ?? $env['Path'] ?? '';
        $segments = $path !== '' ? explode(';', $path) : [];
        $existing = array_map('strtolower', array_map('trim', $segments));

        $candidates = [
            'C:/laragon/bin/git/mingw64/bin',
            'C:/laragon/bin/git/cmd',
            'C:/laragon/bin/git/usr/bin',
            'C:/Program Files/Git/mingw64/bin',
            'C:/Program Files/Git/cmd',
        ];

        foreach (array_reverse($candidates) as $dir) {
            $resolved = realpath(str_replace('/', DIRECTORY_SEPARATOR, $dir));
            if ($resolved === false || !is_dir($resolved)) {
                continue;
            }
            $normalized = str_replace('\\', '/', $resolved);
            if (!in_array(strtolower($normalized), $existing, true)) {
                array_unshift($segments, $normalized);
                $existing[] = strtolower($normalized);
            }
        }

        $merged = implode(';', array_filter($segments, static fn($s) => $s !== ''));
        $env['PATH'] = $merged;
        $env['Path'] = $merged;
    }

    private function gitCredentialHelperDirective(): string
    {
        $exe = $this->resolveGitCredentialHelperExe();
        if ($exe === null) {
            return 'manager-core';
        }

        if (str_contains($exe, ' ')) {
            return '!"' . $exe . '"';
        }

        return '!' . $exe;
    }

    private function resolveGitCredentialHelperExe(): ?string
    {
        $searchDirs = [
            'C:/laragon/bin/git/mingw64/bin',
            'C:/Program Files/Git/mingw64/bin',
        ];

        $path = getenv('PATH') ?: getenv('Path') ?: '';
        foreach (explode(';', $path) as $segment) {
            $segment = trim($segment);
            if ($segment !== '' && is_dir($segment)) {
                $searchDirs[] = str_replace('\\', '/', $segment);
            }
        }

        foreach (array_unique($searchDirs) as $dir) {
            $resolved = realpath(str_replace('/', DIRECTORY_SEPARATOR, $dir));
            if ($resolved === false) {
                continue;
            }
            $base = str_replace('\\', '/', $resolved);

            foreach (['git-credential-manager-core.exe', 'git-credential-manager.exe', 'git-credential-wincred.exe'] as $name) {
                $full = $base . '/' . $name;
                if (is_file($full)) {
                    return $full;
                }
            }
        }

        return null;
    }

    private function maybeEmitGitCredentialHint(string $line, callable $emit): void
    {
        if (!preg_match(
            '/credential-manager|could not read Username|\/dev\/tty|failed to execute prompt script/i',
            $line
        )) {
            return;
        }

        $emit([
            'type' => 'line',
            'text' => '[terminal] Login Git gagal di browser — jalankan sekali di PowerShell/CMD: git config --global credential.helper manager-core lalu git push (popup login Windows). Setelah tersimpan, push dari sini akan jalan.',
        ]);
    }

    private function sanitizeStreamLine(string $text): string
    {
        if ($text === '') {
            return '';
        }

        $text = preg_replace('/\x1b\[[0-9;?]*[ -\/]*[@-~]/', '', $text) ?? $text;
        $text = preg_replace('/\x9b[0-9;]*[ -\/]*[@-~]/', '', $text) ?? $text;
        $text = preg_replace('/\x1b\][^\x07]*(?:\x07|\x1b\\\\)/', '', $text) ?? $text;
        $text = preg_replace('/\x1b[(@-Z\\\\-_]/', '', $text) ?? $text;

        return rtrim($text, "\r");
    }

    /** @return string[] */
    private function drainStreamBuffer(string &$buffer): array
    {
        $lines = [];

        while ($buffer !== '') {
            $posN = strpos($buffer, "\n");
            if ($posN === false) {
                break;
            }

            $raw = substr($buffer, 0, $posN);
            $buffer = substr($buffer, $posN + 1);

            // \r = overwrite baris (spinner webpack/Vite) — ambil teks setelah \r terakhir
            $posR = strrpos($raw, "\r");
            if ($posR !== false) {
                $raw = substr($raw, $posR + 1);
            }

            $text = $this->sanitizeStreamLine($raw);
            if ($text !== '') {
                $lines[] = $text;
            }
        }

        return $lines;
    }

    private function maybeAutoReplyStdin($stdin, string $text, callable $emit, bool &$replied): void
    {
        if ($replied) {
            return;
        }

        if (!preg_match('/would you like|\(y\/n\)|\(Y\/n\)|continue\?/i', $text)) {
            return;
        }

        if (!is_resource($stdin)) {
            return;
        }

        fwrite($stdin, "Y\r\n");
        fflush($stdin);
        $replied = true;
        $emit(['type' => 'line', 'text' => '[terminal] Menjawab otomatis: Y']);
    }

    /** @param resource $pipe */
    private function pumpStreamPipe($pipe, string &$buffer, callable $onLine): void
    {
        if (!is_resource($pipe)) {
            return;
        }

        while (true) {
            $chunk = fread($pipe, 65536);
            if ($chunk === false || $chunk === '') {
                break;
            }

            $buffer .= $chunk;
            foreach ($this->drainStreamBuffer($buffer) as $line) {
                $onLine($line);
            }
        }
    }

    private function runShellStream(string $command, string $cwd, callable $emit): string
    {
        $command = $this->normalizeCommandInput($command);

        if (preg_match('/[;&`<>]/', $command)) {
            $emit(['type' => 'line', 'text' => 'Blocked: karakter shell berbahaya tidak diizinkan']);
            return $cwd;
        }

        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            $emit(['type' => 'line', 'text' => 'cwd tidak valid']);
            return $cwd;
        }

        $this->streamDetachedCommand = $command;
        $this->streamDetachedCwd = $cwdReal;

        $emit(['type' => 'status', 'text' => '▶ Menjalankan...']);
        $this->emittedPreviewUrl = null;

        if ($this->streamAssignedPort) {
            $emit([
                'type' => 'meta',
                'assignedPort' => $this->streamAssignedPort,
            ]);
            $portBusy = $this->findPidsOnPort($this->streamAssignedPort);
            if ($portBusy !== []) {
                $emit([
                    'type' => 'line',
                    'text' => '[terminal] ⚠ Port ' . $this->streamAssignedPort . ' sudah dipakai (PID '
                        . implode(', ', $portBusy) . ') — killport ' . $this->streamAssignedPort . ' dulu',
                ]);
            }
            $emit([
                'type' => 'line',
                'text' => '[terminal] Target port: ' . $this->streamAssignedPort . ' — tunggu "listening on" sebelum buka browser',
            ]);
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];

        $longRunning = $this->isLongRunningStreamCommand($command);
        if ($longRunning) {
            $dupMsg = $this->duplicateDevStartMessage($command, $cwdReal);
            if ($dupMsg !== null) {
                $emit(['type' => 'line', 'text' => $dupMsg]);
                $port = $this->detectProjectDevPort($cwdReal);
                if ($port && $this->probeLocalHttp($port) === 'ok') {
                    $emit([
                        'type' => 'line',
                        'text' => '[terminal] ▶ Server masih aktif — http://localhost:' . $port . '/',
                    ]);
                } else {
                    $emit(['type' => 'line', 'text' => '[terminal] Cek: running · Hentikan: killnode']);
                }

                return $this->normalizePath($cwdReal);
            }
        }

        $directCmd = $this->resolveDirectDevCommand($command, $cwdReal);
        $procCmd = $this->buildStreamProcCommand($command, $cwdReal);
        if ($directCmd !== null) {
            $emit([
                'type' => 'line',
                'text' => '[terminal] ▶ Langsung: ' . $directCmd . ' (tanpa npm.cmd — stream watch tidak putus)',
            ]);
        }

        $proc = proc_open(
            $procCmd,
            $descriptors,
            $pipes,
            $cwdReal,
            $this->buildProcessEnv(),
            ['bypass_shell' => true]
        );

        if (!is_resource($proc)) {
            $emit(['type' => 'line', 'text' => 'Gagal menjalankan perintah (proc_open)']);
            $emit(['type' => 'line', 'text' => 'cwd: ' . $this->normalizePath($cwdReal)]);
            return $this->normalizePath($cwdReal);
        }

        stream_set_blocking($pipes[0], false);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $stdoutBuffer = '';
        $stderrBuffer = '';
        $startTime = microtime(true);
        $lastHeartbeat = $startTime;
        $stdinReplied = false;
        $previewEmittedAt = null;
        $lastStreamOutputAt = microtime(true);
        $compileSuccessAt = null;
        $buildDone = false;
        $sawViteReady = false;
        $procDetachedKeepalive = false;
        $isAngularProject = $this->isAngularProjectDir($cwdReal);
        $emitLine = function (string $line) use (
            $emit,
            $pipes,
            &$stdinReplied,
            &$previewEmittedAt,
            &$lastStreamOutputAt,
            &$compileSuccessAt,
            &$buildDone,
            &$sawViteReady
        ): void {
            $lastStreamOutputAt = microtime(true);

            if (preg_match('/Build at:.*Time:\s*\d+ms/i', $line)) {
                $buildDone = true;
                $compileSuccessAt = microtime(true);
            }

            if (preg_match('/Local:\s*https?:\/\/(?:localhost|127\.0\.0\.1):\d+/i', $line)) {
                $sawViteReady = true;
                if ($compileSuccessAt === null) {
                    $compileSuccessAt = microtime(true);
                }
            }

            $this->maybeAutoReplyStdin($pipes[0], $line, $emit, $stdinReplied);
            $this->maybeEmitPortHint($line, $emit);
            $this->maybeEmitGitCredentialHint($line, $emit);
            $hadPreview = $this->emittedPreviewUrl;
            $this->maybeEmitPreviewUrl($line, $emit);

            if (
                $buildDone
                && $this->streamAssignedPort
                && $this->emittedPreviewUrl === null
            ) {
                $this->emitPreviewOnce('http://localhost:' . $this->streamAssignedPort . '/', $emit);
            }

            if ($hadPreview === null && $this->emittedPreviewUrl !== null) {
                $previewEmittedAt = microtime(true);
            }

            $emit(['type' => 'line', 'text' => $line]);
        };

        $pumpOutput = function () use ($pipes, &$stdoutBuffer, &$stderrBuffer, $emitLine): void {
            $this->pumpStreamPipe($pipes[1], $stdoutBuffer, $emitLine);
            $this->pumpStreamPipe($pipes[2], $stderrBuffer, $emitLine);
        };

        // Stream tetap terbuka = watch mode seperti CMD (rebuild & error saat save tetap mengalir)
        $shouldFinishLongRunning = static function (): bool {
            return false;
        };

        while (true) {
            if (connection_aborted()) {
                if ($longRunning) {
                    return $this->detachStreamWithoutKill($proc, $pipes, $emit, $cwdReal);
                }

                $pid = (int) (proc_get_status($proc)['pid'] ?? 0);
                $this->killProcessTree($pid);
                @proc_terminate($proc);
                break;
            }

            $pumpOutput();

            if ($shouldFinishLongRunning()) {
                if ($this->emittedPreviewUrl === null && $this->streamAssignedPort) {
                    $this->emitPreviewOnce('http://localhost:' . $this->streamAssignedPort . '/', $emit);
                }
                for ($flushPass = 0; $flushPass < 24; $flushPass++) {
                    $pumpOutput();
                    usleep(50000);
                }
                return $this->finishLongRunningStreamDetach($proc, $pipes, $emit, $cwdReal);
            }

            $now = microtime(true);
            if (!$longRunning && $now - $lastHeartbeat >= 2.0) {
                $elapsed = (int) round($now - $startTime);
                $emit(['type' => 'status', 'text' => "⏳ Streaming output ({$elapsed}s)..."]);
                $lastHeartbeat = $now;
            }

            if (!$procDetachedKeepalive && is_resource($proc)) {
                $status = proc_get_status($proc);
                if (!$status['running']) {
                    for ($flushPass = 0; $flushPass < 120; $flushPass++) {
                        $pumpOutput();
                        usleep(20000);
                    }

                    if ($longRunning && $this->streamAssignedPort) {
                        $port = $this->streamAssignedPort;
                        $alive = $this->probeLocalHttp($port, 0.5) === 'ok'
                            || $this->findPidsOnPort($port) !== [];
                        if ($alive) {
                            $emit([
                                'type' => 'line',
                                'text' => '[terminal] Proses stream selesai — dev server tetap di port '
                                    . $port
                                    . ' · log rebuild masih mengalir jika pakai node langsung',
                            ]);
                            $this->releaseStreamProcessHandles($proc, $pipes);
                            $proc = null;
                            $procDetachedKeepalive = true;
                        }
                    }

                    if (!$procDetachedKeepalive) {
                        break;
                    }
                }
            }

            if ($procDetachedKeepalive) {
                $port = $this->streamAssignedPort;
                $now = microtime(true);
                if ($now - $lastHeartbeat >= 6.0) {
                    $emit([
                        'type' => 'status',
                        'text' => '● Watch mode · port ' . ($port ?? '?') . ' · simpan file = rebuild · prompt bebas',
                    ]);
                    $lastHeartbeat = $now;
                }
                if (
                    $port
                    && $this->findPidsOnPort($port) === []
                    && $this->probeLocalHttp($port, 0.25) !== 'ok'
                ) {
                    $emit([
                        'type' => 'line',
                        'text' => '[terminal] Server di port ' . $port . ' berhenti',
                    ]);
                    break;
                }
                usleep(400000);
                continue;
            }

            usleep($longRunning ? 25000 : 80000);
        }

        if (connection_aborted()) {
            if ($longRunning) {
                return $this->detachStreamWithoutKill($proc, $pipes, $emit, $cwdReal);
            }

            $pid = (int) (proc_get_status($proc)['pid'] ?? 0);
            $this->killProcessTree($pid);
            @proc_terminate($proc);
            @proc_close($proc);

            return $this->normalizePath($cwdReal);
        }

        foreach ([$stdoutBuffer, $stderrBuffer] as &$pending) {
            $tail = $this->sanitizeStreamLine($pending);
            if ($tail !== '') {
                $emitLine($tail);
            }
            unset($pending);
        }

        if ($longRunning) {
            if ($this->emittedPreviewUrl === null && $this->streamAssignedPort) {
                $this->emitPreviewOnce('http://localhost:' . $this->streamAssignedPort . '/', $emit);
            }
            return $this->finishLongRunningStreamDetach($proc, $pipes, $emit, $cwdReal);
        }

        $this->releaseStreamProcessHandles($proc, $pipes);
        $exitCode = proc_close($proc);

        if ($exitCode !== 0) {
            $emit(['type' => 'line', 'text' => "[exit code: {$exitCode}]"]);
        }

        return $this->normalizePath($cwdReal);
    }

    private function killProcessTree(int $pid): void
    {
        if ($pid <= 0) {
            return;
        }

        if (PHP_OS_FAMILY === 'Windows') {
            @exec('taskkill /F /T /PID ' . $pid . ' 2>NUL');
        } else {
            @exec('kill -TERM -' . $pid . ' 2>/dev/null');
        }
    }

    private function looksLikePath(string $input): bool
    {
        if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $input)) return true;
        if (str_starts_with($input, '\\\\')) return true;
        return false;
    }

    private function resolvePath(string $cwd, string $input): string
    {
        $input = trim($input);
        if ($input === '~' || $input === '') return $this->homePath;
        if (str_starts_with($input, '~/')) {
            $input = $this->homePath . '/' . substr($input, 2);
        }

        $input = str_replace('/', DIRECTORY_SEPARATOR, $input);

        if (preg_match('/^[A-Za-z]:[\\\\\\/]/', $input)) {
            $path = $input;
        } else {
            $base = str_replace('/', DIRECTORY_SEPARATOR, $cwd);
            $path = rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $input;
        }

        $normalized = $this->normalizeSeparators($path);
        $real = realpath($normalized);
        $candidate = $real ?: $normalized;

        if (!$real && str_contains($input, '..')) {
            $candidate = $this->normalizeSeparators($this->collapseDots($path));
        }

        $this->assertAllowed($candidate);
        return $candidate;
    }

    private function collapseDots(string $path): string
    {
        $parts = explode(DIRECTORY_SEPARATOR, str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path));
        $resolved = [];
        foreach ($parts as $part) {
            if ($part === '' || $part === '.') continue;
            if ($part === '..') array_pop($resolved);
            else $resolved[] = $part;
        }
        if (preg_match('/^[A-Za-z]:/', $path)) return $resolved[0] . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, array_slice($resolved, 1));
        return implode(DIRECTORY_SEPARATOR, $resolved);
    }

    private function assertAllowed(string $path): void
    {
        if (!$this->restrictPaths) {
            return;
        }
        $check = realpath($path) ?: $path;
        if (!$this->isWithinBase($check)) {
            throw new RuntimeException('Permission denied');
        }
    }

    private function isWithinBase(string $path): bool
    {
        if (!$this->restrictPaths) {
            return true;
        }
        $pathNorm = strtolower(str_replace('\\', '/', realpath($path) ?: $path));
        $baseNorm = strtolower(str_replace('\\', '/', $this->homePath));
        return str_starts_with($pathNorm, $baseNorm);
    }

    private function resolveCwd(string $cwd): ?string
    {
        $resolved = realpath(str_replace('/', DIRECTORY_SEPARATOR, $cwd));
        if ($resolved && is_dir($resolved)) {
            return $resolved;
        }
        $normalized = str_replace('/', DIRECTORY_SEPARATOR, $cwd);
        return is_dir($normalized) ? $normalized : null;
    }

    private function normalizePath(string $path): string
    {
        $real = realpath(str_replace('/', DIRECTORY_SEPARATOR, $path));
        return str_replace('\\', '/', $real ?: $path);
    }

    private function normalizeSeparators(string $path): string
    {
        return str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
    }

    private function removeDir(string $dir): void
    {
        $items = scandir($dir) ?: [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') continue;
            $full = $dir . DIRECTORY_SEPARATOR . $item;
            is_dir($full) ? $this->removeDir($full) : unlink($full);
        }
        rmdir($dir);
    }

    private function wrap(string $cwd, array $output): array
    {
        return [
            'ok' => true,
            'output' => $output,
            'cwd' => $this->normalizePath($cwd),
            'gitBranch' => $this->detectGitBranch($cwd),
        ];
    }

    /** @return string[] */
    private function parseArgs(string $input): array
    {
        $tokens = [];
        $current = '';
        $inQuote = null;
        $len = strlen($input);

        for ($i = 0; $i < $len; $i++) {
            $char = $input[$i];
            if ($inQuote) {
                if ($char === $inQuote) $inQuote = null;
                else $current .= $char;
            } elseif (in_array($char, ["'", '"', "\u{2018}", "\u{2019}", "\u{201C}", "\u{201D}"], true)) {
                $inQuote = in_array($char, ["'", "\u{2018}", "\u{2019}"], true) ? "'" : '"';
            } elseif ($char === ' ') {
                if ($current !== '') {
                    $tokens[] = $current;
                    $current = '';
                }
            } else {
                $current .= $char;
            }
        }
        if ($current !== '') $tokens[] = $current;
        return $tokens;
    }
}
