<?php
// Install outside the public document root with restrictive file permissions.
return [
    'dsn' => 'mysql:host=database-5021381827.webspace-host.com;dbname=dbs16105606;charset=utf8mb4',
    'user' => 'dbu5790577',
    'password' => 'SET_ON_SERVER_ONLY',
    'rate_secret' => 'GENERATE_A_RANDOM_32_BYTE_SECRET',
    'admin_allowed_origins' => [
        'https://koinolabs.com',
        'https://www.koinolabs.com',
    ],
];
