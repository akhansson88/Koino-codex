param(
  [ValidateSet('Loopback', 'Tailscale', 'Lan')][string]$Network = 'Loopback',
  [string]$ListenAddress = '127.0.0.1',
  [string[]]$DeviceAddress = @(),
  [ValidateSet('demo-koino')][string]$ProjectId = 'demo-koino',
  [switch]$SmokeTest,
  [switch]$VerifyPersistence,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $root
$saved = @{}
$relay = $null
try {
  if ($VerifyPersistence -and -not $SmokeTest) { throw 'VerifyPersistence requires SmokeTest and never imports phone-session data.' }
  if ($SmokeTest -and $Network -ne 'Loopback') { throw 'Destructive validation cannot run against an exposed phone session.' }
  foreach ($name in @('GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GCP_PROJECT')) {
    $value = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($value -and $value -ne 'demo-koino') { throw "Refusing inherited non-demo $name. Use a clean PowerShell session." }
  }
  foreach ($entry in @{FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9001';FIREBASE_FUNCTIONS_EMULATOR_HOST='127.0.0.1:5001'}.GetEnumerator()) {
    $inherited = [Environment]::GetEnvironmentVariable($entry.Key,'Process')
    if ($inherited -and $inherited -ne $entry.Value) { throw "Refusing inherited non-loopback $($entry.Key)." }
  }
  if ($env:DATABASE_URL -and $env:DATABASE_URL -ne 'https://demo-koino-default-rtdb.firebaseio.com') { throw 'Refusing inherited production database endpoint.' }
  $inheritedConfig = [Environment]::GetEnvironmentVariable('FIREBASE_CONFIG','Process')
  if ($inheritedConfig) {
    $selected = $inheritedConfig | ConvertFrom-Json
    if ($selected.projectId -ne 'demo-koino' -or $selected.databaseURL -ne 'https://demo-koino-default-rtdb.firebaseio.com') { throw 'Refusing inherited production Firebase configuration.' }
  }
  $config = Get-Content -Raw -LiteralPath 'firebase.emulator-device.json' | ConvertFrom-Json
  $expectedPorts = @{ auth=9099; database=9001; functions=5001; hub=4400; logging=4500 }
  foreach ($entry in $expectedPorts.GetEnumerator()) {
    $service = $config.emulators.($entry.Key)
    if ($service.host -ne '127.0.0.1' -or $service.port -ne $entry.Value) { throw 'Every emulator must bind to its fixed loopback endpoint.' }
  }
  if (@($config.functions).Count -ne 1 -or $config.emulators.ui.enabled -ne $false -or $config.functions[0].source -ne '.codex/koino-emulator-device/functions' -or $config.database.rules -ne 'firebase.rules.json') { throw 'Unexpected emulator source, rules or UI configuration.' }
  $networkJson = @{network=$Network;listenAddress=$ListenAddress;deviceAddresses=@($DeviceAddress)} | ConvertTo-Json -Compress
  $validator = Join-Path $PSScriptRoot 'validate-emulator-network-input.mjs'
  $networkJson | & node $validator
  if ($LASTEXITCODE -ne 0) { throw 'Invalid private network configuration.' }
  if ($Network -ne 'Loopback') {
    # Do not mutate firewall policy here. Resolve and verify the same exact
    # interface/filter constraints used by the explicit configuration script.
    . (Join-Path $PSScriptRoot 'emulator-device-firewall.ps1')
    $verifiedFirewall = Assert-KoinoEmulatorFirewall -ListenAddress $ListenAddress -DeviceAddress $DeviceAddress
    Write-Output "Verified KOINO firewall on '$($verifiedFirewall.InterfaceAlias)' (index $($verifiedFirewall.InterfaceIndex))."
  }
  $tooling = Join-Path $root '.npm-cache/koino-validation'
  $java = Get-ChildItem -LiteralPath (Join-Path $tooling 'java') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  $cli = Join-Path $tooling 'firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js'
  if (-not $java -or -not (Test-Path -LiteralPath $cli)) { throw 'Workspace-local Java21/Firebase CLI15.34.1 tooling is missing; see docs/emulator-device-testing.md.' }
  if ($CheckOnly) { Write-Output 'Validated: demo-koino, fixed loopback services, isolated source and explicit private peer restrictions.'; return }
  $state = Join-Path $root '.codex/koino-emulator-device'
  New-Item -ItemType Directory -Path $state -Force | Out-Null
  # Scrub credentials only from this process and its children. Restore them on exit.
  $keys = @('JAVA_HOME','PATH','XDG_CONFIG_HOME','CLOUDSDK_CONFIG','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','DATABASE_URL','FIREBASE_CONFIG','FIREBASE_EMULATORS_PATH','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_FUNCTIONS_EMULATOR_HOST','FUNCTIONS_EMULATOR','KOINO_EMULATOR_TEST_MODE','NODE_OPTIONS','CI','FIREBASE_CLI_DISABLE_USAGE_REPORTING')
  $keys += @(Get-ChildItem Env: | Where-Object Name -Match '^(GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GHA_CREDS_PATH|GOOGLE_CLOUD_QUOTA_PROJECT|FIREBASE_TOKEN|EXPO_TOKEN|EAS_ACCESS_TOKEN)$|SUPABASE|STRIPE' | ForEach-Object Name)
  foreach ($key in ($keys | Select-Object -Unique)) { $saved[$key] = [Environment]::GetEnvironmentVariable($key,'Process') }
  foreach ($key in $saved.Keys) { if ($key -match 'CREDENTIALS|CREDS_PATH|QUOTA_PROJECT|TOKEN|SUPABASE|STRIPE') { [Environment]::SetEnvironmentVariable($key,$null,'Process') } }
  $env:JAVA_HOME = $java.FullName
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
  $env:XDG_CONFIG_HOME = Join-Path $state 'cli-config'
  $env:CLOUDSDK_CONFIG = Join-Path $state 'empty-gcloud'
  $env:FIREBASE_EMULATORS_PATH = Join-Path $tooling 'emulators'
  $env:GCLOUD_PROJECT = 'demo-koino'
  $env:GOOGLE_CLOUD_PROJECT = 'demo-koino'
  $env:DATABASE_URL = 'https://demo-koino-default-rtdb.firebaseio.com'
  $env:FIREBASE_CONFIG = '{"projectId":"demo-koino","databaseURL":"https://demo-koino-default-rtdb.firebaseio.com"}'
  $env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9001'
  $env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  $env:FIREBASE_FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001'
  $env:FUNCTIONS_EMULATOR = 'true'
  $env:KOINO_EMULATOR_TEST_MODE = '1'
  $preload = (Join-Path $root 'scripts/emulator-node-loopback.cjs').Replace('\','/')
  $env:NODE_OPTIONS = '--require="' + $preload + '"'
  $env:FIREBASE_CLI_DISABLE_USAGE_REPORTING = 'true'
  $env:CI = 'true'
  # An isolated empty CLI login store prevents use of cached Firebase accounts.
  New-Item -ItemType Directory -Path (Join-Path $env:XDG_CONFIG_HOME 'configstore'),$env:CLOUDSDK_CONFIG -Force | Out-Null
  $loginStore = Join-Path $env:XDG_CONFIG_HOME 'configstore/firebase-tools.json'
  [System.IO.File]::WriteAllText($loginStore, '{}')
  & npm --prefix functions run build
  if ($LASTEXITCODE -ne 0) { throw 'Functions TypeScript build failed.' }
  & node scripts/prepare-emulator-device.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Safe emulator source preparation failed.' }
  $sourceEnv = @(Get-ChildItem -Force -LiteralPath (Join-Path $state 'functions') | Where-Object Name -Match '^\.env|^\.secret')
  if ($sourceEnv.Count -ne 1 -or $sourceEnv[0].Name -ne '.env.local' -or (Get-Content -Raw -LiteralPath $sourceEnv[0].FullName).Replace("`r",'').Trim() -ne "KOINO_EMULATOR_TEST_MODE=1`nNODE_OPTIONS=--require=./emulator-node-loopback.cjs") { throw 'Emulator source may contain only its generated non-secret mode/preload flags.' }
  if ($SmokeTest) {
    $smokeArgs = @($cli,'emulators:exec','--config','firebase.emulator-device.json','--only','auth,database,functions','--project','demo-koino','--non-interactive')
    if ($VerifyPersistence) { $smokeArgs += @('--export-on-exit',(Join-Path $state 'smoke-export')) }
    $smokeArgs += 'node scripts/run-emulator-device-smoke.mjs'
    & node @smokeArgs
    if ($LASTEXITCODE -ne 0) { throw 'Signed callable smoke failed.' }
    if ($VerifyPersistence) {
      & node $cli emulators:exec --config firebase.emulator-device.json --only auth,database,functions --project demo-koino --non-interactive --import (Join-Path $state 'smoke-export') 'node scripts/validate-emulator-device-restart.mjs'
    }
  } else {
    $relayArgs = @(('"' + (Join-Path $root 'scripts/emulator-device-relay.mjs') + '"'),'--network',$Network,'--listen',$ListenAddress,'--parent',"$PID")
    foreach ($device in $DeviceAddress) { $relayArgs += @('--device',$device) }
    $relay = Start-Process -FilePath (Get-Command node).Source -ArgumentList $relayArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $state 'relay.log') -RedirectStandardError (Join-Path $state 'relay-error.log')
    $export = Join-Path $state 'data'
    $arguments = @($cli,'emulators:start','--config','firebase.emulator-device.json','--only','auth,database,functions','--project','demo-koino','--export-on-exit',$export)
    if (Test-Path -LiteralPath (Join-Path $export 'firebase-export-metadata.json')) { $arguments += @('--import',$export) }
    Write-Output "demo-koino only. Network=$Network. Phones=$($DeviceAddress -join ','). Stop with Ctrl+C and wait for export. No Metro or public tunnel required."
    & node @arguments
  }
  if ($LASTEXITCODE -ne 0) { throw "Emulator session failed (exit $LASTEXITCODE)." }
} finally {
  if ($relay -and -not $relay.HasExited) { Stop-Process -Id $relay.Id -ErrorAction SilentlyContinue }
  foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key],'Process') }
  Pop-Location
}
