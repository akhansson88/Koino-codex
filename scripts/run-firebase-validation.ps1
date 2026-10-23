param(
  [ValidateSet('moderation', 'encryption', 'backend', 'all')]
  [string]$Suite = 'all'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$savedEnvironment = @{}
foreach ($key in @('JAVA_HOME','PATH','FIREBASE_EMULATORS_PATH','XDG_CONFIG_HOME','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_CONFIG','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','CI','FIREBASE_TOKEN','GOOGLE_APPLICATION_CREDENTIALS')) {
  $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}
Push-Location -LiteralPath $projectRoot
try {
  $toolingRoot = Join-Path $projectRoot '.npm-cache/koino-validation'
  $portableJava = Get-ChildItem -LiteralPath (Join-Path $toolingRoot 'java') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($portableJava) {
    $env:JAVA_HOME = $portableJava.FullName
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
  }
  if (-not (Get-Command java -ErrorAction SilentlyContinue)) { throw 'Java 21+ is required. Configure JAVA_HOME for this process or use the portable validation cache.' }
  $firebaseCli = Join-Path $toolingRoot 'firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js'
  if (-not (Test-Path -LiteralPath $firebaseCli)) { throw 'Install firebase-tools@15.34.1 under .npm-cache/koino-validation/firebase-cli before running this isolated launcher.' }
  $env:FIREBASE_EMULATORS_PATH = Join-Path $toolingRoot 'emulators'
  $env:XDG_CONFIG_HOME = Join-Path $toolingRoot 'config'
  $env:GCLOUD_PROJECT = 'demo-koino'
  $env:GOOGLE_CLOUD_PROJECT = 'demo-koino'
  $env:FIREBASE_CONFIG = '{"projectId":"demo-koino","databaseURL":"https://demo-koino-default-rtdb.firebaseio.com"}'
  $env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9001'
  $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  $env:CI = 'true'
  Remove-Item Env:FIREBASE_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
  $commands = @{
    moderation = 'node scripts/validate-community-moderation-emulator.mjs'
    encryption = 'node scripts/validate-encryption-emulator.mjs'
    backend = 'node scripts/validate-encryption-backend.mjs'
    all = 'node scripts/validate-community-moderation-emulator.mjs && node scripts/validate-encryption-emulator.mjs && node scripts/validate-encryption-backend.mjs'
  }
  & java -version
  if ($LASTEXITCODE -ne 0) { throw 'Java could not be executed.' }
  & node $firebaseCli --version
  if ($LASTEXITCODE -ne 0) { throw 'Firebase CLI could not be executed.' }
  & npm --prefix functions run build
  if ($LASTEXITCODE -ne 0) { throw 'Functions TypeScript build failed; emulator tests were not run.' }
  & node $firebaseCli emulators:exec --config firebase.emulator-test.json --only auth,database --project demo-koino --non-interactive $commands[$Suite]
  if ($LASTEXITCODE -ne 0) { throw "Firebase emulator validation failed with exit code $LASTEXITCODE" }
} finally {
  foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process') }
  Pop-Location
}
