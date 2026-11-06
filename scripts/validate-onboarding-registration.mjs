import assert from "node:assert/strict";
import { build } from "esbuild";

const auth = { app: { options: { projectId: "demo-koino" } }, currentUser: null };
const accounts = new Map();
const hooks = new Set();
const saved = new Map();
const published = [];
let persistedUser = null;
let signupCalls = 0;
let nextUid = 1;
let pauseWrite;
let failWrite = false;

async function publishUser(user) {
  for (const hook of hooks) await hook(user);
  persistedUser = user;
  auth.currentUser = user;
  published.push({ user, storage: new Map(saved) });
}

function registerBeforeAuth(sdkAuth, hook) {
  assert.equal(sdkAuth, auth);
  hooks.add(hook);
  return () => hooks.delete(hook);
}

async function createAccount(sdkAuth, email, password) {
  assert.equal(sdkAuth, auth);
  assert.equal(email, email.trim());
  assert.equal(password, "fixture-password");
  signupCalls++;
  const normalizedEmail = email.toLowerCase();
  if (accounts.has(normalizedEmail)) throw new Error("auth/email-already-in-use");
  const user = { uid: `account-${nextUid++}`, email: normalizedEmail };
  accounts.set(normalizedEmail, user);
  await publishUser(user);
  return { user };
}

const fixture = globalThis.__onboardingRegistration = {
  auth,
  registerBeforeAuth,
  createAccount,
  storage: {
    getItem: async (key) => saved.get(key) ?? null,
    async setItem(key, value) {
      await pauseWrite;
      if (failWrite) throw new Error("Onboarding storage write failed.");
      saved.set(key, value);
    },
  },
};

const mocks = {
  "@firebase/auth": `
    export const beforeAuthStateChanged = globalThis.__onboardingRegistration.registerBeforeAuth;
    export const createUserWithEmailAndPassword = globalThis.__onboardingRegistration.createAccount;
  `,
  "@/state/store/firebase": "export const auth = globalThis.__onboardingRegistration.auth;",
  "@/state/encryption/local-storage": "export default globalThis.__onboardingRegistration.storage;",
};

try {
  const bundled = await build({
    entryPoints: ["state/onboarding-progress.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    plugins: [{ name: "onboarding-registration", setup(builder) {
      builder.onResolve({ filter: /^@firebase\/auth$|^@\/state\/(store\/firebase|encryption\/local-storage)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
    } }],
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
  const { readOnboardingProgress, writeOnboardingProgress, registerForOnboarding } = await import(moduleUrl);
  const progressKey = (uid) => `e2ee.onboarding.v1.demo-koino.${uid}`;
  const existing = { uid: "existing", email: "existing@example.test" };
  accounts.set(existing.email, existing);

  await assert.rejects(registerForOnboarding(existing.email, "fixture-password", "Other Name"), /email-already-in-use/);
  assert.equal(hooks.size, 0, "A duplicate signup leaves no middleware behind");
  await publishUser(existing);
  assert.equal(await readOnboardingProgress(existing.uid), null, "Ordinary sign-in after rejected signup stays outside onboarding");
  await assert.rejects(registerForOnboarding("other@example.test", "fixture-password", "Other"), /Sign out/);
  assert.equal(signupCalls, 1, "Registering while signed in does not create a second account");
  await publishUser(null);

  let resumeWrite;
  pauseWrite = new Promise((resolve) => { resumeWrite = resolve; });
  const registration = registerForOnboarding("  New@example.test  ", "fixture-password", "  New Member  ");
  const pendingUser = accounts.get("new@example.test");
  assert.ok(pendingUser, "Firebase created the user before beginning auth publication");
  assert.equal(hooks.size, 1);
  assert.equal(persistedUser, null, "SDK persistence waits for the encrypted onboarding marker");
  assert.equal(auth.currentUser, null, "Auth observers cannot see a partially prepared registration");
  assert.equal(await readOnboardingProgress(pendingUser.uid), null);
  resumeWrite();
  await registration;
  pauseWrite = undefined;
  const pending = { phase: "journey", signupName: "New Member" };
  assert.deepEqual(JSON.parse(published.at(-1).storage.get(progressKey(pendingUser.uid))), pending);
  assert.deepEqual(await readOnboardingProgress(pendingUser.uid), pending);
  assert.equal(persistedUser, pendingUser);
  assert.equal(hooks.size, 0, "Successful signup removes its pre-auth hook");
  assert.equal(saved.size, 1, "Registration stores a UID marker without retaining the email or password");

  await publishUser(null);
  await publishUser(existing);
  assert.equal(await readOnboardingProgress(existing.uid), null, "Account switching does not adopt another UID's progress");
  await publishUser(null);
  await publishUser(pendingUser);
  const restarted = await import(`${moduleUrl}#restart`);
  assert.deepEqual(await restarted.readOnboardingProgress(pendingUser.uid), pending, "A fresh module can resume the pending registration");
  auth.app.options.projectId = "other-project";
  assert.equal(await restarted.readOnboardingProgress(pendingUser.uid), null, "The same UID in another Firebase project cannot adopt the marker");
  auth.app.options.projectId = "demo-koino";
  await writeOnboardingProgress(pendingUser.uid, { phase: "complete" });
  await publishUser(null);
  await publishUser(pendingUser);
  assert.deepEqual(await restarted.readOnboardingProgress(pendingUser.uid), { phase: "complete" });
  assert.equal(saved.get(progressKey(pendingUser.uid)), '{"phase":"complete"}', "Completion drops the signup name");
  await publishUser(null);

  failWrite = true;
  await assert.rejects(registerForOnboarding("interrupted@example.test", "fixture-password", "Interrupted"), /storage write failed/);
  const interrupted = accounts.get("interrupted@example.test");
  assert.ok(interrupted, "The remote signup can succeed while local persistence is unavailable");
  assert.equal(persistedUser, null);
  assert.equal(auth.currentUser, null);
  assert.equal(hooks.size, 0, "An aborted auth publication also removes its hook");
  failWrite = false;
  await publishUser(interrupted);
  assert.equal(await readOnboardingProgress(interrupted.uid), null, "Retry through ordinary sign-in succeeds after local storage recovers");

  saved.set(progressKey("malformed"), '{"phase":"journey","signupName":42}');
  await assert.rejects(readOnboardingProgress("malformed"), /progress could not be read/, "Invalid progress is distinguishable from an existing account");
  assert.equal(fixture.auth.currentUser, interrupted);
  console.log("Onboarding registration passed: persistence order, failed and duplicate signup, sign-in, UID and project isolation, restart, and completion.");
} finally {
  delete globalThis.__onboardingRegistration;
}
