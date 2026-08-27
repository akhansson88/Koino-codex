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
npm run validate:bible-search
```

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
