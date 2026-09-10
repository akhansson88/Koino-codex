<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

admin_require_method('GET');
try {
    admin_require_auth();
    $platform = strtolower(trim((string)($_GET['platform'] ?? '')));
    if (!in_array($platform, ['google-play', 'testflight'], true)) {
        admin_respond(422, ['ok' => false, 'code' => 'invalid_platform']);
    }
    $device = $platform === 'google-play' ? 'android' : 'ios';
    $query = admin_pdo()->prepare(
        'SELECT DISTINCT LOWER(TRIM(email)) AS email FROM koino_waitlist WHERE device = ? ORDER BY email ASC'
    );
    $query->execute([$device]);
    $filename = sprintf(
        'koino-%s-testers-%s.csv',
        $platform === 'google-play' ? 'google-play' : 'testflight',
        (new DateTimeImmutable('now', new DateTimeZone(KOINO_ADMIN_TIMEZONE)))->format('Y-m-d')
    );
    session_write_close();
    admin_headers('text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    $output = fopen('php://output', 'wb');
    if ($output === false) throw new RuntimeException('Export stream unavailable.');
    if ($platform === 'testflight') {
        fputcsv($output, ['First Name', 'Last Name', 'Email Address'], ',', '"', '');
        while ($row = $query->fetch()) {
            $email = (string)$row['email'];
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) fputcsv($output, ['', '', $email], ',', '"', '');
        }
    } else {
        while ($row = $query->fetch()) {
            $email = (string)$row['email'];
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) fwrite($output, $email . "\r\n");
        }
    }
    fclose($output);
    exit;
} catch (Throwable $error) {
    admin_log_failure('export unavailable');
    if (!headers_sent()) admin_respond(503, ['ok' => false, 'code' => 'unavailable']);
    exit;
}
