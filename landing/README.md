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
    .htaccess
    api/waitlist.php
    assets/
    fonts/
```

The endpoint defaults to `account-root/koino-private/config.php` for this layout. For another layout, set `KOINO_CONFIG_PATH` to the absolute private path in the PHP server environment. Never put passwords in Vite variables, public files, deployment arguments, or Git. Restrict the private directory to 0700 and config to 0600 where supported by the host.

Create the private configuration from `server/config.example.php`, supply the password securely on the server, and generate a random rate-limit secret (`bin2hex(random_bytes(32))`). Set up the two dedicated tables with `server/schema.sql` using phpMyAdmin, or upload `server/setup.php` and `schema.sql` outside the document root and run the setup with PHP CLI and `KOINO_CONFIG_PATH` set. No application tables are modified.

## Deployment

SFTP hostname: `5021379195.ssh.w2.strato.hosting`. Username: `su1122758`; port: 22; account root: `/`. The first observed host fingerprint is `SHA256:1gx2w8Rtv3wCgi7Jh8myf/KVd72cRQbow03UP8P095Q`; subsequent connections were pinned to it.

Deployment status (2026-09-09): live at https://koinolabs.com, with the domain mapped to `/website` and the included SSL certificate assigned. HTTP redirects to HTTPS; both the apex and www hosts respond successfully. Configuration is separately installed in `/koino-private` with restrictive permissions and an HTTP deny rule. Production PHP 8.4.23 connects to MySQL. Both waitlist tables are initialized, and new records require `device` to be `ios` or `android`; legacy records may have a null device until they are updated. Five valid submissions (including a case-variant duplicate that changed the stored device) returned success, stored exactly one record with the latest device, and the sixth request returned HTTP 429. The verification record, its rate-limit state, and temporary setup endpoints were removed. Private configuration and Git paths return 404; API directory listing returns 403. Public uploads are checksum-verified, and replaced release files are backed up locally under `.local/backups/`.

1. Set `KOINO_SFTP_HOST` and run `node scripts/inspect-host.mjs` to obtain the host fingerprint without sending credentials. Verify it against the hosting account. Set `KOINO_SFTP_FINGERPRINT` and `KOINO_SFTP_PASSWORD` in the process environment, then rerun for a read-only directory listing.
2. Verify the domain’s document-root mapping and activate its SSL certificate. The initial public check returned STRATO’s reserved-domain page over HTTP and an HTTPS handshake failure. Do not enable live signup until HTTPS works.
3. Back up files that will be replaced, outside the public directory. Do not overwrite unrelated sites, delete existing folders, or blindly replace existing `.htaccess` rules.
4. Install private configuration and tables. Upload `dist/` contents to the verified document root with SFTP, assets first and `index.html` last. Merge existing `.htaccess` rules if necessary. Ensure private files cannot be fetched through any domain or alias.
5. Verify HTTPS, API persistence, case-insensitive duplicate handling, five requests per IP per 15-minute bucket, and generic failure responses. Use a dedicated test address and remove only that verification record afterward.
6. To roll back, restore the backed-up entrypoint, endpoint and server rules. Leave the waitlist database intact so registrations are preserved.

## Privacy and maintenance

The public notice says the waitlist is for launch updates, includes help@koinolabs.com for removal requests, and promises deletion within three months of the launch announcement. The owner must honor removal requests and perform that post-launch deletion. No mail is sent automatically. No analytics or marketing cookies are used.

Rate limits use hashed IP identifiers, not raw IPs. Old buckets are cleaned during successful requests. Export addresses through the hosting database tools; no public export or admin endpoint is provided.

Brand source: supplied Koino guide and existing transparent logo. Montserrat and Inter are self-hosted; licenses are in `public/fonts/`.
