param(
  [ValidateSet('demo-koino')][string]$ProjectId = 'demo-koino',
  [ValidateSet('Admission', 'Moderation', 'Legacy')][string]$Suite = 'Admission',
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$tooling = Join-Path $repository '.npm-cache/koino-validation'
$java = Join-Path $tooling 'java/jdk-21.0.12.1+1'
$cli = Join-Path $tooling 'firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js'
$rules = Join-Path $repository 'firebase.rules.json'
$suiteScripts = @{ Admission = 'validate-community-admission.mjs'; Moderation = 'validate-community-moderation-acceptance.mjs'; Legacy = 'validate-moderation-legacy.mjs' }
$test = Join-Path $PSScriptRoot $suiteScripts[$Suite]
$selectedServices = if ($Suite -eq 'Legacy') { 'auth,database' } else { 'auth,database,functions' }
$preload = Join-Path $PSScriptRoot 'emulator-node-loopback.cjs'
$source = Join-Path $repository 'functions'
$ports = [ordered]@{ auth = 19099; database = 19001; functions = 15001; hub = 14400; logging = 14500; eventarc = 14999; tasks = 14998 }

# Read-only preflight: never bind ports, edit the phone launcher, or inspect its data.
foreach ($name in @('GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT')) {
  $inherited = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ($inherited -and $inherited -ne $ProjectId) { throw "Refusing inherited non-demo $name. Use a clean PowerShell session." }
}
foreach ($endpoint in @{ FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099'; FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19001'; FIREBASE_FUNCTIONS_EMULATOR_HOST = '127.0.0.1:15001'; FIREBASE_EMULATOR_HUB = '127.0.0.1:14400' }.GetEnumerator()) {
  $inheritedEndpoint = [Environment]::GetEnvironmentVariable($endpoint.Key, 'Process')
  if ($inheritedEndpoint -and $inheritedEndpoint -ne $endpoint.Value) { throw 'Refusing inherited endpoints outside the isolated acceptance environment.' }
}
if ($env:DATABASE_URL -and $env:DATABASE_URL -ne 'https://demo-koino-default-rtdb.firebaseio.com') { throw 'Refusing an inherited non-demo database URL.' }
if ($env:FIREBASE_CONFIG) {
  $inherited = $env:FIREBASE_CONFIG | ConvertFrom-Json
  if ($inherited.projectId -ne $ProjectId -or $inherited.databaseURL -ne 'https://demo-koino-default-rtdb.firebaseio.com') { throw 'Refusing inherited non-demo Firebase configuration.' }
}
foreach ($required in @((Join-Path $java 'bin/java.exe'), $cli, $rules, $test, $preload, (Join-Path $source 'node_modules'), (Join-Path $source 'package.json'), (Join-Path $tooling 'emulators/firebase-database-emulator-v4.11.2.jar'))) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing admission-test prerequisite: $required" }
}
$cliPackage = Get-Content -Raw -LiteralPath (Join-Path $tooling 'firebase-cli/node_modules/firebase-tools/package.json') | ConvertFrom-Json
if ($cliPackage.version -ne '15.34.1') { throw 'This isolated launcher requires the validated workspace Firebase CLI15.34.1.' }
$javaRelease = Get-Content -Raw -LiteralPath (Join-Path $java 'release')
if ($javaRelease -notmatch '(?m)^JAVA_VERSION="21[.]') { throw 'This isolated launcher requires workspace Java21.' }
$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
foreach ($port in $ports.Values) {
  if (@($listeners | Where-Object Port -EQ $port).Count) { throw "Admission-test port $port is already in use. No service was stopped or changed." }
}
if ($CheckOnly) {
  Write-Output "$Suite preflight passed: demo-koino, cached tooling, seven free alternate loopback ports; no files or services changed."
  return
}

$base = [IO.Path]::GetFullPath((Join-Path $repository '.codex/koino-admission-validation'))
$run = [IO.Path]::GetFullPath((Join-Path $base ((Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))))
if (-not $run.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $run)) { throw 'Unsafe or existing admission run directory.' }
$functions = Join-Path $run 'functions'
$compiled = Join-Path $functions 'lib'
$temporary = Join-Path $run 'tmp'
$proof = Join-Path $run 'proof'
$data = Join-Path $run 'export'
$config = Join-Path $run 'firebase.json'
$saved = @{}
$pushed = $false
try {
  New-Item -ItemType Directory -Path $run, $functions, $temporary, $proof -ErrorAction Stop | Out-Null
  $keys = @('JAVA_HOME', 'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'PATH', 'TEMP', 'TMP', 'TMPDIR', 'XDG_CONFIG_HOME', 'CLOUDSDK_CONFIG', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT', 'DATABASE_URL', 'FIREBASE_CONFIG', 'FIREBASE_EMULATORS_PATH', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_FUNCTIONS_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB', 'FUNCTIONS_EMULATOR', 'KOINO_EMULATOR_TEST_MODE', 'KOINO_ADMISSION_TEST_MODE', 'KOINO_ACCEPTANCE_SUITE', 'KOINO_ADMISSION_TEST_STAGE', 'KOINO_ADMISSION_TEST_STATE_DIR', 'KOINO_ADMISSION_TEST_RUN_DIR', 'KOINO_ADMISSION_TEST_REPO_ROOT', 'NODE_OPTIONS', 'CI', 'FIREBASE_CLI_DISABLE_USAGE_REPORTING', 'FIREBASE_DEBUG_PATH', 'npm_config_cache', 'npm_config_userconfig')
  $keys += @(Get-ChildItem Env: | Where-Object Name -Match '^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GHA_CREDS_PATH|GOOGLE_CLOUD_QUOTA_PROJECT|FIREBASE_TOKEN|EXPO_TOKEN|EAS_ACCESS_TOKEN|FIRESTORE_EMULATOR_HOST|PUBSUB_EMULATOR_HOST|EVENTARC_EMULATOR|CLOUD_TASKS_EMULATOR_HOST|FIREBASE_STORAGE_EMULATOR_HOST)$|SUPABASE|STRIPE' | ForEach-Object Name)
  foreach ($key in ($keys | Select-Object -Unique)) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
  foreach ($key in $saved.Keys) {
    if ($key -match 'CREDENTIALS|CREDS_PATH|QUOTA_PROJECT|TOKEN|SUPABASE|STRIPE|^(FIRESTORE_EMULATOR_HOST|PUBSUB_EMULATOR_HOST|EVENTARC_EMULATOR|CLOUD_TASKS_EMULATOR_HOST|FIREBASE_STORAGE_EMULATOR_HOST|JDK_JAVA_OPTIONS)$') { [Environment]::SetEnvironmentVariable($key, $null, 'Process') }
  }
  $env:JAVA_HOME = $java
  $env:PATH = "$java\bin;$env:PATH"
  $env:JAVA_TOOL_OPTIONS = '-Djava.io.tmpdir="' + $temporary + '"'
  $env:TEMP = $temporary
  $env:TMP = $temporary
  $env:TMPDIR = $temporary
  $env:XDG_CONFIG_HOME = Join-Path $run 'cli-config'
  $env:CLOUDSDK_CONFIG = Join-Path $run 'empty-gcloud'
  $env:FIREBASE_EMULATORS_PATH = Join-Path $tooling 'emulators'
  $env:GCLOUD_PROJECT = $ProjectId
  $env:GOOGLE_CLOUD_PROJECT = $ProjectId
  $env:GCP_PROJECT = $ProjectId
  $env:DATABASE_URL = 'https://demo-koino-default-rtdb.firebaseio.com'
  $env:FIREBASE_CONFIG = '{"projectId":"demo-koino","databaseURL":"https://demo-koino-default-rtdb.firebaseio.com"}'
  $env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19001'
  $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099'
  $env:FIREBASE_FUNCTIONS_EMULATOR_HOST = '127.0.0.1:15001'
  $env:FIREBASE_EMULATOR_HUB = '127.0.0.1:14400'
  $env:FUNCTIONS_EMULATOR = 'true'
  $env:KOINO_EMULATOR_TEST_MODE = '1'
  $env:KOINO_ADMISSION_TEST_MODE = '1'
  $env:KOINO_ACCEPTANCE_SUITE = $Suite
  $env:KOINO_ADMISSION_TEST_STATE_DIR = $proof
  $env:KOINO_ADMISSION_TEST_RUN_DIR = $run
  $env:KOINO_ADMISSION_TEST_REPO_ROOT = $repository
  $env:NODE_OPTIONS = '--require="' + $preload.Replace('\', '/') + '"'
  $env:FIREBASE_DEBUG_PATH = Join-Path $run 'firebase-debug.log'
  $env:FIREBASE_CLI_DISABLE_USAGE_REPORTING = 'true'
  $env:CI = 'true'
  $env:npm_config_cache = Join-Path $run 'npm-cache'
  $env:npm_config_userconfig = Join-Path $run '.npmrc'
  New-Item -ItemType Directory -Path (Join-Path $env:XDG_CONFIG_HOME 'configstore'), $env:CLOUDSDK_CONFIG -Force | Out-Null
  [IO.File]::WriteAllText((Join-Path $env:XDG_CONFIG_HOME 'configstore/firebase-tools.json'), '{}')
  [IO.File]::WriteAllText($env:npm_config_userconfig, '')

  Push-Location -LiteralPath $run
  $pushed = $true
  # Compile directly into this unique source tree; never rewrite functions/lib
  # or .codex/koino-emulator-device/functions used by the physical phones.
  & $npm --prefix $source run build -- --outDir $compiled
  if ($LASTEXITCODE -ne 0) { throw 'Isolated admission Functions compilation failed.' }
  if (-not (Test-Path -LiteralPath (Join-Path $compiled 'emulator-index.js'))) { throw 'Compiled emulator-only Functions entry point is missing.' }
  $originalPackage = Get-Content -Raw -LiteralPath (Join-Path $source 'package.json') | ConvertFrom-Json
  $package = [ordered]@{ name = 'koino-admission-emulator-only'; private = $true; version = $originalPackage.version; main = 'lib/emulator-index.js'; engines = $originalPackage.engines; dependencies = $originalPackage.dependencies }
  [IO.File]::WriteAllText((Join-Path $functions 'package.json'), ($package | ConvertTo-Json -Depth 12))
  Copy-Item -LiteralPath $preload -Destination (Join-Path $functions 'emulator-node-loopback.cjs')
  [IO.File]::WriteAllText((Join-Path $functions '.env.local'), "KOINO_EMULATOR_TEST_MODE=1`nNODE_OPTIONS=--require=./emulator-node-loopback.cjs`n")
  New-Item -ItemType Junction -Path (Join-Path $functions 'node_modules') -Target (Join-Path $source 'node_modules') | Out-Null

  $services = [ordered]@{}
  foreach ($entry in $ports.GetEnumerator()) { $services[$entry.Key] = [ordered]@{ host = '127.0.0.1'; port = $entry.Value } }
  $services['ui'] = @{ enabled = $false }
  $services['singleProjectMode'] = $true
  Copy-Item -LiteralPath $rules -Destination (Join-Path $run 'firebase.rules.json')
  $firebase = [ordered]@{ database = @{ rules = 'firebase.rules.json' }; functions = @(@{ source = 'functions'; codebase = 'admission-test'; ignore = @('node_modules', '*.local', '.env*') }); emulators = $services }
  [IO.File]::WriteAllText($config, ($firebase | ConvertTo-Json -Depth 12))

  # emulators:exec owns and shuts down only this invocation. Per-run TMP prevents
  # its hub-demo-koino.json locator from colliding with the active phone suite.
  $child = 'node "' + $test + '"'
  $arguments = @($cli, 'emulators:exec', '--config', $config, '--only', $selectedServices, '--project', $ProjectId, '--non-interactive')
  Write-Output "Isolated $Suite run: $run"
  Write-Output 'Loopback only: Auth19099 / Database19001 / Functions15001 / Hub14400 / Logging14500 / Eventarc14999 / Tasks14998. Phone services remain unchanged.'
  $env:KOINO_ADMISSION_TEST_STAGE = 'initial'
  if ($Suite -eq 'Legacy') {
    # Destructive legacy fixture suites own only these disposable alternate
    # Auth/RTDB processes. They never launch or contact the phone Functions.
    & $node @arguments $child
    if ($LASTEXITCODE -ne 0) { throw 'Isolated legacy emulator regression failed.' }
    Write-Output "Legacy emulator regressions passed. Isolated logs retained at $run"
    return
  }
  & $node @arguments --export-on-exit $data $child
  if ($LASTEXITCODE -ne 0) { throw 'Initial real-callable admission test failed; restart was not attempted.' }
  if (-not (Test-Path -LiteralPath (Join-Path $data 'firebase-export-metadata.json'))) {
    # Windows/OneDrive can lock the final rename after a complete Firebase export.
    # Recover only this unique run's completed temporary snapshot, after shutdown.
    $candidates = @(Get-ChildItem -LiteralPath $run -Directory -Filter 'firebase-export-*' | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'firebase-export-metadata.json') })
    if ($candidates.Count -ne 1 -or (Test-Path -LiteralPath $data)) { throw 'Admission export is missing or ambiguous; restart proof cannot proceed.' }
    $candidate = [IO.Path]::GetFullPath($candidates[0].FullName)
    if (-not $candidate.StartsWith($run + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFullPath($data)).StartsWith($run + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Export recovery must stay inside this isolated run.' }
    if (@(Get-Item -LiteralPath $candidate; Get-ChildItem -LiteralPath $candidate -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Where({ $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Export recovery refuses linked files.' }
    $metadata = Get-Content -Raw -LiteralPath (Join-Path $candidate 'firebase-export-metadata.json') | ConvertFrom-Json
    foreach ($service in @('auth','database')) {
      $relative = $metadata.$service.path
      if (-not $relative -or [IO.Path]::IsPathRooted($relative)) { throw 'Incomplete isolated export metadata.' }
      $servicePath = [IO.Path]::GetFullPath((Join-Path $candidate $relative))
      if (-not $servicePath.StartsWith($candidate + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $servicePath -PathType Container)) { throw 'Incomplete isolated export snapshot.' }
    }
    Copy-Item -LiteralPath $candidate -Destination $data -Recurse
    Write-Output 'Recovered the completed isolated export after a Windows final-directory rename failure.'
  }
  $env:KOINO_ADMISSION_TEST_STAGE = 'restart'
  & $node @arguments --import $data $child
  if ($LASTEXITCODE -ne 0) { throw 'Admission restart/import verification failed.' }
  Write-Output "$Suite initial and real emulator restart/import checks passed. Isolated proof/logs retained at $run"
} finally {
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
  if ($pushed) { Pop-Location }
}
