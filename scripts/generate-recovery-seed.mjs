import sodium from "libsodium-wrappers";

await sodium.ready;
const seed = sodium.to_base64(sodium.randombytes_buf(32), sodium.base64_variants.URLSAFE_NO_PADDING);
console.log(seed);
console.log("");
console.log("Store this value as the KOINO_RECOVERY_SEED Functions secret:");
console.log("  firebase functions:secrets:set KOINO_RECOVERY_SEED --project <project>");
console.log("");
console.log("Never commit the generated value. The app only needs the public key returned by escrowKey.");
