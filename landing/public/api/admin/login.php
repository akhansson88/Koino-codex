<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

admin_require_method('POST');

try {
    admin_require_same_origin();
    $body = admin_read_json();
    if (!is_string($body['username'] ?? null) || !is_string($body['password'] ?? null)) {
        admin_respond(422, ['ok' => false]);
    }
    $username = trim($body['username']);
    $password = $body['password'];
    if (!preg_match('/\A[A-Za-z0-9._-]{3,64}\z/', $username) || strlen($password) < 1 || strlen($password) > 1024) {
        admin_respond(401, ['ok' => false, 'code' => 'invalid_credentials']);
    }

    $config = admin_config();
    $pdo = admin_pdo();
    $ipHash = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown', (string)$config['rate_secret']);
    $usernameHash = hash('sha256', $username);
    $bucket = (int)floor(time() / 900);

    $limit = $pdo->prepare('SELECT attempts FROM koino_admin_login_limits WHERE ip_hash = ? AND username_hash = ? AND bucket = ?');
    $limit->execute([$ipHash, $usernameHash, $bucket]);
    if ((int)$limit->fetchColumn() >= 5) {
        header('Retry-After: ' . (900 - time() % 900));
        admin_respond(429, ['ok' => false, 'code' => 'rate_limited']);
    }

    $lookup = $pdo->prepare('SELECT id, username, password_hash FROM koino_admin_users WHERE username = BINARY ? AND is_active = 1');
    $lookup->execute([$username]);
    $user = $lookup->fetch();
    $hash = is_array($user)
        ? (string)$user['password_hash']
        : '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
    $valid = password_verify($password, $hash) && is_array($user);

    if (!$valid) {
        $record = $pdo->prepare(
            'INSERT INTO koino_admin_login_limits (ip_hash, username_hash, bucket, attempts) VALUES (?, ?, ?, 1) '
            . 'ON DUPLICATE KEY UPDATE attempts = attempts + 1'
        );
        $record->execute([$ipHash, $usernameHash, $bucket]);
        $cleanup = $pdo->prepare('DELETE FROM koino_admin_login_limits WHERE bucket < ?');
        $cleanup->execute([$bucket - 1]);
        admin_respond(401, ['ok' => false, 'code' => 'invalid_credentials']);
    }

    if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        $replacement = password_hash($password, PASSWORD_DEFAULT);
        if (is_string($replacement)) {
            $update = $pdo->prepare('UPDATE koino_admin_users SET password_hash = ? WHERE id = ?');
            $update->execute([$replacement, (int)$user['id']]);
        }
    }
    $clear = $pdo->prepare('DELETE FROM koino_admin_login_limits WHERE ip_hash = ? AND username_hash = ?');
    $clear->execute([$ipHash, $usernameHash]);

    admin_start_session();
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int)$user['id'];
    $_SESSION['issued_at'] = time();
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    admin_respond(200, [
        'ok' => true,
        'user' => ['username' => (string)$user['username']],
        'csrfToken' => $_SESSION['csrf_token'],
        'expiresAt' => gmdate(DateTimeInterface::ATOM, time() + KOINO_ADMIN_SESSION_SECONDS),
    ]);
} catch (Throwable $error) {
    admin_log_failure('login unavailable');
    admin_respond(503, ['ok' => false, 'code' => 'unavailable']);
}
