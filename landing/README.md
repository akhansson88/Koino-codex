# Koino landing page

Standalone React + TypeScript/Vite website. It does not depend on the Expo app or its Firebase backend.

## Local development

```powershell
npm ci
npm run dev
```

The preview opens at http://127.0.0.1:5173. The PHP endpoint is a separate runtime; Vite alone does not save signups.

```powershell
php -S 127.0.0.1:5174 -t public
npm test
npm run build
```

Tests use local Chrome. Browser tests stub the API; PHP tests exercise the actual local endpoint without production database configuration. Production database persistence, duplicates and throttling must additionally be verified after server setup. For a static production preview, run `npm run preview`.

## Server layout

Use PHP 8.1+ with PDO MySQL. The domain document root must contain only `dist/` contents. The private directory must be outside that document root:

```
account-root/
  koino-private/config.php
  website/                 <- koinolabs.com document root
    index.html
    stats777.php
    .htaccess
    api/waitlist.php
    api/admin/
    assets/
    fonts/
```

The endpoint defaults to `account-root/koino-private/config.php` for this layout. For another layout, set `KOINO_CONFIG_PATH` to the absolute private path in the PHP server environment. Never put passwords in Vite variables, public files, deployment arguments, or Git. Restrict the private directory to 0700 and config to 0600 where supported by the host.

Create the private configuration from `server/config.example.php`, supply the database password securely on the server, and generate a random rate-limit secret (`bin2hex(random_bytes(32))`). Set up the waitlist and admin tables by uploading `server/setup.php` and `schema.sql` outside the document root and running the setup with PHP CLI and `KOINO_CONFIG_PATH` set. Existing records are preserved and missing waitlist indexes are added idempotently.

## Admin dashboard

The unlisted dashboard lives at `/stats777`. The path itself is not a security boundary: every statistics and export endpoint requires an authenticated PHP session. Sessions use an HTTP-only, same-site cookie and expire eight hours after login.

Provision or rotate the initial admin from an interactive server shell:

```sh
KOINO_CONFIG_PATH=/absolute/path/to/koino-private/config.php php setup.php --provision-admin admin777
```

The command prompts for the password without echoing it and stores only `password_hash()` output in `koino_admin_users`. For a non-interactive deployment, `KOINO_ADMIN_PASSWORD` is supported for the process invocation, but it must be supplied through the host's secret mechanism rather than committed, written to config, or placed in a shared shell history. Running setup without `--provision-admin` only migrates the schema.

The dashboard provides:

- total, iOS, Android, and unknown-device counts plus an all-time daily chart in `Europe/Stockholm`;
- a 50-row paginated table filtered by All, iOS, Android, or Unknown;
- a Google Play CSV with one Android email per line and no UTF-8 BOM;
- a TestFlight CSV with `First Name,Last Name,Email Address`, blank optional names, and one iOS email per row.

## Deployment

SFTP hostname: `5021379195.ssh.w2.strato.hosting`. Username: `su1122758`; port: 22; account root: `/`. The first observed host fingerprint is `SHA256:1gx2w8Rtv3wCgi7Jh8myf/KVd72cRQbow03UP8P095Q`; subsequent connections were pinned to it.

Deployment status (2026-09-10): the landing page and authenticated `/stats777` dashboard are live at https://koinolabs.com, with the domain mapped to `/website` and HTTPS enabled. The admin tables and waitlist indexes are installed, and the initial admin is active with a 60-character PHP bcrypt hash; no plaintext admin password is stored in the database or repository. An authenticated HTTPS smoke test verified the chart, pagination API, both CSV exports, cookie flags, logout, `no-store`, anonymous `401` responses, and the admin route's `X-Robots-Tag`. Configuration remains outside the document root in `/koino-private`. Public uploads are checksum-verified, and replaced release files are backed up locally under `.local/backups/`.

1. Set `KOINO_SFTP_HOST` and run `node scripts/inspect-host.mjs` to obtain the host fingerprint without sending credentials. Verify it against the hosting account. Set `KOINO_SFTP_FINGERPRINT` and `KOINO_SFTP_PASSWORD` in the process environment, then rerun for a read-only directory listing.
2. Verify the domain’s document-root mapping and activate its SSL certificate. The initial public check returned STRATO’s reserved-domain page over HTTP and an HTTPS handshake failure. Do not enable live signup until HTTPS works.
3. Back up files that will be replaced, outside the public directory. Do not overwrite unrelated sites, delete existing folders, or blindly replace existing `.htaccess` rules.
4. Install private configuration and tables, then provision the admin through the CLI prompt. With the verified SFTP values and password supplied as process environment variables, run `npm run deploy:sftp`. The script backs up replaced files, uploads assets first and `index.html` last, and verifies every upload by SHA-256. Ensure private files cannot be fetched through any domain or alias.
5. Verify HTTPS, API persistence, case-insensitive duplicate handling, five waitlist requests per IP per 15-minute bucket, five failed admin logins per IP/username per 15-minute bucket, protected admin APIs, and generic failure responses. Use a dedicated test address and remove only that verification record afterward.
6. Verify both export files in the current Google Play Console and App Store Connect import dialogs before inviting testers.
7. To roll back, restore the backed-up entrypoint, endpoint and server rules. Leave the waitlist and admin database tables intact.

## Privacy and maintenance

The public notice says the waitlist is for launch updates, includes help@koinolabs.com for removal requests, and promises deletion within three months of the launch announcement. The owner must honor removal requests and perform that post-launch deletion. No mail is sent automatically. No analytics or marketing cookies are used.

Rate limits use hashed IP identifiers, not raw IPs. Old buckets are cleaned during requests. Tester exports are available only through the authenticated admin dashboard and are sent with `Cache-Control: no-store`.

Brand source: supplied Koino guide and existing transparent logo. Montserrat and Inter are self-hosted; licenses are in `public/fonts/`.
