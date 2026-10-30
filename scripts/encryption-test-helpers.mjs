import { buildSync } from "esbuild";
import { fileURLToPath } from "node:url";
import sodium from "libsodium-wrappers";
await sodium.ready;
const result = buildSync({ entryPoints: [fileURLToPath(new URL("../state/encryption/crypto.ts", import.meta.url))], format: "esm", bundle: true, platform: "node", write: false });
const { createCrypto } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
export const crypto = createCrypto(sodium);
export { sodium };
