<?php

declare(strict_types=1);

@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/x-ndjson; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store');
header('X-Accel-Buffering: no');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['type' => 'error', 'error' => 'Method not allowed']) . "\n";
    exit;
}

while (ob_get_level()) {
    ob_end_flush();
}

@set_time_limit(0);
@ini_set('max_execution_time', '0');
@ignore_user_abort(false);

require_once __DIR__ . '/ShellHandler.php';

$config = require __DIR__ . '/config.php';
$shell = new ShellHandler($config);

$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
$command = trim((string) ($body['command'] ?? ''));
$cwd = (string) ($body['cwd'] ?? ($config['home_path'] ?? $config['base_path']));
$prevCwd = isset($body['prevCwd']) ? (string) $body['prevCwd'] : null;

$emit = static function (array $payload): void {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE) . "\n";
    if (ob_get_level()) {
        ob_flush();
    }
    flush();
};

try {
    $shell->executeStreaming($command, $cwd, $prevCwd, $emit);
} catch (Throwable $e) {
    $emit(['type' => 'error', 'error' => $e->getMessage()]);
    $emit(['type' => 'done', 'ok' => false, 'cwd' => $cwd]);
}
