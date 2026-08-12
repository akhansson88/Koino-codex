$ErrorActionPreference = "Stop"
$Mode = if ($args.Count -gt 0) { $args[0] } else { "start" }
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

function Show-Usage {
  Write-Host "usage: powershell -ExecutionPolicy Bypass -File ./script/build_and_run.ps1 [mode]"
  Write-Host ""
  Write-Host "Modes:"
  Write-Host "  start, run          Start the Expo dev server for Expo Go"
  Write-Host "  --lan, lan          Start Expo using LAN transport"
  Write-Host "  --localhost         Start Expo using localhost transport"
  Write-Host "  --tunnel, tunnel    Start Expo using tunnel transport"
  Write-Host "  --ios, ios          Start Expo and open iOS"
  Write-Host "  --android, android  Start Expo and open Android"
  Write-Host "  --web, web          Start Expo for web"
  Write-Host "  --doctor, doctor    Run Expo diagnostics"
  Write-Host "  --help, help        Show this help"
}

function Ensure-GeneratedBibleData {
  & node (Join-Path $RootDir "scripts\generate-bible-data.mjs")
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Invoke-Expo {
  param([string[]]$ExpoArgs)

  Ensure-GeneratedBibleData

  if ($env:EXPO_CLI) {
    $parts = $env:EXPO_CLI -split " "
    if ($parts.Length -gt 1) {
      & $parts[0] $parts[1..($parts.Length - 1)] @ExpoArgs
    } else {
      & $parts[0] @ExpoArgs
    }
    exit $LASTEXITCODE
  }

  & npx expo @ExpoArgs
  exit $LASTEXITCODE
}

switch ($Mode) {
  { $_ -in @("--lan", "lan") } {
    Invoke-Expo @("start", "--lan")
  }
  { $_ -in @("start", "run") } {
    Invoke-Expo @("start", "--tunnel", "--clear")
  }
  { $_ -in @("--localhost", "localhost") } {
    Invoke-Expo @("start", "--localhost")
  }
  { $_ -in @("--tunnel", "tunnel") } {
    Invoke-Expo @("start", "--tunnel", "--clear")
  }
  { $_ -in @("--ios", "ios") } {
    Invoke-Expo @("start", "--ios")
  }
  { $_ -in @("--android", "android") } {
    Invoke-Expo @("start", "--android")
  }
  { $_ -in @("--web", "web") } {
    Invoke-Expo @("start", "--web")
  }
  { $_ -in @("--doctor", "doctor") } {
    & npx expo-doctor
    exit $LASTEXITCODE
  }
  { $_ -in @("--help", "help") } {
    Show-Usage
  }
  default {
    Show-Usage
    exit 2
  }
}
