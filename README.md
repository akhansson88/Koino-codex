# KOINO mobile app

KOINO is an Expo Go app for iPhone and Android. The project only targets these
two mobile platforms.

## Run in Expo Go

Install dependencies and start the development server:

```sh
npm install
npm start
```

Scan the QR code with Expo Go on Android, or with the iPhone camera and open it
in Expo Go. For devices on the same local network, `npm run start:lan` is also
available.

Useful checks:

```sh
npm run typecheck
npm run doctor
npm run validate:bible-plans
npm run validate:bible-search
npm run validate:startup
npm run validate:pagination
```

Cold-start milestones are logged as `[startup] … +Nms` and are also available
at runtime in `globalThis.__KOINO_STARTUP_MARKS__` for device-side inspection.

Bible text, full-text search, and cross-references are packaged in
`assets/bible/koino-bible-v1.db`. Normal development starts never rebuild this
asset or clear Metro's cache. After changing Bible source data, rebuild it
explicitly with `npm run bible:build`; this requires Python 3 with SQLite FTS5.
Use `npm run start:tunnel` only when LAN discovery is unavailable, and
`npm run start:clear` only when Metro's cache genuinely needs resetting.

The `functions/` directory contains the Firebase backend used by app services.
It is separate from the Expo client and is not a website.

## Donations

The Expo app uses the existing donation API at
`https://koino-community.netlify.app` by default. No local `.env` is needed for
this connection. To use another backend, set `EXPO_PUBLIC_DONATION_API_ORIGIN`
to its HTTPS origin (without a path) and restart Expo with a cleared cache.
This is a public address; never put Stripe keys in Expo environment variables.
Stripe credentials and test/live mode are managed on the payment server.

Run `npm run test:donations` to check the client connection and error handling.
