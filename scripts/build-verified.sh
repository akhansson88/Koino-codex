#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

expo="${SITES_PROJECT_ROOT}/node_modules/.bin/expo"
if [[ ! -x "${expo}" ]]; then
  echo "Expo is unavailable. Run npm ci before building." >&2
  exit 69
fi

echo "Building the KOINO web app..."
node "${script_dir}/generate-bible-data.mjs"
EXPO_NO_TELEMETRY=1 timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-6m}" \
  "${expo}" export --platform web

node "${script_dir}/inject-pwa.js"
node "${script_dir}/package-sites.mjs"
"${script_dir}/validate-artifact.sh"
