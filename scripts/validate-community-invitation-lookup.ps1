[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repository = Split-Path -Parent $PSScriptRoot
$document = Get-Content -Raw -LiteralPath (Join-Path $repository 'docs/community-admission-diagnosis.md')
$section = $document.IndexOf('### Next read-only check; no rebuild or restart', [StringComparison]::Ordinal)
if ($section -lt 0) { throw 'Published invitation lookup section is missing.' }
$match = [regex]::Match($document.Substring($section), '(?s)```powershell\r?\n(?<code>.*?)\r?\n```')
if (-not $match.Success) { throw 'Published invitation lookup command is missing.' }
$lookup = [scriptblock]::Create($match.Groups['code'].Value)

# Execute the actual documented command with synthetic, masked inputs and
# mocked HTTP. Never use emulator accounts, data, listeners or real requests.
$cases = @(
  @{ Name = 'valid-record'; Body = '{"groupId":"fixture-group"}'; Expected = @('FOUND','FOUND') },
  @{ Name = 'json-null'; Body = 'null'; Expected = @('ABSENT','ABSENT') },
  @{ Name = 'whitespace-json-null'; Body = " `r`nnull `t"; Expected = @('ABSENT','ABSENT') },
  @{ Name = 'literal-null-string'; Body = '"null"'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'missing-reference'; Body = '{}'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'blank-reference'; Body = '{"groupId":" "}'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'invalid-reference-type'; Body = '{"groupId":123}'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'empty-array'; Body = '[]'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'single-record-array'; Body = '[{"groupId":"fixture-group"}]'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'boolean'; Body = 'false'; Expected = @('INVALID_RESPONSE','INVALID_RESPONSE') },
  @{ Name = 'invalid-json'; Body = '{'; Expected = @('READ_FAILED','READ_FAILED') },
  @{ Name = 'request-failure'; ThrowRequest = $true; Expected = @('READ_FAILED','READ_FAILED') },
  @{ Name = 'invalid-input'; Input = 'bad!'; Expected = @('FORMAT_INVALID','FORMAT_INVALID') },
  @{ Name = 'valid-then-null'; Bodies = @('{"groupId":"fixture-group"}','null'); Expected = @('FOUND','ABSENT') }
)
$checks = 0
foreach ($fixture in $cases) {
  $rows = @(& {
    param($lookupBlock, $testFixture)
    $script:lookupTestRequests = 0
    function Read-Host {
      param([string]$Prompt, [switch]$AsSecureString)
      if (-not $AsSecureString) { throw 'The documented prompt must mask input.' }
      $value = if ($testFixture.ContainsKey('Input')) { $testFixture.Input } else { 'TESTAB' }
      return (ConvertTo-SecureString -String $value -AsPlainText -Force)
    }
    function Invoke-RestMethod { throw 'Implicit JSON conversion is forbidden in this diagnostic.' }
    function Invoke-WebRequest {
      param([switch]$UseBasicParsing, [string]$Method, [string]$Uri, $Headers, [int]$TimeoutSec, $ErrorAction)
      if (-not $UseBasicParsing -or $Method -ne 'Get' -or $Uri -notmatch '^http://127\.0\.0\.1:9001/encryptedData/inviteCodes/[A-Z0-9]{6}\.json\?ns=demo-koino-default-rtdb$') {
        throw 'Unexpected diagnostic request.'
      }
      $requestIndex = $script:lookupTestRequests
      $script:lookupTestRequests = $script:lookupTestRequests + 1
      if ($testFixture.ThrowRequest) { throw 'Synthetic request failure.' }
      $content = if ($testFixture.ContainsKey('Bodies')) { $testFixture.Bodies[$requestIndex] } else { $testFixture.Body }
      return [pscustomobject]@{ Content = $content }
    }
    & $lookupBlock
    $expectedRequests = if ($testFixture.ContainsKey('Input')) { 0 } else { 2 }
    if ($script:lookupTestRequests -ne $expectedRequests) { throw 'Unexpected diagnostic request count.' }
  } $lookup $fixture)
  if ($rows.Count -ne 2) { throw ('Unexpected output count: ' + $fixture.Name) }
  for ($i = 0; $i -lt 2; $i++) {
    if ($rows[$i].Result -cne $fixture.Expected[$i]) { throw ('Unexpected lookup result: ' + $fixture.Name) }
    if ($rows[$i].CommunityOwnerDevice -cne @('iPhone','Android')[$i]) { throw 'Diagnostic labels changed.' }
    $checks = $checks + 1
  }
}
Write-Output ("Invitation lookup regressions: $checks/$checks PASS on PowerShell $($PSVersionTable.PSVersion); masked input and mocked HTTP only, no network requests.")
