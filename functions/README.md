# KOINO payment backend foundation

Payments are **sandbox only** in this phase. The exported `createSupportPayment`
callable requires Firebase Authentication, validates an integer amount in minor
SEK units (10 kr through 100,000 kr), and writes a backend-owned `created`
record to `supportPayments`.
It does not call Stripe and cannot create a PaymentIntent or charge.

## Stripe secret

`STRIPE_SECRET_KEY` belongs in Google Cloud Secret Manager through Firebase
Functions. Only a Stripe test-mode secret (`sk_test_*`) is allowed right now;
the server refuses other key modes at runtime. Never put this value in app code,
an `EXPO_PUBLIC_*` variable, a local committed file, or Firebase client config.

From the repository root, with Firebase CLI authenticated for the sandbox
project:

```sh
firebase functions:secrets:set STRIPE_SECRET_KEY --project koino-codex
```

Then deploy only when the project is ready for this non-chargeable foundation:

```sh
firebase deploy --only firestore:rules,functions --project koino-codex
```

Before committing, inspect tracked content for key-shaped values. This pattern
looks for an actual key rather than the documented prefix:

```sh
git grep -n -E "sk_(test|live)_[A-Za-z0-9]{16,}"
```

## Intentionally not implemented

- Stripe PaymentIntent or Customer creation
- Any Stripe network/connectivity call
- Webhooks or provider-driven status changes
- Subscriptions or recurring billing orchestration
- PaymentSheet, Apple Pay, Google Pay, Swish, or Apple IAP
- Mobile-client integration with the callable or Firestore collection
- Production/live-mode payment configuration

The server-generated Firestore document ID is also stored as
`paymentAttemptId`. A deterministic Stripe idempotency key can be derived from
it during the next pass, so client-editable values never become provider
operation identifiers.
