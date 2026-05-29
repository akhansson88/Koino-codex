const fs = require('fs');
const path = require('path');

const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.log('dist/index.html not found — run `npm run build` first');
  process.exit(0);
}

let html = fs.readFileSync(distIndex, 'utf8');
let changed = false;

// Only inject tags that Expo doesn't already add from app.json web config
const missing = [];
if (!html.includes('rel="manifest"')) missing.push('<link rel="manifest" href="/manifest.json">');
if (!html.includes('apple-touch-icon')) missing.push('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
if (!html.includes('apple-mobile-web-app-capable')) missing.push('<meta name="apple-mobile-web-app-capable" content="yes">');
if (!html.includes('apple-mobile-web-app-status-bar-style')) missing.push('<meta name="apple-mobile-web-app-status-bar-style" content="default">');
if (!html.includes('apple-mobile-web-app-title')) missing.push('<meta name="apple-mobile-web-app-title" content="KOINO">');

if (missing.length > 0) {
  html = html.replace('</head>', `    ${missing.join('\n    ')}\n  </head>`);
  changed = true;
}

// Service worker registration
if (!html.includes('serviceWorker')) {
  const swScript = `<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
</script>`;
  html = html.replace('</body>', `    ${swScript}\n  </body>`);
  changed = true;
}

if (changed) {
  fs.writeFileSync(distIndex, html, 'utf8');
  console.log('PWA tags injected');
} else {
  console.log('PWA tags already present');
}
