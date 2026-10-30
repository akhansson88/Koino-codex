# Safe in-memory tests only. Every Windows network/firewall cmdlet used by the
# shared helper is shadowed; no real firewall policy or listener is accessed.
$ErrorActionPreference = 'Stop'
$script:passed = 0
function New-TestRule {
  [pscustomobject]@{ Name='KOINO-demo-koino-device'; Group='KOINO Local Emulator Test'; Enabled='True'; Direction='Inbound'; Action='Allow'; EdgeTraversalPolicy='Block'; LocalAddress='100.100.67.44'; RemoteAddress=@('100.108.62.79','100.102.137.47'); LocalPort=@('5001','9001','9099'); Protocol='TCP'; InterfaceAlias='Tailscale'; PolicyStoreSourceType='Local' }
}
function Reset-Fixture {
  $global:KoinoFirewallMock = @{ PersistentStore=@(New-TestRule); ActiveStore=@(New-TestRule); IPs=@([pscustomobject]@{IPAddress='100.100.67.44';InterfaceAlias='Tailscale';InterfaceIndex=41;AddressState='Preferred'}); Reads=0; New=0; Set=0; Remove=0; Enabled=$true; Denied=$false; MissingFilter=$false; LastSettings=$null }
}
function Assert-True { param([bool]$Condition,[string]$Message) if (-not $Condition) { throw $Message } }
function Assert-Throws { param([scriptblock]$Body,[string]$Pattern) try { & $Body | Out-Null } catch { if ($_.Exception.Message -notmatch $Pattern) { throw }; return }; throw "Expected failure: $Pattern" }
function Invoke-Case { param([string]$Name,[scriptblock]$Body) Reset-Fixture; & $Body; $script:passed++; Write-Output "PASS $Name" }
function Get-NetIPAddress {
  [CmdletBinding()]param($AddressFamily,$IPAddress)
  $global:KoinoFirewallMock.Reads++
  $global:KoinoFirewallMock.IPs | Where-Object IPAddress -EQ $IPAddress
}
function Get-NetFirewallRule {
  [CmdletBinding()]param($Name,$PolicyStore,[switch]$TracePolicyStore)
  $global:KoinoFirewallMock.Reads++
  Assert-True ($Name -eq 'KOINO-demo-koino-device') 'Unexpected rule selector'
  if ($global:KoinoFirewallMock.Denied) { throw [UnauthorizedAccessException]::new('Mock access denied') }
  $global:KoinoFirewallMock[$PolicyStore]
}
function Get-NetFirewallAddressFilter {
  [CmdletBinding()]param([Parameter(ValueFromPipeline)]$InputObject)
  process { $global:KoinoFirewallMock.Reads++; [pscustomobject]@{ LocalAddress=$InputObject.LocalAddress; RemoteAddress=$InputObject.RemoteAddress } }
}
function Get-NetFirewallPortFilter {
  [CmdletBinding()]param([Parameter(ValueFromPipeline)]$InputObject)
  process { $global:KoinoFirewallMock.Reads++; [pscustomobject]@{ LocalPort=$InputObject.LocalPort; Protocol=$InputObject.Protocol } }
}
function Get-NetFirewallInterfaceFilter {
  [CmdletBinding()]param([Parameter(ValueFromPipeline)]$InputObject)
  process { $global:KoinoFirewallMock.Reads++; if (-not $global:KoinoFirewallMock.MissingFilter) { [pscustomobject]@{InterfaceAlias=$InputObject.InterfaceAlias} } }
}
function Get-NetFirewallProfile {
  [CmdletBinding()]param()
  $global:KoinoFirewallMock.Reads++
  foreach ($name in 'Domain','Private','Public') { [pscustomobject]@{Name=$name;Enabled=$global:KoinoFirewallMock.Enabled} }
}
function Set-TestSettings {
  param($Settings)
  foreach ($store in @('PersistentStore','ActiveStore')) {
    $rule = New-TestRule
    foreach ($name in @('Name','Enabled','Direction','Action','EdgeTraversalPolicy','LocalAddress','RemoteAddress','LocalPort','Protocol','InterfaceAlias')) { $rule.$name = $Settings[$name] }
    if ($Settings.ContainsKey('Group')) { $rule.Group = $Settings.Group }
    $global:KoinoFirewallMock[$store] = @($rule)
  }
  $global:KoinoFirewallMock.LastSettings = $Settings
}
function New-NetFirewallRule {
  [CmdletBinding()]param($Name,$DisplayName,$Group,$PolicyStore,$Enabled,$Direction,$Action,$Protocol,$LocalPort,$LocalAddress,$RemoteAddress,$InterfaceAlias,$Profile,$EdgeTraversalPolicy)
  Assert-True ($PolicyStore -eq 'PersistentStore' -and $Name -eq 'KOINO-demo-koino-device') 'Unsafe create selector'
  Assert-True (-not $global:KoinoFirewallMock.PersistentStore.Count) 'Duplicate create'
  $global:KoinoFirewallMock.New++; Set-TestSettings $PSBoundParameters
}
function Set-NetFirewallRule {
  [CmdletBinding()]param($Name,$PolicyStore,$Enabled,$Direction,$Action,$Protocol,$LocalPort,$LocalAddress,$RemoteAddress,$InterfaceAlias,$Profile,$EdgeTraversalPolicy)
  Assert-True ($PolicyStore -eq 'PersistentStore' -and $Name -eq 'KOINO-demo-koino-device') 'Unsafe update selector'
  $global:KoinoFirewallMock.Set++; Set-TestSettings $PSBoundParameters
}
function Remove-NetFirewallRule {
  [CmdletBinding()]param($Name,$PolicyStore)
  Assert-True ($PolicyStore -eq 'PersistentStore' -and $Name -eq 'KOINO-demo-koino-device') 'Unsafe removal selector'
  $global:KoinoFirewallMock.Remove++; $global:KoinoFirewallMock.PersistentStore=@(); $global:KoinoFirewallMock.ActiveStore=@()
}
. (Join-Path $PSScriptRoot 'emulator-device-firewall.ps1')
$target = @{ListenAddress='100.100.67.44';DeviceAddress=@('100.108.62.79','100.102.137.47')}
Invoke-Case 'scalar LocalAddress regression and exact Tailscale interface' {
  Assert-True ($global:KoinoFirewallMock.PersistentStore[0].LocalAddress[0] -eq '1') 'Old bug fixture must be a scalar string'
  $result = Assert-KoinoEmulatorFirewall @target
  Assert-True ($result.InterfaceAlias -eq 'Tailscale' -and $result.InterfaceIndex -eq 41) 'Resolved interface changed'
}
Invoke-Case 'one-element arrays and numeric TCP are equivalent' {
  foreach ($store in @('PersistentStore','ActiveStore')) { $rule=$global:KoinoFirewallMock[$store][0]; $rule.LocalAddress=@('100.100.67.44'); $rule.InterfaceAlias=@('Tailscale'); $rule.Protocol=6; $rule.RemoteAddress=@('100.102.137.47','100.108.62.79'); $rule.LocalPort=@('9099','5001','9001') }
  Assert-KoinoEmulatorFirewall @target | Out-Null
  $global:KoinoFirewallMock.ActiveStore[0].Protocol='6'
  Assert-KoinoEmulatorFirewall @target | Out-Null
}
Invoke-Case 'Any interface is rejected independently of matching IPs and ports' {
  $global:KoinoFirewallMock.PersistentStore[0].InterfaceAlias='Any'
  Assert-Throws { Assert-KoinoEmulatorFirewall @target } "interface must be exactly 'Tailscale'.*found 'Any'"
}
Invoke-Case 'repair Any in place and repeated execution is a no-op' {
  foreach ($store in @('PersistentStore','ActiveStore')) { $global:KoinoFirewallMock[$store][0].InterfaceAlias='Any' }
  Set-KoinoEmulatorFirewall @target | Out-Null
  Set-KoinoEmulatorFirewall @target | Out-Null
  Assert-True ($global:KoinoFirewallMock.Set -eq 1 -and $global:KoinoFirewallMock.New -eq 0 -and $global:KoinoFirewallMock.Remove -eq 0) 'Repair duplicated or replaced the rule'
  Assert-True ($global:KoinoFirewallMock.LastSettings.InterfaceAlias -eq 'Tailscale' -and $global:KoinoFirewallMock.LastSettings.LocalAddress -eq $target.ListenAddress) 'Repair did not retain exact host/interface'
  Assert-True ((@($global:KoinoFirewallMock.LastSettings.RemoteAddress).Count -eq 2) -and (@($global:KoinoFirewallMock.LastSettings.LocalPort).Count -eq 3)) 'Repair widened peers or ports'
}
Invoke-Case 'fresh create is interface-bound and idempotent' {
  $global:KoinoFirewallMock.PersistentStore=@();$global:KoinoFirewallMock.ActiveStore=@()
  Set-KoinoEmulatorFirewall @target | Out-Null
  Set-KoinoEmulatorFirewall @target | Out-Null
  Assert-True ($global:KoinoFirewallMock.New -eq 1 -and $global:KoinoFirewallMock.Set -eq 0 -and $global:KoinoFirewallMock.PersistentStore.Count -eq 1) 'Fresh create duplicated'
}
foreach ($change in @(
  @{Field='LocalAddress';Value=@('100.100.67.44','100.100.67.45');Pattern='local address'},
  @{Field='RemoteAddress';Value=@('100.108.62.79','100.102.137.47','100.100.1.1');Pattern='remote addresses'},
  @{Field='RemoteAddress';Value=@('100.108.62.79');Pattern='remote addresses'},
  @{Field='LocalPort';Value='5001-9099';Pattern='local TCP ports'},
  @{Field='LocalPort';Value=@('5001','9001','9099','8081');Pattern='local TCP ports'},
  @{Field='Protocol';Value='UDP';Pattern='protocol'},
  @{Field='Protocol';Value=17;Pattern='protocol'},
  @{Field='InterfaceAlias';Value=@('Tailscale','WiFi');Pattern='interface'},
  @{Field='InterfaceAlias';Value='Tail*';Pattern='interface'},
  @{Field='Enabled';Value='False';Pattern='not enabled'},
  @{Field='Direction';Value='Outbound';Pattern='inbound'},
  @{Field='Action';Value='Block';Pattern='inbound'},
  @{Field='EdgeTraversalPolicy';Value='Allow';Pattern='edge traversal'}
)) {
  Invoke-Case "reject mismatched $($change.Field): $($change.Pattern)" {
    $global:KoinoFirewallMock.ActiveStore[0].($change.Field)=$change.Value
    Assert-Throws { Assert-KoinoEmulatorFirewall @target } $change.Pattern
  }
}
Invoke-Case 'ambiguous IP assignments are refused before mutation' {
  $global:KoinoFirewallMock.IPs += [pscustomobject]@{IPAddress='100.100.67.44';InterfaceAlias='Other';InterfaceIndex=42;AddressState='Preferred'}
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'exactly one preferred'
  Assert-True ($global:KoinoFirewallMock.New + $global:KoinoFirewallMock.Set -eq 0) 'Ambiguous address was mutated'
}
Invoke-Case 'missing or nonpreferred IP assignments are refused' {
  $global:KoinoFirewallMock.IPs[0].AddressState='Deprecated'
  Assert-Throws { Assert-KoinoEmulatorFirewall @target } 'preferred'
  $global:KoinoFirewallMock.IPs=@()
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'preferred'
}
Invoke-Case 'numeric preferred state is accepted' {
  $global:KoinoFirewallMock.IPs[0].AddressState=4
  Assert-KoinoEmulatorFirewall @target | Out-Null
}
Invoke-Case 'resolved wildcard aliases are never applied' {
  $global:KoinoFirewallMock.IPs[0].InterfaceAlias='Tail*'
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'wildcard'
}
Invoke-Case 'foreign ownership and duplicate rule names are refused' {
  $global:KoinoFirewallMock.PersistentStore[0].Group='Someone else'
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'different application'
  Reset-Fixture
  $global:KoinoFirewallMock.PersistentStore += New-TestRule
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'exactly one named'
}
Invoke-Case 'effective policy mismatch/override cannot pass verification' {
  $global:KoinoFirewallMock.ActiveStore[0].PolicyStoreSourceType='GroupPolicy'
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'non-local policy'
}
Invoke-Case 'missing interface filters and disabled profiles fail closed' {
  $global:KoinoFirewallMock.MissingFilter=$true
  Assert-Throws { Assert-KoinoEmulatorFirewall @target } 'exactly one address, port and interface'
  $global:KoinoFirewallMock.MissingFilter=$false;$global:KoinoFirewallMock.Enabled=$false
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'Firewall enabled'
}
Invoke-Case 'access failures cannot become a create attempt' {
  $global:KoinoFirewallMock.Denied=$true
  Assert-Throws { Set-KoinoEmulatorFirewall @target } 'access denied'
  Assert-True ($global:KoinoFirewallMock.New -eq 0) 'Read denial attempted a duplicate create'
}
Invoke-Case 'Remove is narrowly scoped and idempotent without a connected interface' {
  $global:KoinoFirewallMock.IPs=@()
  Remove-KoinoEmulatorFirewall
  Remove-KoinoEmulatorFirewall
  Assert-True ($global:KoinoFirewallMock.Remove -eq 1 -and $global:KoinoFirewallMock.New -eq 0) 'Removal did not target one existing local rule'
}
Invoke-Case 'Remove refuses foreign ownership' {
  $global:KoinoFirewallMock.PersistentStore[0].Group='Foreign'
  Assert-Throws { Remove-KoinoEmulatorFirewall } 'different application'
  Assert-True ($global:KoinoFirewallMock.Remove -eq 0) 'Foreign rule removed'
}
Invoke-Case 'ValidateOnly touches no network/firewall metadata or mutation' {
  & (Join-Path $PSScriptRoot 'configure-emulator-device-firewall.ps1') -Network Tailscale @target -ValidateOnly | Out-Null
  Assert-True ($global:KoinoFirewallMock.Reads -eq 0 -and $global:KoinoFirewallMock.New + $global:KoinoFirewallMock.Set + $global:KoinoFirewallMock.Remove -eq 0) 'ValidateOnly touched firewall'
}
Invoke-Case 'VerifyOnly uses mocked current interface and never mutates' {
  & (Join-Path $PSScriptRoot 'configure-emulator-device-firewall.ps1') -Network Tailscale @target -VerifyOnly | Out-Null
  Assert-True ($global:KoinoFirewallMock.Reads -gt 0 -and $global:KoinoFirewallMock.New + $global:KoinoFirewallMock.Set + $global:KoinoFirewallMock.Remove -eq 0) 'VerifyOnly mutated firewall'
  $global:KoinoFirewallMock.PersistentStore[0].InterfaceAlias='Any'
  Assert-Throws { & (Join-Path $PSScriptRoot 'configure-emulator-device-firewall.ps1') -Network Tailscale @target -VerifyOnly } 'interface must be exactly'
}
Invoke-Case 'actual startup CheckOnly accepts scalar Tailscale and rejects Any' {
  $savedEnvironment = @{}
  foreach ($key in @('GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','GCP_PROJECT','DATABASE_URL','FIREBASE_CONFIG','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_FUNCTIONS_EMULATOR_HOST')) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
    [Environment]::SetEnvironmentVariable($key,$null,'Process')
  }
  try {
    & (Join-Path $PSScriptRoot 'start-emulator-devices.ps1') -Network Tailscale @target -CheckOnly | Out-Null
    $global:KoinoFirewallMock.PersistentStore[0].InterfaceAlias='Any'
    Assert-Throws { & (Join-Path $PSScriptRoot 'start-emulator-devices.ps1') -Network Tailscale @target -CheckOnly } 'interface must be exactly'
    Assert-True ($global:KoinoFirewallMock.New + $global:KoinoFirewallMock.Set + $global:KoinoFirewallMock.Remove -eq 0) 'Startup verification mutated firewall'
  } finally { foreach ($key in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($key,$savedEnvironment[$key],'Process') } }
}
Invoke-Case 'mode conflicts stop before metadata and mutation' {
  Assert-Throws { & (Join-Path $PSScriptRoot 'configure-emulator-device-firewall.ps1') -Network Tailscale @target -ValidateOnly -VerifyOnly } 'cannot be combined'
  Assert-Throws { & (Join-Path $PSScriptRoot 'configure-emulator-device-firewall.ps1') -ValidateOnly -Remove } 'cannot be combined'
  Assert-True ($global:KoinoFirewallMock.Reads -eq 0) 'Invalid mode read firewall'
}
Write-Output "Mocked firewall regressions passed: $script:passed cases; no actual firewall/network changes or listeners."
