# KOINO invite page and app-link files

The QR on the invite screen encodes:

```
https://koinolabs.com/join/?code=ABC123
```

That single URL does three jobs:

1. With the app installed and the next native build, iOS Universal Links and
   Android App Links open KOINO directly on `/join` with the code.
2. With the app installed on a build that predates app links, the page opens
   `koino://join?code=…` from its **Öppna KOINO** button.
3. Without the app, the page shows the code, the waitlist for now, and the
   correct store button once the listings are live.

## Files

| Local | Remote | Purpose |
| --- | --- | --- |
| `join/index.html` | `/website/join/index.html` | Invite landing page |
| `join/join.css` | `/website/join/join.css` | Page styles |
| `join/join.js` | `/website/join/join.js` | Code parsing, app link, copy, language |
| `join/config.js` | `/website/join/config.js` | Store URLs and the `storesLive` switch |
| `join/htaccess` | `/website/join/.htaccess` | CSP, noindex, no-store |
| `well-known/apple-app-site-association` | `/website/.well-known/apple-app-site-association` | iOS Universal Links |
| `well-known/assetlinks.json` | `/website/.well-known/assetlinks.json` | Android App Links |
| `well-known/htaccess` | `/website/.well-known/.htaccess` | `application/json` for AASA |

## Store switch

`join/config.js` has `storesLive: false` because neither public listing exists
yet:

- Play: `com.akhansson.koinomvp` is on internal testing, so the public page is
  a 404.
- App Store: app id `6809953941` is the App Store Connect record, but the app is
  not released, so the public page is a 404.

When both listings are live, set `storesLive: true` and upload `config.js`
again. The page then shows the platform store button and, after 3.2 seconds on
mobile, redirects to that store if the app did not open. Until then it offers
the waitlist instead of a dead store page.

## App-side configuration

`app.config.js` carries the native declarations:

```js
ios: { associatedDomains: ["applinks:koinolabs.com"] }
android: {
  intentFilters: [{
    action: "VIEW",
    autoVerify: true,
    data: [{ scheme: "https", host: "koinolabs.com", pathPrefix: "/join" }],
    category: ["BROWSABLE", "DEFAULT"]
  }]
}
```

Both require the next native build (runtime 2.2.0). JavaScript-only EAS Updates
cannot add an entitlement or an intent filter.

## Association values

- Apple Team ID: `8Y4D77XWFB`
- iOS bundle id: `com.akhansson.koino`
- Android package: `com.akhansson.koinomvp`
- Android signing certificates (Play App Signing): the three SHA-256
  fingerprints in `assetlinks.json` (the current v3.0 signer plus the v3.2
  classical and PQC rotation signers read from the installed Play build).

If the Play signing key ever rotates again, add the new SHA-256 fingerprint to
`assetlinks.json` and re-upload it before shipping the build that uses it.

## Verify after upload

```sh
curl -sI https://koinolabs.com/.well-known/apple-app-site-association
curl -s  https://koinolabs.com/.well-known/apple-app-site-association
curl -sI https://koinolabs.com/.well-known/assetlinks.json
curl -s  https://koinolabs.com/.well-known/assetlinks.json
curl -sI "https://koinolabs.com/join/?code=ABC123"
```

Both association files must return `200` with `Content-Type: application/json`
and must not redirect.

On Android after the native build:

```sh
adb shell pm get-app-links com.akhansson.koinomvp
```

The `koinolabs.com` domain should show `verified`.

On iOS, open the invite link from Notes or Safari on a device with the build;
it should open KOINO without showing the web page.

## Testing the page locally

Serve the repository root and open:

```
http://127.0.0.1:4173/join/?code=ABC123
http://127.0.0.1:4173/join/?code=ABC123&lang=en
http://127.0.0.1:4173/join/?code=bad
```

The `lang` query is a test convenience; the page otherwise follows the phone's
language (Swedish first).
