import assert from "node:assert/strict";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["state/image-values.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const { displayableImage, displayableImageUrl } = model;

// Real image records keep their URL and every other field.
const avatar = { url: "data:image/webp;base64,AAAA", path: "u/1.webp", width: 512, height: 512 };
assert.equal(displayableImageUrl(avatar), avatar.url);
assert.deepEqual(displayableImage(avatar), avatar);
assert.equal(displayableImageUrl({ url: " https://example.com/a.png " }), "https://example.com/a.png");

// Records from the retired vault carry a ciphertext object in url. Handing that
// to a native Image view crashed Android (probe: versionCode 40), so it must be
// treated as no image at all.
const legacy = {
  url: { ciphertext: "GXJeTPal5brb", context: '{"subject":"u"}', keyId: "group:g" },
  encryptedUri: "koino-encrypted://user-avatars/u/1.webp",
  contentType: "image/webp",
  path: "u/1.webp",
};
assert.equal(displayableImageUrl(legacy), undefined);
assert.equal(displayableImage(legacy), undefined);
assert.equal(displayableImageUrl({ url: 42 }), undefined);
assert.equal(displayableImageUrl({ url: null }), undefined);
assert.equal(displayableImageUrl({ url: "   " }), undefined);
assert.equal(displayableImageUrl({ url: "javascript:alert(1)" }), undefined);
assert.equal(displayableImageUrl(undefined), undefined);
assert.equal(displayableImageUrl(null), undefined);
assert.equal(displayableImageUrl("data:image/webp;base64,AAAA"), undefined);
assert.equal(displayableImage(undefined), undefined);

console.log("image-values: ok");
