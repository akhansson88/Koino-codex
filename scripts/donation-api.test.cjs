const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { transformSync } = require("esbuild");

const source = fs.readFileSync(path.join(__dirname, "../features/donation-api.ts"), "utf8");
const { code } = transformSync(source, { loader: "ts", format: "cjs" });

function client({ origin, response, networkError } = {}) {
  const requests = [];
  const opened = [];
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, URL,
    process: { env: { EXPO_PUBLIC_DONATION_API_ORIGIN: origin } },
    console: { warn() {} },
    require(name) {
      if (name === "react-native") return { Platform: { OS: "android" } };
      if (name === "expo-web-browser") return {
        openBrowserAsync: async (...args) => { opened.push(args); },
        WebBrowserPresentationStyle: { FULL_SCREEN: "fullScreen" },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (networkError) throw new TypeError("Network request failed");
      return response || {
        ok: true,
        json: async () => ({ checkoutUrl: "https://checkout.stripe.com/c/pay/test-session" }),
      };
    },
  });
  return { api: module.exports, requests, opened };
}

test("Expo checkout works without local environment configuration", async () => {
  const { api, requests, opened } = client();
  await api.startDonationCheckout("test-token", 100, "one_time");
  assert.equal(requests[0].url, "https://koino-community.netlify.app/api/donations/checkout");
  assert.equal(requests[0].options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(requests[0].options.body), { amountSek: 100, frequency: "one_time", platform: "native" });
  assert.equal(opened[0][0], "https://checkout.stripe.com/c/pay/test-session");
  assert.equal(opened[0][1].createTask, false);
});

test("blank configuration uses default; explicit HTTPS overrides are preserved", async () => {
  for (const [origin, expected] of [["  ", "https://koino-community.netlify.app"], [" https://payments.example.com/ ", "https://payments.example.com"]]) {
    const { api, requests } = client({ origin });
    await api.verifyDonation("test-token", "test-session");
    assert.equal(requests[0].url, `${expected}/api/donations/verify`);
  }
});

test("invalid configuration is not a network error and sends no token", async () => {
  for (const origin of ["not-a-url", "http://payments.example.com", "https://user:pass@payments.example.com", "https://payments.example.com/api", "https://payments.example.com/?key=x"]) {
    const { api, requests } = client({ origin });
    await assert.rejects(api.startDonationCheckout("test-token", 100, "one_time"), /felaktigt konfigurerad/);
    assert.equal(requests.length, 0);
  }
});

test("actual network failures retain the connection error", async () => {
  const { api, requests } = client({ networkError: true });
  await assert.rejects(api.startDonationCheckout("test-token", 100, "one_time"), /Kunde inte nå betaltjänsten/);
  assert.equal(requests.length, 1);
});

test("expired authentication and server failures do not open Checkout", async () => {
  for (const [status, message] of [[401, /inloggning har gått ut/], [500, /Betalningen kunde inte startas/]]) {
    const { api, opened } = client({ response: { ok: false, status, json: async () => ({ error: "Unavailable" }) } });
    await assert.rejects(api.startDonationCheckout("test-token", 100, "one_time"), message);
    assert.equal(opened.length, 0);
  }
});

test("missing authentication never sends a request", async () => {
  const { api, requests } = client();
  await assert.rejects(api.startDonationCheckout(null, 100, "one_time"), /Logga in igen/);
  assert.equal(requests.length, 0);
});
