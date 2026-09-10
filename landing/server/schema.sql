CREATE TABLE IF NOT EXISTS koino_waitlist (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
    device ENUM('ios', 'android') NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    privacy_version VARCHAR(32) NOT NULL,
    UNIQUE KEY unique_email (email),
    KEY created_at (created_at),
    KEY device_created_at (device, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS koino_admin_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS koino_admin_login_limits (
    ip_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    username_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    bucket BIGINT UNSIGNED NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (ip_hash, username_hash, bucket),
    KEY expiry (bucket)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS koino_waitlist_limits (
    ip_hash CHAR(64) CHARACTER SET ascii NOT NULL,
    bucket BIGINT UNSIGNED NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (ip_hash, bucket),
    KEY expiry (bucket)
) ENGINE=InnoDB;
