<?php
declare(strict_types=1);

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Cache-Control: no-store, max-age=0');

$entrypoint = __DIR__ . '/index.html';
if (!is_file($entrypoint)) {
    http_response_code(503);
    exit;
}

readfile($entrypoint);
