<#
.SYNOPSIS
  Launches Multiwatch in a dedicated Chromium window that keeps playing when
  you switch to another app, and stops Windows from sleeping while it runs.

.DESCRIPTION
  A web page on its own cannot do this. Browsers throttle or freeze hidden
  tabs, and the Screen Wake Lock API only stops the *display* from sleeping
  while the tab is visible — it cannot stop the OS sleeping, and it cannot
  stop the browser backgrounding the renderer.

  What this script does instead, from outside the browser:
    * starts Chrome/Edge with background throttling, occlusion detection and
      Memory Saver disabled, plus autoplay allowed without a gesture;
    * uses a dedicated profile so those flags are not fighting your normal
      browsing session;
    * holds ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED for as long as the window
      is open, so the PC does not sleep and the display does not turn off;
    * optionally pins the window always-on-top;
    * optionally routes the whole browser through one HTTP/SOCKS proxy, which
      is the only way a proxy can affect a cross-origin video iframe.

  Proxy sources, in order of precedence:
    -Proxy <endpoint>      one specific proxy
    -ProxyList <file.txt>  a list to choose from (one per line)
    -ProxyCountry <CC>     fetch a list from proxifly/free-proxy-list

  It does NOT, and cannot, keep video playing if you close the browser, sign
  out, or lock the machine and have a policy that suspends media. It also does
  not assign a different proxy per screen: a browser page cannot do that, and
  rotating proxies per viewer is view manipulation. One proxy for the whole
  browser is the supported model.

.EXAMPLE
  .\start-multiwatch.ps1
  .\start-multiwatch.ps1 -Url http://localhost:4173 -AlwaysOnTop
  .\start-multiwatch.ps1 -ProxyList .\proxies.txt
  .\start-multiwatch.ps1 -ProxyList .\proxies.txt -Shuffle -ProxyOnly
  .\start-multiwatch.ps1 -ProxyCountry IN
  .\start-multiwatch.ps1 -Proxy socks5://1.2.3.4:1080
  .\start-multiwatch.ps1 -Warp
  .\start-multiwatch.ps1 -Warp -AlwaysOnTop
  # Portable (no system WARP): drop wireproxy.exe + wgcf-profile.conf into scripts/, then:
  .\start-multiwatch.ps1 -Warp
#>
[CmdletBinding()]
param(
  # The running app. Leave empty to auto-detect 5173, 4173, 4180, 3000 or 8080.
  [string] $Url = '',

  # auto = Chrome if installed, otherwise Edge.
  [ValidateSet('auto', 'chrome', 'edge')]
  [string] $Browser = 'auto',

  # Keep the window above other windows.
  [switch] $AlwaysOnTop,

  # Skip the sleep-blocking behaviour.
  [switch] $AllowSleep,

  # Route the whole browser through this proxy. Accepts `scheme://host:port`
  # or bare `host:port` (the scheme then comes from -ProxyScheme).
  [string] $Proxy = '',

  # A .txt file with one proxy per line. Accepts `scheme://host:port` or
  # `host:port`. Blank lines and `#` comments are ignored.
  [Alias('ProxyFile')]
  [string] $ProxyList = '',

  # Pull a working proxy for this ISO country code from the Proxifly list.
  # Example: IN for India, US, GB, DE.
  [string] $ProxyCountry = '',

  # Scheme used for list entries that do not specify one.
  [ValidateSet('http', 'https', 'socks4', 'socks5')]
  [string] $ProxyScheme = 'socks5',

  # Try the list in random order instead of top-down.
  [switch] $Shuffle,

  # How many entries to try before giving up.
  [int] $MaxProxyTries = 40,

  # Resolve a proxy, print it, and exit without launching a browser.
  [switch] $ProxyOnly,

  # Use Cloudflare WARP local proxy mode (socks5://127.0.0.1:40000).
  # Requires Cloudflare WARP installed (`winget install Cloudflare.Warp`).
  [switch] $Warp
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ── Find the running app ─────────────────────────────────────────────────────
# `npm run wall` should work whether you started `npm run dev` (5173),
# `vite preview` (4173), or a custom preview port such as 4180.
if (-not $Url) {
  foreach ($port in @(5173, 4173, 4180, 3000, 8080)) {
    $candidate = "http://localhost:$port"
    try {
      $response = Invoke-WebRequest -Uri $candidate -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $Url = $candidate
        break
      }
    } catch { }
  }
  if (-not $Url) { $Url = 'http://localhost:5173' }
}

# ── Proxy resolution ─────────────────────────────────────────────────────────
$ProxyListBase = 'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/countries'

function Get-CurlPath {
  $cmd = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return $null
}

function Test-ProxyEndpoint {
  # Returns the exit IP the proxy actually reached from, or $null.
  param([string] $Endpoint, [string] $CurlPath)

  if ($CurlPath) {
    # curl handles http, https, socks4 and socks5 uniformly via --proxy.
    # -s (not -sS): a dead proxy must stay silent, otherwise stderr becomes a
    # terminating error under $ErrorActionPreference = 'Stop'.
    $curlArgs = @('-s', '--max-time', '6', '--proxy', $Endpoint, 'https://api.ipify.org')
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $out = & $CurlPath @curlArgs 2>$null
    } finally {
      $ErrorActionPreference = $previous
    }
    if ($out) {
      $text = ($out | Out-String).Trim()
      if ($text -match '^\d{1,3}(\.\d{1,3}){3}$') { return $text }
    }
    return $null
  }

  # No curl: fall back to a bare TCP connect, which proves reachability only.
  try {
    $trimmed = $Endpoint -replace '^[a-z0-9]+://', ''
    $hostPort = $trimmed.Split(':')
    if ($hostPort.Count -lt 2) { return $null }
    $client = New-Object System.Net.Sockets.TcpClient
    $task = $client.ConnectAsync($hostPort[0], [int]$hostPort[1])
    if (-not $task.Wait(4000)) { $client.Close(); return $null }
    $client.Close()
    return 'unverified'
  } catch {
    return $null
  }
}

function Get-IpCountryCode {
  param([string] $Ip)
  try {
    $r = Invoke-RestMethod -Uri "http://ip-api.com/json/${Ip}?fields=countryCode" -TimeoutSec 8
    if ($r -and $r.countryCode) { return $r.countryCode }
  } catch { }
  return $null
}

function Add-Scheme {
  param([string] $Entry, [string] $Scheme)
  if ($Entry -match '^[a-z0-9]+://') { return $Entry }
  return "${Scheme}://$Entry"
}

function Read-ProxyListFile {
  param([string] $Path)

  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $resolved) { throw "Proxy list not found: $Path" }

  $entries = New-Object System.Collections.ArrayList
  $skipped = 0

  foreach ($line in (Get-Content -LiteralPath $resolved.Path)) {
    if ($null -eq $line) { continue }
    $value = $line.Trim()
    if (-not $value) { continue }
    if ($value.StartsWith('#')) { continue }
    # Drop a trailing "# comment" and any surrounding whitespace.
    $value = ($value -split '\s+#')[0].Trim()
    if (-not $value) { continue }

    # --proxy-server cannot carry credentials; those need a browser extension.
    if ($value -match '@') { $skipped++; continue }

    if ($value -match '^(https?|socks4|socks5)://[^\s]+$' -or
        $value -match '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$') {
      [void]$entries.Add($value)
    } else {
      $skipped++
    }
  }

  if ($skipped -gt 0) {
    Write-Warning "Skipped $skipped line(s) that are not plain host:port entries (credentials/comments/garbage)."
  }
  return @($entries)
}

function Get-CountryCandidates {
  param([string] $Country)
  $cc = $Country.ToUpperInvariant()
  $uri = "$ProxyListBase/$cc/data.json"
  Write-Host "Fetching $cc proxies from Proxifly..." -ForegroundColor DarkGray
  $json = Invoke-RestMethod -Uri $uri -TimeoutSec 25
  if (-not $json) { return @() }

  $all = @($json)
  if (-not $all.Count) { return @() }

  $transparent = @($all | Where-Object { $_.anonymity -eq 'transparent' })
  if ($transparent.Count -eq $all.Count) {
    Write-Warning ("All {0} {1} proxies in this list are transparent: they forward your real IP. Fine for geo-access, not for hiding." -f $all.Count, $cc)
  }

  # Rank: elite first, then anonymous, then transparent; HTTPS-capable first;
  # then by the list's own score.
  $ranked = $all | Sort-Object -Property `
    @{ Expression = {
        if ($_.anonymity -eq 'elite') { 0 }
        elseif ($_.anonymity -eq 'anonymous') { 1 }
        else { 2 }
      } },
    @{ Expression = { if ($_.https -eq $true) { 0 } else { 1 } } },
    @{ Expression = { -1 * [int]$_.score } }

  return @($ranked | ForEach-Object {
    [pscustomobject]@{ Protocol = "$($_.protocol)"; Ip = "$($_.ip)"; Port = [int]$_.port }
  })
}

function Get-EndpointVariants {
  param($Candidate)
  $proto = "$($Candidate.Protocol)"
  $hostPort = "$($Candidate.Ip):$($Candidate.Port)"
  if ($proto -eq 'socks4' -or $proto -eq 'socks5') {
    return @("${proto}://$hostPort")
  }
  # Entries labelled http/https are usually plain CONNECT proxies; the "https"
  # label often means "can fetch https targets", not "TLS to the proxy itself".
  # Try both instead of trusting the label.
  return @("http://$hostPort", "https://$hostPort")
}

function Test-AndVerify {
  param([string] $Endpoint, [string] $Wanted, [string] $CurlPath)

  $exitIp = Test-ProxyEndpoint -Endpoint $Endpoint -CurlPath $CurlPath
  if (-not $exitIp) { return $null }

  if ($exitIp -eq 'unverified') {
    return [pscustomobject]@{
      Endpoint    = $Endpoint
      ExitIp      = $exitIp
      Country     = $null
      Verified    = $false
      WrongCountry = $false
    }
  }

  $country = Get-IpCountryCode -Ip $exitIp
  $wrong = ($Wanted -and $country -and $country -ne $Wanted)

  return [pscustomobject]@{
    Endpoint    = $Endpoint
    ExitIp      = $exitIp
    Country     = $country
    Verified    = -not $wrong
    WrongCountry = $wrong
  }
}

function Resolve-Proxy {
  param(
    [string] $Explicit,
    [string] $List,
    [string] $Country,
    [string] $Scheme,
    [int] $MaxTries,
    [bool] $Randomize
  )

  $curlPath = Get-CurlPath
  if (-not $curlPath) {
    Write-Warning 'curl.exe not found; proxies can only be checked for reachability, not for a working exit IP.'
  }

  $wanted = ''
  $endpoints = @()

  if ($Explicit) {
    $endpoints = @(Add-Scheme -Entry $Explicit -Scheme $Scheme)
  } elseif ($List) {
    $entries = @(Read-ProxyListFile -Path $List)
    if (-not $entries.Count) { throw "No usable proxy entries found in $List" }
    $endpoints = @($entries | ForEach-Object { Add-Scheme -Entry $_ -Scheme $Scheme })
    if ($Randomize) {
      $endpoints = @($endpoints | Get-Random -Count $endpoints.Count)
      Write-Host ("Loaded {0} proxies from {1} (shuffled)" -f $endpoints.Count, $List) -ForegroundColor DarkGray
    } else {
      Write-Host ("Loaded {0} proxies from {1}" -f $endpoints.Count, $List) -ForegroundColor DarkGray
    }
  } elseif ($Country) {
    $wanted = $Country.ToUpperInvariant()
    $candidates = @(Get-CountryCandidates -Country $Country)
    if (-not $candidates.Count) {
      throw "Proxifly returned no proxies for '$Country'. Check the country code."
    }
    foreach ($candidate in $candidates) {
      foreach ($variant in @(Get-EndpointVariants -Candidate $candidate)) {
        $endpoints += $variant
      }
    }
  } else {
    return $null
  }

  if (-not $endpoints.Count) { throw 'No proxy endpoints to try.' }

  $limit = [Math]::Min($MaxTries, $endpoints.Count)
  $tried = 0
  foreach ($endpoint in $endpoints) {
    if ($tried -ge $limit) { break }
    $tried++
    Write-Host ("  [{0}/{1}] {2}" -f $tried, $limit, $endpoint) -ForegroundColor DarkGray

    $result = Test-AndVerify -Endpoint $endpoint -Wanted $wanted -CurlPath $curlPath
    if (-not $result) { continue }

    if ($result.WrongCountry) {
      Write-Host "        exit IP $($result.ExitIp) is in $($result.Country), not $wanted - skipping" -ForegroundColor DarkYellow
      continue
    }

    if (-not $result.Verified) {
      Write-Warning 'Proxy reachable but its exit IP could not be verified (install curl to check properly).'
    }
    return $result
  }

  $what = if ($wanted) { "$wanted proxy" } else { 'proxy' }
  throw "No working $what found in $tried attempts. Dead proxies are normal: free lists churn, and paid lists should be retried with -Shuffle."
}

$resolvedProxy = $null
if ($Proxy -or $ProxyList -or $ProxyCountry) {
  $resolvedProxy = Resolve-Proxy `
    -Explicit $Proxy `
    -List $ProxyList `
    -Country $ProxyCountry `
    -Scheme $ProxyScheme `
    -MaxTries $MaxProxyTries `
    -Randomize ([bool]$Shuffle)

  Write-Host ("Proxy OK: {0}  (exit IP {1}, {2})" -f $resolvedProxy.Endpoint, $resolvedProxy.ExitIp, $resolvedProxy.Country) -ForegroundColor Green
}

# ── Cloudflare WARP local proxy ──────────────────────────────────────────────
# WARP's local proxy mode accepts both HTTP and SOCKS5 on the same port, so
# we can point Chrome's --proxy-server at socks5://127.0.0.1:40000 without
# routing your normal PC traffic through WARP.
# Fallback: portable wireproxy.exe + wgcf-profile.conf from scripts/ if WARP
# is not installed and the user does not want a system-wide WARP service.
$wireproxyProc = $null

if ($Warp) {
  $warpCli = Get-Command warp-cli -ErrorAction SilentlyContinue
  $warpExe = Get-Command warp.exe   -ErrorAction SilentlyContinue

  if (-not $warpCli -and -not $warpExe) {
    Write-Host 'Cloudflare WARP not found. Installing via winget (may require admin)...' -ForegroundColor Cyan
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
      throw 'winget is not available and Cloudflare WARP is not installed. Install WARP manually, or drop wireproxy.exe + wgcf-profile.conf into scripts/ and rerun.'
    }
    & winget install --id Cloudflare.Warp -e --silent 2>$null | Out-Null
    $warpCli = Get-Command warp-cli -ErrorAction SilentlyContinue
    $warpExe = Get-Command warp.exe   -ErrorAction SilentlyContinue
  }

  if ($warpCli) {
    Write-Host 'Configuring Cloudflare WARP local proxy mode...' -ForegroundColor DarkGray
    & warp-cli mode proxy 2>$null | Out-Null
    & warp-cli proxy port 40000 2>$null | Out-Null
    & warp-cli connect 2>$null | Out-Null

    $started = Get-Date
    while ((Get-Date) - $started -lt (New-TimeSpan -Seconds 15)) {
      $test = Test-NetConnection -ComputerName 127.0.0.1 -Port 40000 -InformationLevel Quiet -ErrorAction SilentlyContinue
      if ($test) { break }
      Start-Sleep -Milliseconds 500
    }

    if (-not $test) {
      throw 'WARP local proxy port 40000 is not accepting connections. Run `warp-cli mode proxy` and `warp-cli connect` manually.'
    }

    $resolvedProxy = [pscustomobject]@{
      Endpoint    = 'socks5://127.0.0.1:40000'
      ExitIp      = 'via Cloudflare WARP'
      Country     = 'WARP'
      Verified    = $true
      WrongCountry = $false
    }

    Write-Host ("WARP local proxy OK: {0}" -f $resolvedProxy.Endpoint) -ForegroundColor Green
  } elseif ($warpExe) {
    # warp.exe (GUI) may still expose warp-cli after install; fall through handled above.
    throw 'Cloudflare WARP installed but warp-cli not found. Restart your shell or run `warp-cli mode proxy` manually.'
  } else {
    # ── Portable wireproxy fallback ──────────────────────────────────────────
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $wireproxyPath = Join-Path $scriptDir 'wireproxy.exe'
    $wgcfConf = Join-Path $scriptDir 'wgcf-profile.conf'

    if (-not (Test-Path -LiteralPath $wireproxyPath)) {
      throw 'Cloudflare WARP is not installed and scripts/wireproxy.exe is missing. Install WARP, or provide wireproxy.exe + wgcf-profile.conf in scripts/.'
    }
    if (-not (Test-Path -LiteralPath $wgcfConf)) {
      throw 'scripts/wireproxy.exe found but scripts/wgcf-profile.conf is missing. Generate a WARP profile with wgcf and place it in scripts/.'
    }

    Write-Host 'Starting portable wireproxy (Cloudflare WARP tunnel) on 127.0.0.1:40000...' -ForegroundColor Cyan
    $wireproxyProc = Start-Process -FilePath $wireproxyPath -ArgumentList @("-c", $wgcfConf) -PassThru

    $started = Get-Date
    while ((Get-Date) - $started -lt (New-TimeSpan -Seconds 20)) {
      $test = Test-NetConnection -ComputerName 127.0.0.1 -Port 40000 -InformationLevel Quiet -ErrorAction SilentlyContinue
      if ($test) { break }
      if ($wireproxyProc.HasExited) { throw 'wireproxy exited immediately. Check wgcf-profile.conf.' }
      Start-Sleep -Milliseconds 500
    }

    if (-not $test) {
      $wireproxyProc.Kill()
      throw 'wireproxy port 40000 is not accepting connections.'
    }

    $resolvedProxy = [pscustomobject]@{
      Endpoint    = 'socks5://127.0.0.1:40000'
      ExitIp      = 'via wireproxy + Cloudflare WARP'
      Country     = 'WARP'
      Verified    = $true
      WrongCountry = $false
    }

    Write-Host ("Wireproxy local proxy OK: {0}" -f $resolvedProxy.Endpoint) -ForegroundColor Green
  }
}

if ($ProxyOnly) {
  if ($resolvedProxy) { Write-Output $resolvedProxy.Endpoint }
  else { Write-Output '' }
  return
}

# ── Locate the browser ───────────────────────────────────────────────────────
$candidates = @{
  chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  edge   = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
}

function Find-Browser {
  param([string[]] $Order)
  foreach ($name in $Order) {
    foreach ($path in $candidates[$name]) {
      if ($path -and (Test-Path -LiteralPath $path)) {
        return [pscustomobject]@{ Name = $name; Path = $path }
      }
    }
  }
  return $null
}

$found = $null
switch ($Browser) {
  'chrome' { $found = Find-Browser @('chrome') }
  'edge'   { $found = Find-Browser @('edge') }
  default  { $found = Find-Browser @('chrome', 'edge') }
}

if (-not $found) {
  throw 'Could not find Chrome or Edge. Install one, or pass -Browser chrome|edge.'
}

# ── Warn early if the app is not being served ────────────────────────────────
try {
  Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4 | Out-Null
} catch {
  Write-Warning "Nothing is answering at $Url."
  Write-Warning 'Start the app first:  cd multiwatch; npm run dev    (or: npm run build; npx vite preview)'
}

# ── Native helpers ───────────────────────────────────────────────────────────
if (-not ('Multiwatch.Power' -as [type])) {
  Add-Type -Namespace Multiwatch -Name Power -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
}

if (-not ('Multiwatch.Window' -as [type])) {
  Add-Type -Namespace Multiwatch -Name Window -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
public static extern bool SetWindowPos(System.IntPtr hWnd, System.IntPtr hWndInsertAfter,
  int X, int Y, int cx, int cy, uint uFlags);
'@
}

$ES_CONTINUOUS       = [uint32]0x80000000
$ES_SYSTEM_REQUIRED  = [uint32]0x00000001
$ES_DISPLAY_REQUIRED = [uint32]0x00000002
$HWND_TOPMOST        = [IntPtr](-1)
$SWP_NOMOVE          = [uint32]0x0002
$SWP_NOSIZE          = [uint32]0x0001
$SWP_SHOWWINDOW      = [uint32]0x0040

function Set-SleepBlocked {
  param([bool] $Blocked)
  $flags = if ($Blocked) {
    $ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_DISPLAY_REQUIRED
  } else {
    $ES_CONTINUOUS
  }
  [void][Multiwatch.Power]::SetThreadExecutionState($flags)
}

# ── Launch ───────────────────────────────────────────────────────────────────
# A dedicated profile keeps these flags from affecting your normal browser and
# stops Chrome's Memory Saver from discarding the tab.
$profileDir = Join-Path $env:LOCALAPPDATA 'Multiwatch\browser-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$arguments = @(
  "--user-data-dir=$profileDir",
  "--app=$Url",
  '--start-maximized',
  # Keep timers, rendering and iframes running when the window is not focused.
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-media-suspend',
  # Memory Saver / tab discarding would unload the wall and reload it when you
  # come back from another virtual desktop. Disable the feature names used by
  # recent Chrome/Edge; unknown names are ignored.
  '--disable-features=CalculateNativeWinOcclusion,WebContentsOcclusion,MemorySaverModeSavings,HighEfficiencyModeAvailable,AutomaticTabDiscarding,IntensiveWakeUpThrottling,UseEcoQoSForBackgroundProcess',
  # Never sit on "click to play".
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
  '--no-default-browser-check'
)

if ($resolvedProxy) {
  # Applies to the whole browser: the local app is bypassed automatically,
  # while the youtube.com / twitch.tv / kick.com iframes go through the proxy.
  $arguments += "--proxy-server=$($resolvedProxy.Endpoint)"
}

if (-not $AllowSleep) { Set-SleepBlocked -Blocked $true }

Write-Host "Launching $($found.Name) -> $Url" -ForegroundColor Cyan
if ($resolvedProxy) {
  Write-Host "All video traffic egresses from $($resolvedProxy.ExitIp) via $($resolvedProxy.Endpoint)" -ForegroundColor Cyan
  Write-Host 'Note: free proxies are slow and short-lived. Expect buffering, and 60 screens will saturate one proxy.' -ForegroundColor DarkYellow
}

$proc = Start-Process -FilePath $found.Path -ArgumentList $arguments -PassThru

if ($AlwaysOnTop) {
  # The window may take a moment to appear.
  $handle = [IntPtr]::Zero
  for ($i = 0; $i -lt 20 -and $handle -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    try { $proc.Refresh() } catch { }
    $handle = $proc.MainWindowHandle
  }
  if ($handle -ne [IntPtr]::Zero) {
    [void][Multiwatch.Window]::SetWindowPos(
      $handle, $HWND_TOPMOST, 0, 0, 0, 0,
      ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW))
    Write-Host 'Window pinned always-on-top.' -ForegroundColor Cyan
  } else {
    Write-Warning 'Could not find the browser window; skipping always-on-top.'
  }
}

Write-Host 'Multiwatch is running. Close the window (or press Ctrl+C) to stop.' -ForegroundColor Green
Write-Host 'Screen sleep is blocked while this script is active.' -ForegroundColor DarkGray

# ── Hold the execution state until the browser exits ─────────────────────────
try {
  while (-not $proc.HasExited) {
    # Refresh periodically: the request is tied to this thread and some power
    # policies reset it on long idle.
    if (-not $AllowSleep) { Set-SleepBlocked -Blocked $true }
    Start-Sleep -Seconds 30
  }
} finally {
  # Always hand sleep control back, even on Ctrl+C.
  Set-SleepBlocked -Blocked $false
  Write-Host 'Sleep control released.' -ForegroundColor DarkGray

  # Shut down the portable wireproxy tunnel when the browser closes.
  if ($wireproxyProc -and -not $wireproxyProc.HasExited) {
    try { $wireproxyProc.Kill() } catch { /* already gone */ }
    Write-Host 'Wireproxy tunnel stopped.' -ForegroundColor DarkGray
  }
}
