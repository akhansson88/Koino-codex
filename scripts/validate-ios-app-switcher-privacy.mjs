import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const tar = require("tar");
const pluginPath = "./plugins/with-ios-app-switcher-privacy.cjs";
const withPrivacyCover = require(`../${pluginPath.slice(2)}`);
const expoRoot = path.dirname(require.resolve("expo/package.json"));
const chunks = [];
await tar.t({
  file: path.join(expoRoot, "template.tgz"),
  onReadEntry(entry) {
    if (entry.path === "package/ios/HelloWorld/AppDelegate.swift") entry.on("data", chunk => chunks.push(chunk));
  },
});
const template = Buffer.concat(chunks).toString("utf8");
assert.ok(template.includes("public class AppDelegate: ExpoAppDelegate {"), "The test must use the pinned Expo Swift template");

const registered = () => withPrivacyCover({ name: "Privacy fixture", slug: "privacy-fixture", ios: {} });
function runMod(name, modResults) {
  const config = registered();
  const mod = config.mods.ios[name];
  assert.equal(typeof mod, "function", `Register the real Expo ${name} mod`);
  return mod({ ...config, modRequest: { platform: "ios", modName: name }, modResults });
}
async function transform(contents, language = "swift") {
  return (await runMod("appDelegate", { contents, language, path: "fixture/AppDelegate.swift" })).modResults.contents;
}

function method(source, signature) {
  const start = source.search(signature);
  assert.ok(start >= 0, `Missing Swift method ${signature}`);
  const opening = source.indexOf("{", start);
  assert.ok(opening >= 0);
  let depth = 0;
  for (let index = opening; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed Swift method ${signature}`);
}

function assertOrder(source, first, second) {
  const firstIndex = source.search(first);
  const secondIndex = source.search(second);
  assert.ok(firstIndex >= 0 && secondIndex > firstIndex, `Expected ${first} before ${second}`);
}

const source = await transform(template);
assert.equal(await transform(source), source, "Running prebuild again must keep exactly one managed block");
assert.equal((source.match(/^import UIKit$/gm) ?? []).length, 1);
assert.equal((source.match(/private\s+var\s+koinoPrivacyCover\s*:\s*UIView\?/g) ?? []).length, 1);
assertOrder(source, /class AppDelegate: ExpoAppDelegate/, /private\s+var\s+koinoPrivacyCover/);
assertOrder(source, /private\s+var\s+koinoPrivacyCover/, /class ReactNativeDelegate/);

const preservedMethods = [
  /func application\(\s*_ application: UIApplication,\s*didFinishLaunchingWithOptions/,
  /func application\(\s*_ app: UIApplication,\s*open url:/,
  /func application\(\s*_ application: UIApplication,\s*continue userActivity:/,
  /func sourceURL\(for bridge:/,
  /func bundleURL\(\)/,
];
for (const signature of preservedMethods) assert.equal(method(source, signature), method(template, signature), "Expo launch, link and bundle methods stay untouched");

for (const name of ["applicationWillResignActive", "applicationDidEnterBackground"]) {
  const body = method(source, new RegExp(`override func ${name}\\(`));
  assertOrder(body, /showKoinoPrivacyCover\(\)/, new RegExp(`super\\.${name}\\(application\\)`));
}
const active = method(source, /override func applicationDidBecomeActive\(/);
assertOrder(active, /super\.applicationDidBecomeActive\(application\)/, /koinoPrivacyCover\?\.removeFromSuperview\(\)/);
assertOrder(active, /koinoPrivacyCover\?\.removeFromSuperview\(\)/, /koinoPrivacyCover\s*=\s*nil/);
assert.doesNotMatch(active, /showKoinoPrivacyCover\(\)/);

const show = method(source, /private func showKoinoPrivacyCover\(\)/);
assert.match(show, /\bUIView\(frame:\s*\w+\.bounds\)/, "Cover the full native window, including its safe area");
assert.match(show, /\.autoresizingMask\s*=\s*\[[^\]]*\.flexibleWidth[^\]]*\.flexibleHeight[^\]]*\]/);
assert.match(show, /\.isOpaque\s*=\s*true/);
assert.match(show, /\.backgroundColor\s*=\s*\.black\b/);
assert.match(show, /\.isUserInteractionEnabled\s*=\s*false/);
assert.match(show, /\.isAccessibilityElement\s*=\s*false/);
assert.match(show, /\.accessibilityElementsHidden\s*=\s*true/);
assert.match(show, /(?:if|guard)[^\n]*koinoPrivacyCover|koinoPrivacyCover\s*\?\?/, "Backgrounding reuses the existing cover");
assertOrder(show, /\.frame\s*=\s*\w+\.bounds/, /\.bringSubviewToFront\(cover\)/);
assertOrder(show, /cover\.superview\s*!==\s*\w+/, /\b\w+\.addSubview\(cover\)/);
assert.match(show, /koinoPrivacyCover\s*=\s*\w+/);
const lifecycle = [show, active, ...["applicationWillResignActive", "applicationDidEnterBackground"].map(name => method(source, new RegExp(`override func ${name}\\(`)))].join("\n");
assert.doesNotMatch(lifecycle, /DispatchQueue|UIView\.animate|Task\s*\{|asyncAfter|recoveryKey|accessibilityIdentifier|viewWithTag/i,
  "The cover is synchronous native lifecycle protection independent of mounted content");

await assert.rejects(transform(template, "objc"), /swift|AppDelegate/i);
const unfamiliar = template.replace("class AppDelegate: ExpoAppDelegate", "class OtherDelegate: ExpoAppDelegate");
await assert.rejects(transform(unfamiliar), /AppDelegate|template/i);
await assert.rejects(transform(template.replace("var window: UIWindow?", "var otherWindow: UIWindow?")), /AppDelegate|template/i);
await assert.rejects(transform(`${template}\npublic class AppDelegate: ExpoAppDelegate {\n}\n`), /AppDelegate|template/i);
for (const name of ["applicationWillResignActive", "applicationDidEnterBackground", "applicationDidBecomeActive"]) {
  const conflict = template.replace("  var window: UIWindow?", `  var window: UIWindow?\n  public override func ${name}(_ application: UIApplication) {}`);
  await assert.rejects(transform(conflict), /conflict|lifecycle|AppDelegate/i, `Refuse an existing ${name} rather than shadowing it`);
}
await assert.rejects(transform(template.replace("var window: UIWindow?", "var window: UIWindow?\n  private var koinoPrivacyCover: UIView?")), /AppDelegate|template/i);

const existingPlist = { UIBackgroundModes: ["audio"], NSLocalNetworkUsageDescription: "fixture" };
assert.deepEqual((await runMod("infoPlist", structuredClone(existingPlist))).modResults, existingPlist);
await assert.rejects(runMod("infoPlist", { ...existingPlist, UIApplicationSceneManifest: {} }), /scene|single-window|lifecycle/i);
assert.deepEqual(Object.keys(registered().mods).sort(), ["ios"], "No Android mods are registered");

const appConfigPath = require.resolve("../app.config.js");
const previousVariant = process.env.APP_VARIANT;
const previousEmulatorHost = process.env.EXPO_PUBLIC_KOINO_EMULATOR_HOST;
try {
  for (const variant of ["production", "development", "emulator"]) {
    process.env.APP_VARIANT = variant;
    process.env.EXPO_PUBLIC_KOINO_EMULATOR_HOST = "192.168.0.17";
    delete require.cache[appConfigPath];
    const config = require(appConfigPath);
    const matching = config.plugins.filter(entry => (Array.isArray(entry) ? entry[0] : entry) === pluginPath);
    assert.equal(matching.length, 1, `Register the iOS privacy plugin once in ${variant}`);
  }
} finally {
  for (const [name, prior] of [["APP_VARIANT", previousVariant], ["EXPO_PUBLIC_KOINO_EMULATOR_HOST", previousEmulatorHost]]) {
    if (prior === undefined) delete process.env[name];
    else process.env[name] = prior;
  }
  delete require.cache[appConfigPath];
}

console.log("iOS app-switcher privacy config passed: pinned Swift template, lifecycle ordering, one opaque full-window cover, idempotence, incompatible project rejection, variant registration and Android isolation.");
