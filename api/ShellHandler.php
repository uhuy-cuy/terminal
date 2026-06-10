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

    public function __construct(array $config)
    {
        $homeResolved = realpath($config['home_path'] ?? 'C:/laragon/www');
        $this->homePath = $homeResolved ?: rtrim(str_replace('\\', '/', $config['home_path'] ?? 'C:/laragon/www'), '/');
        $this->restrictPaths = (bool) ($config['restrict_paths'] ?? false);
        $this->allowAllShell = (bool) ($config['allow_all_shell'] ?? false);
        $this->allowedShell = $config['allowed_shell'] ?? [];
        $this->blockedShell = array_map('strtolower', $config['blocked_shell'] ?? []);
    }

    public function init(): array
    {
        return [
            'ok' => true,
            'mode' => 'real',
            'cwd' => $this->homePath,
            'home' => $this->homePath,
            'user' => 'tahirwiyan',
            'hostname' => php_uname('n') ?: 'local',
            'gitBranch' => $this->detectGitBranch($this->homePath),
            'unrestricted' => !$this->restrictPaths,
        ];
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
        $command = trim($command);
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
            default:
                if ($this->isAllowedShell($cmd)) {
                    return $this->runShell($command, $cwd);
                }
                return $this->wrap($cwd, ["{$cmd}: command not found. Ketik 'help' untuk bantuan."]);
        }
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

    private function runShell(string $command, string $cwd): array
    {
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

    private function isAllowedShell(string $cmd): bool
    {
        $cmd = strtolower($cmd);
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
        $command = trim($command);
        $emit(['type' => 'start', 'command' => $command]);

        if ($command === '') {
            $emit(['type' => 'done', 'ok' => true, 'cwd' => $this->normalizePath($cwd), 'gitBranch' => $this->detectGitBranch($cwd)]);
            return;
        }

        $tokens = $this->parseArgs($command);
        $cmd = strtolower($tokens[0] ?? '');

        if ($this->isAllowedShell($cmd)) {
            $finalCwd = $this->runShellStream($this->enhanceStreamCommand($command), $cwd, $emit);
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

    private function enhanceStreamCommand(string $command): string
    {
        if (preg_match('/^git\s+(pull|fetch|clone|push)(\s|$)/i', $command) && !preg_match('/--progress/i', $command)) {
            return $command . ' --progress';
        }

        $trimmed = trim($command);

        if (preg_match('/^npm\s+(run\s+)?start(\s|$)/i', $trimmed) && !preg_match('/--port\b/i', $trimmed)) {
            $port = $this->pickAvailablePort(4201);
            return $trimmed . ' -- --port ' . $port . ' --verbose';
        }

        if (preg_match('/^(npx\s+)?ng\s+serve(\s|$)/i', $trimmed) && !preg_match('/--port\b/i', $trimmed)) {
            return $trimmed . ' --port ' . $this->pickAvailablePort(4201) . ' --verbose';
        }

        return $command;
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
            'text' => '[terminal] Port sudah dipakai — hentikan proses lama (Task Manager / taskkill) atau jalankan ulang npm start',
        ]);
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

        $env['FORCE_COLOR'] = '1';
        $env['npm_config_color'] = 'true';
        $env['npm_config_progress'] = 'true';
        $env['NODE_NO_READLINE'] = '1';
        $env['WEBPACK_PROGRESS'] = 'true';

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

    private function sanitizeStreamLine(string $text): string
    {
        if ($text === '') {
            return '';
        }

        $stripped = preg_replace('/\x1b\[[0-9;?]*[ -\/]*[@-~]/', '', $text);
        if ($stripped !== null) {
            $text = $stripped;
        }

        return rtrim($text, "\r");
    }

    /** @return string[] */
    private function drainStreamBuffer(string &$buffer): array
    {
        $lines = [];

        while ($buffer !== '') {
            $posN = strpos($buffer, "\n");
            $posR = strpos($buffer, "\r");

            if ($posN === false && $posR === false) {
                break;
            }

            if ($posN === false) {
                $pos = $posR;
            } elseif ($posR === false) {
                $pos = $posN;
            } else {
                $pos = min($posN, $posR);
            }

            $raw = substr($buffer, 0, $pos);
            $buffer = substr($buffer, $pos + 1);
            if ($buffer !== '' && $buffer[0] === "\n") {
                $buffer = substr($buffer, 1);
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

    private function tailLogIntoEmit(string $path, int &$offset, string &$buffer, callable $emit, callable $onLine): void
    {
        if (!is_file($path)) {
            return;
        }

        clearstatcache(true, $path);
        $size = filesize($path);
        if ($size === false || $size <= $offset) {
            return;
        }

        $handle = fopen($path, 'rb');
        if ($handle === false) {
            return;
        }

        fseek($handle, $offset);
        $chunk = fread($handle, $size - $offset);
        fclose($handle);

        if ($chunk === false || $chunk === '') {
            return;
        }

        $offset = $size;
        $buffer .= $chunk;

        foreach ($this->drainStreamBuffer($buffer) as $line) {
            $onLine($line);
            $emit(['type' => 'line', 'text' => $line]);
        }
    }

    private function runShellStream(string $command, string $cwd, callable $emit): string
    {
        if (preg_match('/[;&`<>]/', $command)) {
            $emit(['type' => 'line', 'text' => 'Blocked: karakter shell berbahaya tidak diizinkan']);
            return $cwd;
        }

        $cwdReal = $this->resolveCwd($cwd);
        if (!$cwdReal) {
            $emit(['type' => 'line', 'text' => 'cwd tidak valid']);
            return $cwd;
        }

        $emit(['type' => 'status', 'text' => '▶ Menjalankan...']);

        $logFile = tempnam(sys_get_temp_dir(), 'tws_');
        if ($logFile === false) {
            $logFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'tws_' . uniqid('', true) . '.log';
        }

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['file', $logFile, 'a'],
            2 => ['file', $logFile, 'a'],
        ];

        $proc = proc_open(
            'cmd /C ' . $command,
            $descriptors,
            $pipes,
            $cwdReal,
            $this->buildProcessEnv(),
            ['bypass_shell' => true]
        );

        if (!is_resource($proc)) {
            @unlink($logFile);
            $emit(['type' => 'line', 'text' => 'Gagal menjalankan perintah']);
            return $this->normalizePath($cwdReal);
        }

        stream_set_blocking($pipes[0], false);

        $logOffset = 0;
        $logBuffer = '';
        $startTime = microtime(true);
        $lastHeartbeat = $startTime;
        $stdinReplied = false;

        $emitLog = function () use ($logFile, &$logOffset, &$logBuffer, $emit, $pipes, &$stdinReplied): void {
            $this->tailLogIntoEmit($logFile, $logOffset, $logBuffer, $emit, function (string $line) use ($emit, $pipes, &$stdinReplied): void {
                $this->maybeAutoReplyStdin($pipes[0], $line, $emit, $stdinReplied);
                $this->maybeEmitPortHint($line, $emit);
            });
        };

        while (true) {
            if (connection_aborted()) {
                $pid = (int) (proc_get_status($proc)['pid'] ?? 0);
                $this->killProcessTree($pid);
                @proc_terminate($proc);
                $emit(['type' => 'line', 'text' => '[terminal] Proses dihentikan (Ctrl+C)']);
                break;
            }

            $emitLog();

            $now = microtime(true);
            if ($now - $lastHeartbeat >= 2.0) {
                $elapsed = (int) round($now - $startTime);
                $emit(['type' => 'status', 'text' => "⏳ Streaming log build ({$elapsed}s)..."]);
                $lastHeartbeat = $now;
            }

            $status = proc_get_status($proc);
            if (!$status['running']) {
                break;
            }

            usleep(80000);
        }

        $emitLog();

        fclose($pipes[0]);

        if (connection_aborted()) {
            $pid = (int) (proc_get_status($proc)['pid'] ?? 0);
            $this->killProcessTree($pid);
            @proc_terminate($proc);
            @proc_close($proc);
            @unlink($logFile);
            return $this->normalizePath($cwdReal);
        }

        $tail = $this->sanitizeStreamLine($logBuffer);
        if ($tail !== '') {
            $emit(['type' => 'line', 'text' => $tail]);
        }

        $exitCode = proc_close($proc);
        @unlink($logFile);

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
            } elseif ($char === '"' || $char === "'") {
                $inQuote = $char;
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
