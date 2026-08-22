# Stripe donations setup

KOINO donations use Stripe Checkout from Netlify Functions. Stripe and Firebase server credentials must only be stored in Netlify's encrypted environment configuration, never in Expo variables or committed files.

## Test-mode configuration

1. In Stripe test mode, create a restricted API key with only the permissions needed for Customers (read/write), Checkout Sessions (read/write), and Billing Portal Sessions (write). Configure an IP restriction if the deployment has stable egress IPs.
2. Enable the Stripe customer portal in test mode. Allow donors to update payment methods, cancel subscriptions, and view invoice history.
3. Create a Firebase service account that can verify Firebase Authentication ID tokens. Store the complete downloaded service-account JSON as one Netlify secret.
4. Set these Netlify values:

   - `STRIPE_RESTRICTED_KEY`: the Stripe test restricted key (`rk_test_…`).
   - `STRIPE_APP_ORIGIN`: the public HTTPS origin hosting this Expo web build and its Netlify Functions, without a trailing slash.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase service-account JSON object.
   - `EXPO_PUBLIC_DONATION_API_ORIGIN`: the same public HTTPS origin. This is a public build-time value used only by native clients; it must not contain a key.

5. Deploy a new web and native build. On native builds, confirm the existing `koino` URL scheme opens `/donation-thank-you`, `/donation-confirm`, and `/me`.

Use separate restricted keys and Firebase credentials for test and production deploy contexts. Before launch, enable the desired live Stripe payment methods, repeat the Checkout and portal tests with live configuration, and retain test mode for preview deploys.
