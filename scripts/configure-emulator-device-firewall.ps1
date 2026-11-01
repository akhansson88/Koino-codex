# Explicit opt-in system change. -ValidateOnly needs no Administrator privileges.
param(
  [ValidateSet('Tailscale','Lan')][string]$Network,
  [string]$ListenAddress,
  [string[]]$DeviceAddress = @(),
  [switch]$Remove,
  [switch]$ValidateOnly,
  [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
if ($Remove -and $ValidateOnly) { throw 'ValidateOnly cannot be combined with Remove.' }
if ($VerifyOnly -and ($Remove -or $ValidateOnly)) { throw 'VerifyOnly cannot be combined with Remove or ValidateOnly.' }
if (-not $Remove) {
  $json = @{network=$Network;listenAddress=$ListenAddress;deviceAddresses=@($DeviceAddress)} | ConvertTo-Json -Compress
  $validator = Join-Path $PSScriptRoot 'validate-emulator-network-input.mjs'
  $json | & node $validator
  if ($LASTEXITCODE -ne 0) { throw 'Refusing a non-private host or broad peer allowance.' }
  if ($ValidateOnly) {
    Write-Output 'Validation only: input accepted; Windows Firewall was not read or changed. Interface ownership is checked when applying the rule.'
    return
  }
}
# Shared read-only checks are also used by the emulator launcher.
. (Join-Path $PSScriptRoot 'emulator-device-firewall.ps1')
if ($VerifyOnly) {
  Assert-KoinoEmulatorFirewall -ListenAddress $ListenAddress -DeviceAddress $DeviceAddress | Format-List
  return
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Open an Administrator PowerShell for this explicit firewall change.' }
if ($Remove) { Remove-KoinoEmulatorFirewall; return }
Set-KoinoEmulatorFirewall -ListenAddress $ListenAddress -DeviceAddress $DeviceAddress | Format-List
Write-Output 'Verified one interface-bound KOINO rule for exactly this private host, two phones and three TCP ports. No public forwarding was configured.'
