<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

admin_require_method('POST');
try {
    admin_require_same_origin();
    admin_require_auth();
    admin_require_csrf();
    admin_destroy_session();
    admin_respond(200, ['ok' => true]);
} catch (Throwable $error) {
    admin_log_failure('logout unavailable');
    admin_respond(503, ['ok' => false, 'code' => 'unavailable']);
}
