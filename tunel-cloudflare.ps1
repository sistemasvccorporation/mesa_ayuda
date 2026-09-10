# Funciones del tunel Cloudflare con nombre (URL fija, vale en cualquier red).
# El tunel rapido trycloudflare.com lo bloquea el DNS de varios ISP.

$script:SigecomTunnelName = "sigecom-mesa"
$script:SigecomDefaultHost = "mesa-ayuda.vc-corporation.com"

function Get-Cloudflared {
    if (Test-Path $CfExe) { return $true }
    if (-not (Test-Path $ToolsDir)) { New-Item -ItemType Directory -Path $ToolsDir | Out-Null }
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Write-Host "      Descargando cloudflared (Cloudflare Tunnel)..."
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $url -OutFile $CfExe -UseBasicParsing
    } catch {
        Write-Host "ERROR: no se pudo descargar cloudflared. Revisa internet."
        Write-Host $_.Exception.Message
        return $false
    }
    if (-not (Test-Path $CfExe)) { return $false }
    Write-Host "      cloudflared listo."
    return $true
}

function Get-DotEnvValue([string]$Key) {
    $file = Join-Path $Root ".env"
    if (-not (Test-Path $file)) { return "" }
    foreach ($line in Get-Content $file -ErrorAction SilentlyContinue) {
        if ($line -match "^\s*#" -or $line -notmatch "=") { continue }
        $n = $line.Substring(0, $line.IndexOf("=")).Trim()
        if ($n -ne $Key) { continue }
        return $line.Substring($line.IndexOf("=") + 1).Trim().Trim("'").Trim('"')
    }
    return ""
}

function Get-CloudflareHostname {
    $h = Get-DotEnvValue "CLOUDFLARE_HOSTNAME"
    if ($h) { return $h.ToLower() }
    $u = Get-DotEnvValue "CLOUDFLARE_PUBLIC_URL"
    if ($u) {
        try { return ([Uri]$u).Host } catch { return $script:SigecomDefaultHost }
    }
    return $script:SigecomDefaultHost
}

function Get-CloudflarePublicUrl {
    $u = Get-DotEnvValue "CLOUDFLARE_PUBLIC_URL"
    if ($u) { return $u.Trim().TrimEnd("/") }
    return "https://$(Get-CloudflareHostname)"
}

function Get-CloudflareCert {
    return (Join-Path $env:USERPROFILE ".cloudflared\cert.pem")
}

function Test-CloudflareReady {
    if (Get-DotEnvValue "CLOUDFLARE_TUNNEL_TOKEN") { return $true }
    return (Test-Path (Get-CloudflareCert))
}

function Get-CloudflareConfig {
    return (Join-Path $env:USERPROFILE ".cloudflared\config.yml")
}

function Ensure-CloudflaredDir {
    $dir = Join-Path $env:USERPROFILE ".cloudflared"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    return $dir
}

function Invoke-Cloudflared([string[]]$Args) {
    $out = & $CfExe @Args 2>&1 | Out-String
    return @{ Code = $LASTEXITCODE; Text = $out }
}

function Ensure-CloudflareLogin {
    $cert = Get-CloudflareCert
    if (Test-Path $cert) { return $true }
    Ensure-CloudflaredDir | Out-Null
    Write-Host ""
    Write-Host "  Se abre el navegador de Cloudflare."
    Write-Host "  1) Entra con la cuenta de V&C (por ejemplo sistemasvccorporation@gmail.com)"
    Write-Host "  2) Elige el dominio (vc-corporation.com si ya esta en Cloudflare)"
    Write-Host "  3) Pulsa Authorize"
    Write-Host ""
    & $CfExe tunnel login
    if (Test-Path $cert) { return $true }
    Write-Host "ERROR: no se autorizo el PC. Vuelve a ejecutar configurar-cloudflare.bat y completa el login."
    return $false
}

function Get-TunnelIdByName([string]$Name) {
    $r = Invoke-Cloudflared @("tunnel", "list")
    if ($r.Text -match "(?im)^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+$Name\b") {
        return $Matches[1]
    }
    return $null
}

function New-SigecomTunnelConfig([string]$TunnelId) {
    $cred = Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
    $cfg = Get-CloudflareConfig
    $yml = @"
tunnel: $TunnelId
credentials-file: $cred
protocol: http2
ingress:
  - service: http://127.0.0.1:8000
"@
    Set-Content -Path $cfg -Value $yml -Encoding UTF8
}

function Ensure-SigecomNamedTunnel {
    $id = Get-TunnelIdByName $script:SigecomTunnelName
    if (-not $id) {
        Write-Host "      Creando tunel Cloudflare '$($script:SigecomTunnelName)'..."
        $r = Invoke-Cloudflared @("tunnel", "create", $script:SigecomTunnelName)
        Write-Host $r.Text
        $id = Get-TunnelIdByName $script:SigecomTunnelName
        if (-not $id -and $r.Text -match "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})") {
            $id = $Matches[1]
        }
    }
    if (-not $id) {
        Write-Host "ERROR: no se pudo crear el tunel con nombre."
        return $null
    }
    New-SigecomTunnelConfig $id
    return $id
}

function Register-SigecomDns([string]$Hostname) {
    Write-Host "      Publicando hostname $Hostname ..."
    $r = Invoke-Cloudflared @("tunnel", "route", "dns", "--overwrite-dns", $script:SigecomTunnelName, $Hostname)
    Write-Host $r.Text
    if ($r.Code -ne 0 -and $r.Text -notmatch "already exists|CNAME") {
        Write-Host ""
        Write-Host "  No se pudo crear el DNS automatico. El dominio tiene que estar en Cloudflare."
        Write-Host "  En el panel: Zero Trust > Networks > Tunnels > sigecom-mesa > Public Hostname"
        Write-Host "    Subdomain: mesa-ayuda"
        Write-Host "    Domain:    vc-corporation.com (o el que tengas en Cloudflare)"
        Write-Host "    Service:   http://127.0.0.1:8000"
        Write-Host "  Guia: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/"
        return $false
    }
    return $true
}

function Save-CloudflareUrl([string]$Url) {
    Set-Content -Path (Join-Path $Root ".cloudflare-url") -Value $Url.TrimEnd("/") -Encoding UTF8
}

function Start-SigecomCloudflareTunnel {
    $token = Get-DotEnvValue "CLOUDFLARE_TUNNEL_TOKEN"
    $out = Join-Path $ToolsDir "cloudflared.out.log"
    $err = Join-Path $ToolsDir "cloudflared.err.log"
    Remove-Item $out, $err -ErrorAction SilentlyContinue
    if ($token) {
        $args = @("tunnel", "--no-autoupdate", "run", "--token", $token)
        Start-Process -FilePath $CfExe -ArgumentList $args -WorkingDirectory $ToolsDir -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden
        return (Get-CloudflarePublicUrl)
    }
    $args = @("tunnel", "--no-autoupdate", "--protocol", "http2", "run", $script:SigecomTunnelName)
    Start-Process -FilePath $CfExe -ArgumentList $args -WorkingDirectory $ToolsDir -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden
    return (Get-CloudflarePublicUrl)
}

function Ensure-SigecomCloudflareTunnel {
    param([switch]$AllowLogin)
    $token = Get-DotEnvValue "CLOUDFLARE_TUNNEL_TOKEN"
    if ($token) {
        $url = Get-CloudflarePublicUrl
        if ($url -match "trycloudflare|loca\.lt|lhr\.life") {
            Write-Host "ERROR: CLOUDFLARE_PUBLIC_URL debe ser tu dominio (ej. https://mesa-ayuda.vc-corporation.com)."
            return $null
        }
        Save-CloudflareUrl $url
        return $url
    }
    if (-not (Get-Cloudflared)) { return $null }
    if ($AllowLogin) {
        if (-not (Ensure-CloudflareLogin)) { return $null }
    } elseif (-not (Test-Path (Get-CloudflareCert))) {
        Write-Host "Falta autorizar Cloudflare. Ejecuta configurar-cloudflare.bat una vez."
        return $null
    }
    $id = Ensure-SigecomNamedTunnel
    if (-not $id) { return $null }
    $hostName = Get-CloudflareHostname
    $null = Register-SigecomDns $hostName
    $url = "https://$hostName"
    Save-CloudflareUrl $url
    return $url
}
