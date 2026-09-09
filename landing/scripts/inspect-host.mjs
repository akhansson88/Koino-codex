// Read-only inspection. Never print or persist the SFTP password.
import { Client } from "ssh2";
import { createHash } from "node:crypto";
const host = process.env.KOINO_SFTP_HOST;
const password = process.env.KOINO_SFTP_PASSWORD;
const fingerprint = process.env.KOINO_SFTP_FINGERPRINT;
if (!host)
  throw Error(
    "Set KOINO_SFTP_HOST to the account-specific server from STRATO.",
  );
if (!fingerprint) {
  const probe = new Client();
  probe
    .on("error", () => {})
    .connect({
      host,
      port: 22,
      username: process.env.KOINO_SFTP_USER || "su1122758",
      readyTimeout: 15000,
      hostVerifier(key) {
        console.log(
          "Server fingerprint: SHA256:" +
            createHash("sha256")
              .update(key)
              .digest("base64")
              .replace(/=+$/, ""),
        );
        console.log(
          "Verify the fingerprint, then set KOINO_SFTP_FINGERPRINT and run again. No credentials were sent.",
        );
        return false;
      },
    });
} else {
  if (!password)
    throw Error("Set KOINO_SFTP_PASSWORD in the process environment.");
  const client = new Client();
  client
    .on("ready", () =>
      client.sftp((error, sftp) => {
        if (error) {
          console.error(error.message);
          client.end();
          process.exitCode = 1;
          return;
        }
        sftp.readdir("/", (error, files) => {
          if (error) {
            console.error(error.message);
            process.exitCode = 1;
          } else
            console.log(
              files.map((file) => ({
                name: file.filename,
                directory: file.attrs.isDirectory(),
                bytes: file.attrs.size,
              })),
            );
          client.end();
        });
      }),
    )
    .on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .connect({
      host,
      port: 22,
      username: process.env.KOINO_SFTP_USER || "su1122758",
      password,
      readyTimeout: 15000,
      hostVerifier(key) {
        return (
          "SHA256:" +
            createHash("sha256")
              .update(key)
              .digest("base64")
              .replace(/=+$/, "") ===
          fingerprint
        );
      },
    });
}
