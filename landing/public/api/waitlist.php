<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function respond(int $status, bool $ok): never {
    http_response_code($status);
    echo json_encode(['ok' => $ok]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); respond(405, false); }
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !in_array($origin, ['https://koinolabs.com', 'https://www.koinolabs.com'], true)) respond(403, false);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 2048) respond(413, false);
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') respond(415, false);
$raw = file_get_contents('php://input', false, null, 0, 2049);
if ($raw === false || strlen($raw) > 2048) respond(413, false);
$body = json_decode($raw, true);
if (!is_array($body) || !is_string($body['email'] ?? null) || !is_string($body['device'] ?? null) || !is_string($body['website'] ?? '')) respond(422, false);
if (($body['website'] ?? '') !== '') respond(422, false);
$email = strtolower(trim($body['email']));
$device = strtolower(trim($body['device']));
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) respond(422, false);
if (!in_array($device, ['ios', 'android'], true)) respond(422, false);
try {
    // Set KOINO_CONFIG_PATH if the webroot is nested differently. Never put this file in public/.
    $configPath = getenv('KOINO_CONFIG_PATH') ?: dirname(__DIR__, 2) . '/koino-private/config.php';
    $config = require $configPath;
    $pdo = new PDO($config['dsn'], $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
    $ipKey = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['rate_secret']);
    $bucket = (int)floor(time() / 900);
    $pdo->beginTransaction();
    $rate = $pdo->prepare('INSERT INTO koino_waitlist_limits (ip_hash, bucket, attempts) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE attempts = attempts + 1');
    $rate->execute([$ipKey, $bucket]);
    $check = $pdo->prepare('SELECT attempts FROM koino_waitlist_limits WHERE ip_hash = ? AND bucket = ? FOR UPDATE');
    $check->execute([$ipKey, $bucket]);
    $attempts = (int)$check->fetchColumn();
    $pdo->commit();
    if ($attempts > 5) { header('Retry-After: ' . (900 - time() % 900)); respond(429, false); }
    $insert = $pdo->prepare('INSERT INTO koino_waitlist (email, device, privacy_version) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE device = VALUES(device)');
    $insert->execute([$email, $device, '2026-09-08']);
    // Rate-limit identifiers are short lived and never contain raw IP addresses.
    $cleanup = $pdo->prepare('DELETE FROM koino_waitlist_limits WHERE bucket < ?');
    $cleanup->execute([$bucket - 1]);
    respond(200, true);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('Koino waitlist: storage unavailable');
    respond(503, false);
}
