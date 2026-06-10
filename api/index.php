<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/ShellHandler.php';

$config = require __DIR__ . '/config.php';
$shell = new ShellHandler($config);

$body = [];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $body = json_decode(file_get_contents('php://input') ?: '{}', true) ?? [];
}

$action = $_GET['action'] ?? ($body['action'] ?? null);

try {
    if ($action === 'init') {
        echo json_encode($shell->init());
        exit;
    }

    if ($action === 'exec') {
        $command = trim((string) ($body['command'] ?? ''));
        $cwd = (string) ($body['cwd'] ?? ($config['home_path'] ?? $config['base_path']));
        $prevCwd = isset($body['prevCwd']) ? (string) $body['prevCwd'] : null;

        echo json_encode($shell->execute($command, $cwd, $prevCwd));
        exit;
    }

    if ($action === 'listdir') {
        $cwd = (string) ($body['cwd'] ?? ($config['home_path'] ?? $config['base_path']));
        $relative = (string) ($body['relative'] ?? '.');

        echo json_encode($shell->listDirectory($cwd, $relative));
        exit;
    }

    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown action']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
