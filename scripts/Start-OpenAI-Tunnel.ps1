[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectDir = Split-Path -Parent $PSScriptRoot
$TunnelId = 'tunnel_6afec118b3c4819190be0edaecf8df78'
$ProfileName = 'tongping-personal'
$TunnelHealthPort = 8795
$DataDir = Join-Path $env:LOCALAPPDATA 'Willow\TongPingTunnel'
$BinDir = Join-Path $DataDir 'bin'
$ProfileDir = Join-Path $DataDir 'profiles'
$LogDir = Join-Path $DataDir 'logs'
$KeyFile = Join-Path $DataDir 'control-plane-key.dpapi'
$WeChatKeyFile = Join-Path $env:LOCALAPPDATA 'Willow\WeChatBridgeTunnel\control-plane-key.dpapi'
$TunnelExe = Join-Path $BinDir 'tunnel-client'
$CloudflaredExe = Join-Path $BinDir 'cloudflared.exe'
$TongPingPidFile = Join-Path $DataDir 'tongping.pid'
$CloudflaredPidFile = Join-Path $DataDir 'cloudflared.pid'
$WslExe = $null
$TongPingProcess = $null
$CloudflaredProcess = $null

function Get-DotEnvValue([string]$Name) {
    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ($processValue) { return $processValue.Trim() }
    $envFile = Join-Path $ProjectDir '.env'
    if (-not (Test-Path -LiteralPath $envFile)) { return '' }
    foreach ($raw in Get-Content -LiteralPath $envFile) {
        $line = ([string]$raw).Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        if ($line -notmatch ('^(?:export\s+)?' + [Regex]::Escape($Name) + '\s*=\s*(.*)$')) { continue }
        $value = $Matches[1].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        return $value
    }
    return ''
}

$portText = Get-DotEnvValue 'TONGPING_PORT'
if (-not $portText) { $portText = '45921' }
$TongPingPort = 0
if (-not [int]::TryParse($portText, [ref]$TongPingPort) -or $TongPingPort -lt 1 -or $TongPingPort -gt 65535) {
    throw 'TONGPING_PORT must be an integer between 1 and 65535.'
}
$TongPingHome = Get-DotEnvValue 'TONGPING_HOME'
if (-not $TongPingHome) { $TongPingHome = Join-Path $env:USERPROFILE '.tongping' }
if ($TongPingHome -eq '~') { $TongPingHome = $env:USERPROFILE }
elseif ($TongPingHome.StartsWith('~\') -or $TongPingHome.StartsWith('~/')) {
    $TongPingHome = Join-Path $env:USERPROFILE $TongPingHome.Substring(2)
}
$TongPingHome = [IO.Path]::GetFullPath($TongPingHome)

function Write-Step([string]$Message) {
    Write-Host ('[TongPing] ' + $Message) -ForegroundColor Cyan
}

function Test-TcpPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        if (-not $task.Wait(350)) { return $false }
        return $client.Connected
    }
    catch { return $false }
    finally { $client.Dispose() }
}

function Wait-HttpOk([string]$Url, [int]$Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ([int]$response.StatusCode -eq 200) { return $true }
        }
        catch { }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Convert-ToWslPath([string]$WindowsPath) {
    $fullPath = [IO.Path]::GetFullPath($WindowsPath)
    if ($fullPath -notmatch '^([A-Za-z]):\\(.*)$') {
        throw ('Only local Windows drive paths can be converted for WSL: ' + $WindowsPath)
    }
    $drive = $Matches[1].ToLowerInvariant()
    $relative = $Matches[2].Replace('\', '/')
    return ('/mnt/' + $drive + '/' + $relative)
}

function Stop-ProcessTreeFromFile([string]$PidFile, [string]$ExpectedCommandFragment) {
    if (-not (Test-Path -LiteralPath $PidFile)) { return }
    $text = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    $pidValue = 0
    if (-not [int]::TryParse($text, [ref]$pidValue)) { return }
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $pidValue) -ErrorAction SilentlyContinue
    if ($null -eq $process) { return }
    $commandLine = [string]$process.CommandLine
    if ($commandLine.IndexOf($ExpectedCommandFragment, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        Write-Step ('Ignored stale PID file; process ' + $pidValue + ' is not managed by this launcher.')
        return
    }
    & taskkill.exe /PID $pidValue /T /F *> $null
}

function Stop-ManagedTunnel {
    if ($null -eq $script:WslExe -or -not (Test-Path -LiteralPath $TunnelExe)) { return }
    $tunnelExeWsl = Convert-ToWslPath $TunnelExe
    $profileDirWsl = Convert-ToWslPath $ProfileDir
    $expected = [Regex]::Escape("$tunnelExeWsl run --profile $ProfileName --profile-dir $profileDirWsl")
    try {
        $lines = & $script:WslExe -- sh -lc "ps -eo pid=,args= | grep -E '$expected' | grep -v grep" 2>$null
        foreach ($line in @($lines)) {
            if ([string]$line -match '^\s*(\d+)\s+') {
                & $script:WslExe -- kill -TERM $Matches[1] 2>$null
            }
        }
    }
    catch { }
}

function Set-WslSecretEnvironment([string]$Name, [string]$Value) {
    $oldValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    $oldWslEnv = [Environment]::GetEnvironmentVariable('WSLENV', 'Process')
    $entries = @($oldWslEnv -split ':' | Where-Object {
        $_ -and $_ -notmatch ('^' + [Regex]::Escape($Name) + '(?:/.*)?$')
    })
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
    [Environment]::SetEnvironmentVariable('WSLENV', ((@($entries) + $Name) -join ':'), 'Process')
    return @{ Value = $oldValue; WslEnv = $oldWslEnv }
}

function Restore-WslSecretEnvironment([string]$Name, [hashtable]$Saved) {
    [Environment]::SetEnvironmentVariable($Name, $Saved.Value, 'Process')
    [Environment]::SetEnvironmentVariable('WSLENV', $Saved.WslEnv, 'Process')
}

function Install-TunnelClient {
    if (-not (Test-Path -LiteralPath $TunnelExe)) {
        $wechatTunnelExe = Join-Path $env:LOCALAPPDATA 'Willow\WeChatBridgeTunnel\bin\tunnel-client'
        if (Test-Path -LiteralPath $wechatTunnelExe) {
            Write-Step 'Reusing the verified OpenAI tunnel client from WeChat.'
            New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
            Copy-Item -LiteralPath $wechatTunnelExe -Destination $TunnelExe -Force
        }
        else {
            Write-Step 'Downloading the official OpenAI tunnel client...'
            $headers = @{ 'User-Agent' = 'Willow-TongPing-Launcher' }
            $release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/openai/tunnel-client/releases/latest'
            $asset = @($release.assets) | Where-Object { $_.name -match '^tunnel-client-v.+-linux-amd64\.zip$' } | Select-Object -First 1
            $sumsAsset = @($release.assets) | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1
            if (-not $asset -or -not $sumsAsset) { throw 'The OpenAI tunnel-client release is incomplete.' }
            $tempDir = Join-Path ([IO.Path]::GetTempPath()) ('tongping-openai-tunnel-' + [Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
            try {
                $zipPath = Join-Path $tempDir $asset.name
                $sumsPath = Join-Path $tempDir 'SHA256SUMS.txt'
                Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $zipPath
                Invoke-WebRequest -Headers $headers -Uri $sumsAsset.browser_download_url -OutFile $sumsPath
                $escapedName = [Regex]::Escape($asset.name)
                $sumLine = Get-Content -LiteralPath $sumsPath | Where-Object { $_ -match ("^[0-9a-fA-F]{64}\s+\*?" + $escapedName + '$') } | Select-Object -First 1
                if (-not $sumLine) { throw 'The tunnel-client checksum entry was not found.' }
                $expected = ($sumLine -split '\s+')[0].ToLowerInvariant()
                $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
                if ($actual -ne $expected) { throw 'The tunnel-client checksum did not match.' }
                $extractDir = Join-Path $tempDir 'extracted'
                Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
                $sourceExe = Get-ChildItem -LiteralPath $extractDir -Filter 'tunnel-client' -File -Recurse | Select-Object -First 1
                if (-not $sourceExe) { throw 'tunnel-client was not found in the verified archive.' }
                New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
                Copy-Item -LiteralPath $sourceExe.FullName -Destination $TunnelExe -Force
            }
            finally {
                Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
    $tunnelExeWsl = Convert-ToWslPath $TunnelExe
    & $script:WslExe -- chmod 700 $tunnelExeWsl
    if ($LASTEXITCODE -ne 0) { throw 'Could not make tunnel-client executable in WSL.' }
    & $script:WslExe -- $tunnelExeWsl --version
    if ($LASTEXITCODE -ne 0) { throw 'The OpenAI tunnel client did not start correctly.' }
}

function Install-Cloudflared {
    if (Test-Path -LiteralPath $CloudflaredExe) { return }
    Write-Step 'Downloading Cloudflare Quick Tunnel helper (free, no account required)...'
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    $headers = @{ 'User-Agent' = 'Willow-TongPing-Launcher' }
    $release = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest'
    $asset = @($release.assets) | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' } | Select-Object -First 1
    if (-not $asset) { throw 'The Cloudflare release did not contain the Windows x64 helper.' }
    $checksumMatch = [Regex]::Match([string]$release.body, '(?im)^\s*cloudflared-windows-amd64\.exe:\s*([0-9a-f]{64})\s*$')
    if (-not $checksumMatch.Success) { throw 'The Cloudflare release did not publish the Windows x64 checksum.' }
    $expected = $checksumMatch.Groups[1].Value.ToLowerInvariant()
    $tempExe = $CloudflaredExe + '.download'
    try {
        Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $tempExe
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $tempExe).Hash.ToLowerInvariant()
        if ($actual -ne $expected) { throw 'Cloudflared checksum did not match.' }
        Move-Item -LiteralPath $tempExe -Destination $CloudflaredExe -Force
    }
    finally {
        Remove-Item -LiteralPath $tempExe -Force -ErrorAction SilentlyContinue
    }
}

function Get-ControlPlaneKey {
    if (-not (Test-Path -LiteralPath $KeyFile) -and (Test-Path -LiteralPath $WeChatKeyFile)) {
        Write-Step 'Reusing the encrypted OpenAI runtime key from the fixed WeChat tunnel.'
        New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
        Copy-Item -LiteralPath $WeChatKeyFile -Destination $KeyFile -Force
    }
    $secureKey = $null
    if (Test-Path -LiteralPath $KeyFile) {
        try {
            $encrypted = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
            if (-not $encrypted) { throw 'The saved key file is empty.' }
            $secureKey = ConvertTo-SecureString -String $encrypted
        }
        catch {
            $backupPath = $KeyFile + '.invalid-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss')
            Move-Item -LiteralPath $KeyFile -Destination $backupPath -Force
            Write-Step 'The saved runtime key could not be read; a backup was kept.'
        }
    }
    if ($null -eq $secureKey) {
        Write-Host ''
        Write-Host 'FIRST RUN: paste an OpenAI tunnel runtime key.' -ForegroundColor Yellow
        Write-Host 'It stays hidden and is encrypted for this Windows account.' -ForegroundColor Yellow
        $secureKey = Read-Host 'Runtime key' -AsSecureString
        if ($secureKey.Length -eq 0) { throw 'No runtime key was entered.' }
        $encrypted = ConvertFrom-SecureString -SecureString $secureKey
        Set-Content -LiteralPath $KeyFile -Value $encrypted -Encoding UTF8 -NoNewline
    }
    $credential = [System.Management.Automation.PSCredential]::new('tunnel', $secureKey)
    return $credential.GetNetworkCredential().Password
}

function Start-QuickTunnel {
    Stop-ProcessTreeFromFile $CloudflaredPidFile 'cloudflared.exe'
    $stdout = Join-Path $LogDir 'cloudflared.out.log'
    $stderr = Join-Path $LogDir 'cloudflared.err.log'
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
    $script:CloudflaredProcess = Start-Process -FilePath $CloudflaredExe `
        -ArgumentList @('tunnel', '--url', ('http://127.0.0.1:' + $TongPingPort), '--no-autoupdate') `
        -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Set-Content -LiteralPath $CloudflaredPidFile -Value $script:CloudflaredProcess.Id -Encoding ASCII -NoNewline
    $deadline = [DateTime]::UtcNow.AddSeconds(35)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($script:CloudflaredProcess.HasExited) { break }
        $text = ''
        if (Test-Path -LiteralPath $stdout) { $text += (Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue) }
        if (Test-Path -LiteralPath $stderr) { $text += (Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue) }
        if ($text -match 'https://[-a-z0-9]+\.trycloudflare\.com') { return $Matches[0] }
        Start-Sleep -Milliseconds 400
    }
    throw ('Cloudflare Quick Tunnel did not become ready. Check ' + $stderr)
}

function Start-TongPing([string]$PublicOrigin) {
    Stop-ProcessTreeFromFile $TongPingPidFile 'scripts\start.mjs'
    $oldPublicOrigin = [Environment]::GetEnvironmentVariable('TONGPING_PUBLIC_ORIGIN', 'Process')
    try {
        [Environment]::SetEnvironmentVariable('TONGPING_PUBLIC_ORIGIN', $PublicOrigin, 'Process')
        $script:TongPingProcess = Start-Process -FilePath 'node.exe' `
            -ArgumentList @('scripts\start.mjs') -WorkingDirectory $ProjectDir -PassThru -NoNewWindow
        Set-Content -LiteralPath $TongPingPidFile -Value $script:TongPingProcess.Id -Encoding ASCII -NoNewline
    }
    finally {
        [Environment]::SetEnvironmentVariable('TONGPING_PUBLIC_ORIGIN', $oldPublicOrigin, 'Process')
    }
    if (-not (Wait-HttpOk ('http://127.0.0.1:' + $TongPingPort + '/health') 65)) {
        throw 'TongPing did not become healthy within 65 seconds.'
    }
}

function Start-SecureTunnel([string]$RuntimeKey) {
    Stop-ManagedTunnel
    if (Test-TcpPort $TunnelHealthPort) { throw ('Port ' + $TunnelHealthPort + ' is already in use.') }
    $tunnelExeWsl = Convert-ToWslPath $TunnelExe
    $profileDirWsl = Convert-ToWslPath $ProfileDir
    $mcpUrl = 'http://127.0.0.1:' + $TongPingPort + '/mcp'
    $daemonTokenPath = Join-Path $TongPingHome 'daemon\daemon-token'
    if (-not (Test-Path -LiteralPath $daemonTokenPath)) { throw 'TongPing daemon token was not created.' }
    $daemonToken = (Get-Content -LiteralPath $daemonTokenPath -Raw).Trim()
    if (-not $daemonToken) { throw 'TongPing daemon token is empty.' }

    Write-Step 'Refreshing the fixed OpenAI tunnel profile...'
    & $script:WslExe -- $tunnelExeWsl init `
        --sample sample_mcp_remote_no_auth `
        --profile $ProfileName `
        --profile-dir $profileDirWsl `
        --force `
        --tunnel-id $TunnelId `
        --mcp-server-url $mcpUrl `
        --health-listen-addr ('127.0.0.1:' + $TunnelHealthPort)
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the TongPing tunnel profile.' }

    $savedControl = $null
    $savedHeaders = $null
    try {
        $savedControl = Set-WslSecretEnvironment 'CONTROL_PLANE_API_KEY' $RuntimeKey
        $savedHeaders = Set-WslSecretEnvironment 'MCP_EXTRA_HEADERS' ('Authorization: Bearer ' + $daemonToken)
        Write-Step 'Checking the local MCP server and tunnel authorization...'
        & $script:WslExe -- $tunnelExeWsl doctor --profile $ProfileName --profile-dir $profileDirWsl --explain
        if ($LASTEXITCODE -ne 0) { throw 'tunnel-client doctor reported a problem.' }
        $stdout = Join-Path $LogDir 'tunnel-client.out.log'
        $stderr = Join-Path $LogDir 'tunnel-client.err.log'
        Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
        Start-Process -FilePath $script:WslExe `
            -ArgumentList @('--', $tunnelExeWsl, 'run', '--profile', $ProfileName, '--profile-dir', $profileDirWsl) `
            -WorkingDirectory $DataDir -WindowStyle Hidden `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    }
    finally {
        if ($null -ne $savedHeaders) { Restore-WslSecretEnvironment 'MCP_EXTRA_HEADERS' $savedHeaders }
        if ($null -ne $savedControl) { Restore-WslSecretEnvironment 'CONTROL_PLANE_API_KEY' $savedControl }
        $daemonToken = $null
        $RuntimeKey = $null
    }
    if (-not (Wait-HttpOk ('http://127.0.0.1:' + $TunnelHealthPort + '/readyz') 30)) {
        throw ('OpenAI tunnel did not report ready. Check ' + (Join-Path $LogDir 'tunnel-client.err.log'))
    }
}

try {
    Write-Host ''
    Write-Host 'TongPing + OpenAI Private Tunnel v114' -ForegroundColor Green
    Write-Host ('Tunnel: ' + $TunnelId)
    Write-Host ''
    New-Item -ItemType Directory -Path $DataDir, $BinDir, $ProfileDir, $LogDir -Force | Out-Null
    $script:WslExe = (Get-Command 'wsl.exe' -ErrorAction Stop).Source
    & $script:WslExe -- sh -lc 'printf ready' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'WSL is installed but no Linux distribution is ready.' }

    Install-TunnelClient
    Install-Cloudflared
    $runtimeKey = Get-ControlPlaneKey
    Write-Step 'Starting the free short-lived media relay...'
    $publicOrigin = Start-QuickTunnel
    Write-Step ('Media relay ready: ' + $publicOrigin)
    Write-Step 'Starting TongPing...'
    Start-TongPing $publicOrigin
    Start-SecureTunnel $runtimeKey
    $runtimeKey = $null

    Write-Host ''
    Write-Host 'READY - TongPing and the fixed OpenAI tunnel are running.' -ForegroundColor Green
    Write-Host ('Fixed tunnel ID: ' + $TunnelId)
    Write-Host ('Local status: http://127.0.0.1:' + $TunnelHealthPort + '/ui')
    Write-Host ('Logs: ' + $LogDir)
    Write-Host ''
    Write-Host 'Keep this window open. Press Ctrl+C once to stop everything.'
    while ($null -ne $script:TongPingProcess -and -not $script:TongPingProcess.HasExited) {
        Start-Sleep -Seconds 1
    }
    throw 'TongPing stopped unexpectedly.'
}
catch {
    Write-Host ''
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    Stop-ManagedTunnel
    Stop-ProcessTreeFromFile $TongPingPidFile 'scripts\start.mjs'
    Stop-ProcessTreeFromFile $CloudflaredPidFile 'cloudflared.exe'
}
