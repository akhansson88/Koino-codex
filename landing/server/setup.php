<?php
declare(strict_types=1);
// CLI only. Upload outside the document root beside schema.sql.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

function ensureIndex(PDO $pdo, string $table, string $index, string $columns): void {
    $check = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?'
    );
    $check->execute([$table, $index]);
    if ((int)$check->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `$table` ADD INDEX `$index` ($columns)");
    }
}

function readHiddenPassword(): string {
    $fromEnvironment = getenv('KOINO_ADMIN_PASSWORD');
    if (is_string($fromEnvironment) && $fromEnvironment !== '') return $fromEnvironment;
    if (DIRECTORY_SEPARATOR === '\\') {
        fwrite(STDERR, "Set KOINO_ADMIN_PASSWORD for non-interactive Windows provisioning.\n");
        exit(1);
    }
    fwrite(STDOUT, 'Admin password: ');
    $canUseShell = function_exists('shell_exec') && is_callable('shell_exec');
    $sttyAvailable = $canUseShell && trim((string)shell_exec('command -v stty 2>/dev/null')) !== '';
    if ($sttyAvailable) shell_exec('stty -echo');
    $password = trim((string)fgets(STDIN));
    if ($sttyAvailable) {
        shell_exec('stty echo');
        fwrite(STDOUT, "\n");
    }
    return $password;
}

$configPath = getenv('KOINO_CONFIG_PATH');
if (!$configPath || !is_file($configPath)) { fwrite(STDERR, "Set KOINO_CONFIG_PATH to the private configuration file.\n"); exit(1); }
try {
    $config = require $configPath;
    $pdo = new PDO($config['dsn'], $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    // CREATE TABLE does not add new indexes to an existing waitlist table.
    ensureIndex($pdo, 'koino_waitlist', 'created_at', '`created_at`');
    ensureIndex($pdo, 'koino_waitlist', 'device_created_at', '`device`, `created_at`');

    $arguments = array_slice($argv, 1);
    $provisionIndex = array_search('--provision-admin', $arguments, true);
    if ($provisionIndex !== false) {
        $username = $arguments[$provisionIndex + 1] ?? (getenv('KOINO_ADMIN_USERNAME') ?: 'admin777');
        if (!preg_match('/\\A[A-Za-z0-9._-]{3,64}\\z/', $username)) {
            throw new RuntimeException('Admin username must be 3-64 ASCII letters, numbers, dots, underscores or hyphens.');
        }
        $password = readHiddenPassword();
        if (strlen($password) < 12 || strlen($password) > 1024) {
            throw new RuntimeException('Admin password must be between 12 and 1024 bytes.');
        }
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($passwordHash)) throw new RuntimeException('Password hashing is unavailable.');
        $upsert = $pdo->prepare(
            'INSERT INTO koino_admin_users (username, password_hash, is_active) VALUES (?, ?, 1) '
            . 'ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1'
        );
        $upsert->execute([$username, $passwordHash]);
        unset($password, $passwordHash);
        echo "Admin user provisioned with a one-way password hash.\n";
    }
    echo "Waitlist and admin tables ready. Existing records preserved.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Database setup failed: " . $error->getMessage() . "\n");
    exit(1);
}
