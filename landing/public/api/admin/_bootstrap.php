<?php
declare(strict_types=1);

const KOINO_ADMIN_SESSION_SECONDS = 28800;
const KOINO_ADMIN_TIMEZONE = 'Europe/Stockholm';

function admin_headers(string $contentType = 'application/json; charset=utf-8'): void {
    header('Content-Type: ' . $contentType);
    header('Cache-Control: no-store, max-age=0');
    header('Pragma: no-cache');
    header('Vary: Cookie');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
}

function admin_respond(int $status, array $payload): never {
    admin_headers();
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function admin_require_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        admin_respond(405, ['ok' => false]);
    }
}

function admin_config(): array {
    static $config;
    if (is_array($config)) return $config;
    $configPath = getenv('KOINO_CONFIG_PATH') ?: dirname(__DIR__, 3) . '/koino-private/config.php';
    if (!is_file($configPath)) throw new RuntimeException('Configuration unavailable.');
    $loaded = require $configPath;
    if (!is_array($loaded)) throw new RuntimeException('Configuration unavailable.');
    return $config = $loaded;
}

function admin_pdo(): PDO {
    static $pdo;
    if ($pdo instanceof PDO) return $pdo;
    $config = admin_config();
    $pdo = new PDO($config['dsn'], $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function admin_is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function admin_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string)KOINO_ADMIN_SESSION_SECONDS);
    session_name('KOINO_ADMIN');
    session_set_cookie_params([
        'lifetime' => KOINO_ADMIN_SESSION_SECONDS,
        'path' => '/',
        'secure' => admin_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
    $issuedAt = $_SESSION['issued_at'] ?? null;
    if (is_int($issuedAt) && time() - $issuedAt > KOINO_ADMIN_SESSION_SECONDS) {
        admin_destroy_session();
        session_start();
    }
}

function admin_destroy_session(): void {
    if (session_status() !== PHP_SESSION_ACTIVE) return;
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'],
            'domain' => $params['domain'],
            'secure' => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => 'Strict',
        ]);
    }
    session_destroy();
}

function admin_require_same_origin(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') admin_respond(403, ['ok' => false]);
    $config = admin_config();
    $allowed = $config['admin_allowed_origins'] ?? ['https://koinolabs.com', 'https://www.koinolabs.com'];
    if (!is_array($allowed) || !in_array($origin, $allowed, true)) {
        admin_respond(403, ['ok' => false]);
    }
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin') === 'cross-site') {
        admin_respond(403, ['ok' => false]);
    }
}

function admin_read_json(int $limit = 4096): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) admin_respond(413, ['ok' => false]);
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') admin_respond(415, ['ok' => false]);
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false || strlen($raw) > $limit) admin_respond(413, ['ok' => false]);
    $body = json_decode($raw, true);
    if (!is_array($body)) admin_respond(422, ['ok' => false]);
    return $body;
}

function admin_authenticated_user(): ?array {
    admin_start_session();
    $id = $_SESSION['admin_id'] ?? null;
    $issuedAt = $_SESSION['issued_at'] ?? null;
    if (!is_int($id) || !is_int($issuedAt)) return null;
    if (time() - $issuedAt > KOINO_ADMIN_SESSION_SECONDS) {
        admin_destroy_session();
        return null;
    }
    $query = admin_pdo()->prepare('SELECT id, username FROM koino_admin_users WHERE id = ? AND is_active = 1');
    $query->execute([$id]);
    $user = $query->fetch();
    return is_array($user) ? ['id' => (int)$user['id'], 'username' => (string)$user['username']] : null;
}

function admin_require_auth(): array {
    $user = admin_authenticated_user();
    if ($user === null) admin_respond(401, ['ok' => false, 'code' => 'unauthorized']);
    return $user;
}

function admin_require_csrf(): void {
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($provided) || !is_string($expected) || $expected === '' || !hash_equals($expected, $provided)) {
        admin_respond(403, ['ok' => false, 'code' => 'csrf']);
    }
}

function admin_local_datetime(string $utcValue): string {
    $utc = new DateTimeZone('UTC');
    $local = new DateTimeZone(KOINO_ADMIN_TIMEZONE);
    return (new DateTimeImmutable($utcValue, $utc))->setTimezone($local)->format(DateTimeInterface::ATOM);
}

function admin_log_failure(string $context): void {
    error_log('Koino admin: ' . $context);
}
