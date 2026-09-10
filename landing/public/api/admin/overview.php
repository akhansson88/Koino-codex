<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

admin_require_method('GET');
try {
    admin_require_auth();
    $rows = admin_pdo()->query('SELECT device, created_at FROM koino_waitlist ORDER BY created_at ASC')->fetchAll();
    $counts = ['total' => 0, 'ios' => 0, 'android' => 0, 'unknown' => 0];
    $byDay = [];
    $firstDate = null;
    foreach ($rows as $row) {
        $device = in_array($row['device'], ['ios', 'android'], true) ? $row['device'] : 'unknown';
        $local = new DateTimeImmutable((string)$row['created_at'], new DateTimeZone('UTC'));
        $date = $local->setTimezone(new DateTimeZone(KOINO_ADMIN_TIMEZONE))->format('Y-m-d');
        $firstDate ??= $date;
        $counts['total']++;
        $counts[$device]++;
        $byDay[$date] ??= ['total' => 0, 'ios' => 0, 'android' => 0];
        $byDay[$date]['total']++;
        if ($device !== 'unknown') $byDay[$date][$device]++;
    }

    $daily = [];
    if ($firstDate !== null) {
        $zone = new DateTimeZone(KOINO_ADMIN_TIMEZONE);
        $cursor = new DateTimeImmutable($firstDate . ' 12:00:00', $zone);
        $today = new DateTimeImmutable('today 12:00:00', $zone);
        while ($cursor <= $today) {
            $date = $cursor->format('Y-m-d');
            $values = $byDay[$date] ?? ['total' => 0, 'ios' => 0, 'android' => 0];
            $daily[] = ['date' => $date] + $values;
            $cursor = $cursor->modify('+1 day');
        }
    }

    admin_respond(200, [
        'ok' => true,
        'generatedAt' => gmdate(DateTimeInterface::ATOM),
        'timezone' => KOINO_ADMIN_TIMEZONE,
        'counts' => $counts,
        'daily' => $daily,
    ]);
} catch (Throwable $error) {
    admin_log_failure('overview unavailable');
    admin_respond(503, ['ok' => false, 'code' => 'unavailable']);
}
