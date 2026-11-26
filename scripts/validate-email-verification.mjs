import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-email-verification-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const harness = globalThis.__emailVerification = {
  actions: [],
  listeners: new Set(),
  verifyOnCheck: false,
  state: { authEmail: "joel@example.com", emailVerified: false },
};

const mocks = {
  "react-native": `
    export const Text = "Text", View = "View";
    export const AppState = { addEventListener: () => ({ remove() {} }) };
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "@/state/koino-store": `
    import React from "react";
    const harness = globalThis.__emailVerification;
    export function useKoinoFields(keys) {
      const [, force] = React.useReducer(value => value + 1, 0);
      React.useEffect(() => {
        harness.listeners.add(force);
        return () => harness.listeners.delete(force);
      }, []);
      return Object.fromEntries(keys.map(key => [key, harness.state[key]]));
    }
    export function useKoinoActions() {
      return {
        dispatch: async action => {
          harness.actions.push(action);
          if (action.type !== "refreshEmailVerification") return;
          action.report?.(harness.verifyOnCheck);
          harness.state = { ...harness.state, emailVerified: harness.verifyOnCheck };
          for (const listener of harness.listeners) listener();
        },
      };
    }
  `,
  "@/ui/app-components": `
    import React from "react";
    export const Card = "Card", BodyText = "BodyText";
    export const PrimaryButton = ({ children, ...props }) => React.createElement("Button", { ...props, kind: "primary" }, children);
    export const SecondaryButton = ({ children, ...props }) => React.createElement("Button", { ...props, kind: "secondary" }, children);
  `,
  "@/ui/app-language": `
    export const useAppTranslation = () => ({ t: key => key });
  `,
  "@/ui/theme": `
    export const colors = { ink: "#14120F", muted: "#8A8377", olive: "#6B7250" };
    export const typography = { cardTitle: {}, caption: {} };
  `,
};

const textContent = node => node.children.map(child => typeof child === "string" ? child : textContent(child)).join("");

let tree;
try {
  const outfile = path.join(directory, "banner.cjs");
  await build({
    stdin: {
      contents: `export { EmailVerificationBanner } from "./ui/email-verification-banner";`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile,
    jsx: "automatic",
    bundle: true,
    format: "cjs",
    platform: "node",
    plugins: [{ name: "native-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (Object.hasOwn(mocks, name)) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });

  const { EmailVerificationBanner } = require(outfile);
  const screenText = () => tree.root.findAllByType("Text").map(textContent).join("\n");
  const checkButton = () => tree.root.findAllByType("Button").find(node => textContent(node) === "emailVerification.check");

  const mount = () => act(async () => { tree = create(React.createElement(EmailVerificationBanner)); });
  const tapCheck = () => act(async () => { await checkButton().props.onPress(); });

  await mount();
  assert.match(screenText(), /emailVerification\.title/, "the banner shows while the account is unverified");

  await tapCheck();
  assert.match(screenText(), /emailVerification\.checkFailed/, "a failed check tells the person the link is not open yet");
  assert.equal(harness.state.emailVerified, false);

  const dispatchCount = harness.actions.length;
  harness.verifyOnCheck = true;
  await tapCheck();
  assert.equal(harness.actions.length, dispatchCount + 1, "checking asks Auth again");
  assert.equal(harness.state.emailVerified, true);
  assert.equal(tree.toJSON(), null, "a verified account removes the banner without a failure message");

  await act(async () => tree.unmount());
  console.log("Email verification banner passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
