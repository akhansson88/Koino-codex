import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expoCli = join(root, "node_modules", "expo", "bin", "cli");
const args = new Set(process.argv.slice(2));

const targets = args.has("--safari-only")
  ? [{ name: "Safari web app", outputDir: "dist-safari", safari: true }]
  : [
      { name: "Web app", outputDir: "dist", safari: false },
      { name: "Safari web app", outputDir: "dist-safari", safari: true },
    ];

for (const target of targets) {
  console.log(`\nBuilding ${target.name} into ${target.outputDir}...`);

  const result = spawnSync(
    process.execPath,
    [expoCli, "export", "--platform", "web", "--output-dir", target.outputDir],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (target.safari) {
    prepareSafariBuild(join(root, target.outputDir));
  }
}

function prepareSafariBuild(outputPath) {
  const indexPath = join(outputPath, "index.html");
  let html = readFileSync(indexPath, "utf8");

  html = html.replace(
    /<meta name="viewport"[^>]*>/,
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />'
  );

  if (!html.includes('name="apple-mobile-web-app-capable"')) {
    html = html.replace(
      "</head>",
      `    <meta name="application-name" content="KOINO" />
    <meta name="description" content="KOINO prayer, journal, and Bible rhythms." />
    <meta name="theme-color" content="#FAF5EE" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="KOINO" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
    <link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152.png" />
  </head>`
    );
  }

  if (!html.includes("navigator.serviceWorker.register")) {
    html = html.replace(
      "</body>",
      `  <script>
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js").catch(function () {});
      });
    }
  </script>
</body>`
    );
  }

  writeFileSync(indexPath, html);
}
