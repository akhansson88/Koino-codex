// Embeds the designed account emails into the Functions bundle so the exact
// HTML that lives in email/*.html is what users receive.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const outDir = path.resolve(here, "..", "src", "emails");

const files = [
  ["password-reset.html", "passwordResetHtml"],
  ["verify-email.html", "verifyEmailHtml"],
];

fs.mkdirSync(outDir, { recursive: true });
for (const [file, name] of files) {
  const source = fs.readFileSync(path.join(root, "email", file), "utf8");
  const literal = source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  const target = path.join(outDir, `${name}.generated.ts`);
  fs.writeFileSync(
    target,
    `// Generated from email/${file} by scripts/embed-emails.mjs. Do not edit.\nexport const ${name} = \`${literal}\`;\n`,
  );
  console.log("embedded", file, "->", path.relative(root, target));
}
