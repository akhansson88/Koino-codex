<?php
declare(strict_types=1);
// CLI only. Upload outside the document root beside schema.sql.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$configPath = getenv('KOINO_CONFIG_PATH');
if (!$configPath || !is_file($configPath)) { fwrite(STDERR, "Set KOINO_CONFIG_PATH to the private configuration file.\n"); exit(1); }
try {
    $config = require $configPath;
    $pdo = new PDO($config['dsn'], $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
    echo "Waitlist tables ready. Existing records preserved.\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Database setup failed. Verify the private configuration and database permissions.\n");
    exit(1);
}
