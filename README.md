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
