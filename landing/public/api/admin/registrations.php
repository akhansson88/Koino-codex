<?php
declare(strict_types=1);
require __DIR__ . '/_bootstrap.php';

admin_require_method('GET');
try {
    admin_require_auth();
    $device = strtolower(trim((string)($_GET['device'] ?? 'all')));
    $page = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 1000000]]);
    if (!in_array($device, ['all', 'ios', 'android', 'unknown'], true) || $page === false) {
        admin_respond(422, ['ok' => false, 'code' => 'invalid_filter']);
    }
    $where = match ($device) {
        'ios' => "device = 'ios'",
        'android' => "device = 'android'",
        'unknown' => "device IS NULL OR device NOT IN ('ios', 'android')",
        default => '1 = 1',
    };
    $pdo = admin_pdo();
    $total = (int)$pdo->query("SELECT COUNT(*) FROM koino_waitlist WHERE $where")->fetchColumn();
    $pageSize = 50;
    $offset = ((int)$page - 1) * $pageSize;
    $query = $pdo->prepare(
        "SELECT id, email, device, created_at FROM koino_waitlist WHERE $where ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset"
    );
    $query->bindValue(':limit', $pageSize, PDO::PARAM_INT);
    $query->bindValue(':offset', $offset, PDO::PARAM_INT);
    $query->execute();
    $items = array_map(static function (array $row): array {
        $device = in_array($row['device'], ['ios', 'android'], true) ? $row['device'] : 'unknown';
        return [
            'id' => (int)$row['id'],
            'email' => (string)$row['email'],
            'device' => $device,
            'createdAt' => admin_local_datetime((string)$row['created_at']),
        ];
    }, $query->fetchAll());
    admin_respond(200, [
        'ok' => true,
        'filter' => $device,
        'page' => (int)$page,
        'pageSize' => $pageSize,
        'total' => $total,
        'totalPages' => (int)ceil($total / $pageSize),
        'items' => $items,
    ]);
} catch (Throwable $error) {
    admin_log_failure('registrations unavailable');
    admin_respond(503, ['ok' => false, 'code' => 'unavailable']);
}
