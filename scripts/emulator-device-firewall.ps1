# Shared Windows-only rule checks. Callers validate network inputs before use.
$script:KoinoFirewallName = 'KOINO-demo-koino-device'
$script:KoinoFirewallGroup = 'KOINO Local Emulator Test'

function ConvertTo-KoinoFirewallValues {
  param($Value)
  foreach ($item in @($Value)) { if ($null -ne $item) { ([string]$item).Trim() } }
}
function Test-KoinoFirewallExactSet {
  param($Actual, [string[]]$Expected)
  $items = @(ConvertTo-KoinoFirewallValues $Actual)
  return $items.Count -eq $Expected.Count -and @(Compare-Object @($items | Sort-Object) @($Expected | Sort-Object)).Count -eq 0
}
function Resolve-KoinoEmulatorInterface {
  param([string]$ListenAddress)
  $assignments = @(Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ListenAddress -ErrorAction Stop | Where-Object { [string]$_.IPAddress -eq $ListenAddress })
  if ($assignments.Count -ne 1 -or [string]$assignments[0].AddressState -notin @('Preferred','4')) { throw "ListenAddress $ListenAddress must have exactly one preferred local IPv4 interface assignment." }
  $alias = [string]$assignments[0].InterfaceAlias
  $index = 0
  if ([string]::IsNullOrWhiteSpace($alias) -or $alias -eq 'Any' -or [Management.Automation.WildcardPattern]::ContainsWildcardCharacters($alias) -or $alias.Contains('`') -or -not [int]::TryParse([string]$assignments[0].InterfaceIndex, [ref]$index) -or $index -le 0) { throw 'The resolved interface must have one literal alias and a valid index; wildcard interface binding is forbidden.' }
  return [pscustomobject]@{ InterfaceAlias=$alias; InterfaceIndex=$index }
}
function Get-KoinoEmulatorFirewallRule {
  param([ValidateSet('PersistentStore','ActiveStore')][string]$PolicyStore, [switch]$AllowMissing)
  try {
    $query = @{ Name=$script:KoinoFirewallName; PolicyStore=$PolicyStore; ErrorAction='Stop' }
    if ($PolicyStore -eq 'ActiveStore') { $query.TracePolicyStore = $true }
    $rules = @(Get-NetFirewallRule @query)
  } catch {
    if ($_.CategoryInfo.Category -ne 'ObjectNotFound') { throw }
    $rules = @()
  }
  if ($rules.Count -eq 0 -and $AllowMissing) { return $null }
  if ($rules.Count -ne 1) { throw "$PolicyStore must contain exactly one named KOINO firewall rule; found $($rules.Count)." }
  if ([string]$rules[0].Name -ne $script:KoinoFirewallName -or [string]$rules[0].Group -cne $script:KoinoFirewallGroup) { throw "A different application owns the $PolicyStore firewall rule name; nothing will be changed." }
  if ($PolicyStore -eq 'ActiveStore' -and $rules[0].PolicyStoreSourceType -and [string]$rules[0].PolicyStoreSourceType -notin @('Local','1')) { throw 'The effective KOINO rule is controlled by non-local policy; no policy override will be attempted.' }
  return $rules[0]
}
function Get-KoinoEmulatorFirewallMismatch {
  param($Rule, [string]$ListenAddress, [string[]]$DeviceAddress, $Interface)
  $problems = [Collections.Generic.List[string]]::new()
  if ([string]$Rule.Enabled -notin @('True','1')) { $problems.Add('rule is not enabled') }
  if ([string]$Rule.Direction -notin @('Inbound','1') -or [string]$Rule.Action -notin @('Allow','2')) { $problems.Add('rule must allow inbound traffic') }
  if ([string]$Rule.EdgeTraversalPolicy -notin @('Block','0')) { $problems.Add('edge traversal must be blocked') }
  $addresses = @($Rule | Get-NetFirewallAddressFilter -ErrorAction Stop)
  $ports = @($Rule | Get-NetFirewallPortFilter -ErrorAction Stop)
  $interfaces = @($Rule | Get-NetFirewallInterfaceFilter -ErrorAction Stop)
  if ($addresses.Count -ne 1 -or $ports.Count -ne 1 -or $interfaces.Count -ne 1) { throw 'Expected exactly one address, port and interface filter for the KOINO rule.' }
  # Windows can return a scalar string for a single CIM filter value. Wrap it
  # before indexing/comparing: indexing "100.100.67.44" directly yields "1".
  if (-not (Test-KoinoFirewallExactSet $addresses[0].LocalAddress @($ListenAddress))) { $problems.Add("local address must be exactly $ListenAddress") }
  if (-not (Test-KoinoFirewallExactSet $addresses[0].RemoteAddress $DeviceAddress)) { $problems.Add('remote addresses must be exactly the two selected phones') }
  if ([string]$ports[0].Protocol -notin @('TCP','6')) { $problems.Add('protocol must be TCP (6)') }
  if (-not (Test-KoinoFirewallExactSet $ports[0].LocalPort @('5001','9001','9099'))) { $problems.Add('local TCP ports must be exactly 5001, 9001 and 9099') }
  if (-not (Test-KoinoFirewallExactSet $interfaces[0].InterfaceAlias @($Interface.InterfaceAlias))) { $problems.Add("interface must be exactly '$($Interface.InterfaceAlias)' (index $($Interface.InterfaceIndex)); found '$(@(ConvertTo-KoinoFirewallValues $interfaces[0].InterfaceAlias) -join ', ')'") }
  return $problems.ToArray()
}
function Assert-KoinoEmulatorFirewallProfiles {
  $profiles = @(Get-NetFirewallProfile -ErrorAction Stop)
  if (-not $profiles.Count -or @($profiles | Where-Object { [string]$_.Enabled -notin @('True','1') }).Count) { throw 'Keep Windows Firewall enabled on every profile for device testing.' }
}
function Assert-KoinoEmulatorFirewall {
  param([string]$ListenAddress, [string[]]$DeviceAddress)
  $interface = Resolve-KoinoEmulatorInterface $ListenAddress
  Assert-KoinoEmulatorFirewallProfiles
  foreach ($store in @('PersistentStore','ActiveStore')) {
    $rule = Get-KoinoEmulatorFirewallRule -PolicyStore $store
    $problems = @(Get-KoinoEmulatorFirewallMismatch -Rule $rule -ListenAddress $ListenAddress -DeviceAddress $DeviceAddress -Interface $interface)
    if ($problems.Count) { throw "$store KOINO firewall mismatch: $($problems -join '; '). Run configure-emulator-device-firewall.ps1 to repair the local rule." }
  }
  return [pscustomobject]@{ Name=$script:KoinoFirewallName; InterfaceAlias=$interface.InterfaceAlias; InterfaceIndex=$interface.InterfaceIndex; LocalAddress=$ListenAddress; RemoteAddress=@($DeviceAddress); LocalPort=@('5001','9001','9099'); Protocol='TCP'; VerifiedStores='PersistentStore, ActiveStore' }
}
function Set-KoinoEmulatorFirewall {
  param([string]$ListenAddress, [string[]]$DeviceAddress)
  $interface = Resolve-KoinoEmulatorInterface $ListenAddress
  Assert-KoinoEmulatorFirewallProfiles
  $existing = Get-KoinoEmulatorFirewallRule -PolicyStore PersistentStore -AllowMissing
  $active = Get-KoinoEmulatorFirewallRule -PolicyStore ActiveStore -AllowMissing
  if (-not $existing -and $active) { throw 'An effective KOINO rule exists without a locally owned persistent rule; nothing will be created.' }
  if ($existing -and $active) {
    $localProblems = @(Get-KoinoEmulatorFirewallMismatch $existing $ListenAddress $DeviceAddress $interface)
    $activeProblems = @(Get-KoinoEmulatorFirewallMismatch $active $ListenAddress $DeviceAddress $interface)
    if (-not $localProblems.Count -and -not $activeProblems.Count) { return Assert-KoinoEmulatorFirewall -ListenAddress $ListenAddress -DeviceAddress $DeviceAddress }
  }
  $command = if ($existing) { 'Set-NetFirewallRule' } else { 'New-NetFirewallRule' }
  if (-not (Get-Command $command -ErrorAction Stop).Parameters.ContainsKey('InterfaceAlias')) { throw "$command cannot bind an interface on this Windows installation; refusing an Any-interface fallback." }
  $settings = @{ Name=$script:KoinoFirewallName; PolicyStore='PersistentStore'; Enabled='True'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=@('5001','9001','9099'); LocalAddress=$ListenAddress; RemoteAddress=@($DeviceAddress); InterfaceAlias=$interface.InterfaceAlias; Profile='Any'; EdgeTraversalPolicy='Block'; ErrorAction='Stop' }
  if ($existing) {
    # Update this exact owned rule in place; never select a whole group or
    # remove a working rule before a replacement can be created.
    Set-NetFirewallRule @settings | Out-Null
  } else {
    $settings.DisplayName = 'KOINO demo emulators - two phones only'
    $settings.Group = $script:KoinoFirewallGroup
    New-NetFirewallRule @settings | Out-Null
  }
  return Assert-KoinoEmulatorFirewall -ListenAddress $ListenAddress -DeviceAddress $DeviceAddress
}
function Remove-KoinoEmulatorFirewall {
  $rule = Get-KoinoEmulatorFirewallRule -PolicyStore PersistentStore -AllowMissing
  if ($rule) { Remove-NetFirewallRule -Name $script:KoinoFirewallName -PolicyStore PersistentStore -ErrorAction Stop }
}
