<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

admin_require_method('GET');
try {
    $user = admin_require_auth();
    admin_respond(200, [
        'ok' => true,
        'user' => ['username' => $user['username']],
        'csrfToken' => $_SESSION['csrf_token'],
        'expiresAt' => gmdate(DateTimeInterface::ATOM, (int)$_SESSION['issued_at'] + KOINO_ADMIN_SESSION_SECONDS),
    ]);
} catch (Throwable $error) {
    admin_log_failure('session check unavailable');
    admin_respond(503, ['ok' => false, 'code' => 'unavailable']);
}
