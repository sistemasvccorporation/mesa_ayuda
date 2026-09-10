# Arranque con Cloudflare Tunnel rapido (trycloudflare.com).
# Si el DNS del proveedor no resuelve, hay que usar DNS seguro Cloudflare 1.1.1.1.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$BackendPort = 8000
$ToolsDir = Join-Path $Root "tools"
$CfExe = Join-Path $ToolsDir "cloudflared.exe"
$CfLog = Join-Path $ToolsDir "cloudflared.log"
$CfOut = Join-Path $ToolsDir "cloudflared.out.log"
$CfErr = Join-Path $ToolsDir "cloudflared.err.log"
$LtOut = Join-Path $ToolsDir "localtunnel.out.log"
$LtErr = Join-Path $ToolsDir "localtunnel.err.log"
$SshOut = Join-Path $ToolsDir "ssh-tunel.out.log"
$SshErr = Join-Path $ToolsDir "ssh-tunel.err.log"
$SshKnown = Join-Path $env:USERPROFILE ".ssh\sigecom_known_hosts"
$LtJs = Join-Path $ToolsDir "node_modules\localtunnel\bin\lt.js"
$CfUrlFile = Join-Path $Root ".cloudflare-url"
$SshExe = Join-Path $env:WINDIR "System32\OpenSSH\ssh.exe"

. (Join-Path $Root "tunel-cloudflare.ps1")

function Test-Listen([int]$Port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(400)
        $connected = $false
        if ($ok) {
            try { $connected = $tcp.Connected } catch { $connected = $false }
        }
        try { $tcp.Close() } catch {}
        return $connected
    } catch {
        return $false
    }
}

function Stop-Port([int]$Port) {
    try {
        $lines = netstat -ano | Select-String ":$Port\s+.+LISTENING"
        foreach ($line in $lines) {
            $procId = ($line.ToString().Trim() -split "\s+")[-1]
            if ($procId -match "^\d+$") {
                & taskkill /F /PID $procId > $null 2>&1
            }
        }
    } catch {}
}

function Stop-Cloudflared {
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
}

function Stop-SshTunnel {
    Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "localhost\.run|serveo\.net" } |
        ForEach-Object {
            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
}

function Stop-Localtunnel {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "localtunnel|lt\.js" } |
        ForEach-Object {
            try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
}

function Wait-User([string]$Message) {
    if ($env:SIGECOM_NO_PAUSE -ne "1") {
        Read-Host $Message
    }
}

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

function Get-Localtunnel {
    if (Test-Path $LtJs) { return $true }
    if (-not (Test-Path $ToolsDir)) { New-Item -ItemType Directory -Path $ToolsDir | Out-Null }
    Write-Host "      Instalando tunel publico..."
    $pkg = Join-Path $ToolsDir "package.json"
    if (-not (Test-Path $pkg)) {
        @{
            name = "sigecom-tunel"
            private = $true
            dependencies = @{ localtunnel = "^2.0.2" }
        } | ConvertTo-Json | Set-Content -Path $pkg -Encoding UTF8
    }
    Push-Location $ToolsDir
    npm install --no-fund --no-audit
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0 -or -not (Test-Path $LtJs)) {
        Write-Host "ERROR: no se pudo instalar el tunel publico (npm)."
        return $false
    }
    Write-Host "      Tunel publico listo."
    return $true
}

function Read-PublicUrl {
    $chunks = @()
    foreach ($f in @($CfErr, $CfOut, $CfLog, $SshOut, $SshErr, $LtOut, $LtErr)) {
        if (Test-Path $f) {
            $t = Get-Content $f -Raw -ErrorAction SilentlyContinue
            if ($t) { $chunks += $t }
        }
    }
    if (-not $chunks) { return $null }
    $text = $chunks -join "`n"
    $m = [regex]::Match($text, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) { return $m.Value }
    return $null
}

function Test-DnsNameCustom([string]$HostName, [string]$DnsServer) {
    try {
        $r = Resolve-DnsName -Name $HostName -Type A -Server $DnsServer -ErrorAction Stop
        return [bool]$r
    } catch {
        return $false
    }
}

function Test-SystemDns([string]$HostName) {
    try {
        $null = [System.Net.Dns]::GetHostAddresses($HostName)
        return $true
    } catch {
        return $false
    }
}

function Get-LanUrls([int]$Port) {
    $urls = @()
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.PrefixOrigin -ne "WellKnown" -and
            $_.IPAddress -notlike "169.254.*"
        } |
        ForEach-Object { $urls += "http://$($_.IPAddress):$Port" }
    if (-not $urls) {
        try {
            $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } | Select-Object -First 1).IPv4Address.IPAddress
            if ($ip) { $urls += "http://${ip}:$Port" }
        } catch {}
    }
    return $urls | Select-Object -Unique
}

function Enable-SigecomFirewall([int]$Port) {
    try {
        $name = "SIGeCom Mesa de Ayuda"
        $exists = netsh advfirewall firewall show rule name="$name" 2>$null
        if ($exists -match $name) { return }
        Start-Process -FilePath "netsh" -ArgumentList @("advfirewall","firewall","add","rule","name=$name","dir=in","action=allow","protocol=TCP","localport=$Port") -WindowStyle Hidden -Wait
    } catch {}
}

function Start-CloudflareQuickTunnel {
    if (-not (Get-Cloudflared)) { return $null }
    Remove-Item $CfOut, $CfErr, $CfLog -ErrorAction SilentlyContinue
    $cfArgs = @(
        "tunnel",
        "--url", "http://127.0.0.1:$BackendPort",
        "--no-autoupdate",
        "--protocol", "http2"
    )
    Start-Process -FilePath $CfExe -ArgumentList $cfArgs -WorkingDirectory $ToolsDir -RedirectStandardOutput $CfOut -RedirectStandardError $CfErr -WindowStyle Minimized
    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 1
        $u = Read-PublicUrl
        if ($u) { return $u }
    }
    return $null
}

function Write-DnsSeguroAyuda {
    @(
        "Si el navegador dice que el sitio no existe (NXDOMAIN), activa DNS seguro de Cloudflare:"
        "  Chrome: chrome://settings/security  →  Usar DNS seguro  →  Cloudflare (1.1.1.1)"
        "  Edge:   Configuracion > Privacidad y seguridad > Seguridad > DNS seguro > Cloudflare"
        "Luego recarga la URL. Quien use datos moviles suele entrar sin cambiar nada."
    )
}

Write-Host ""
Write-Host "=============================================="
Write-Host "  SIGeCom Mesa de Ayuda"
Write-Host "  Servidor + Cloudflare Tunnel"
Write-Host "=============================================="
Write-Host ""

Write-Host "[1/8] Encendiendo MariaDB..."
$maria = Get-Service -Name "MariaDB" -ErrorAction SilentlyContinue
if ($maria) {
    if ($maria.Status -ne "Running") {
        try {
            Start-Service MariaDB
            Write-Host "      MariaDB iniciado."
        } catch {
            Write-Host "      No se pudo iniciar MariaDB. Ejecuta como administrador o abre XAMPP."
        }
    } else {
        Write-Host "      MariaDB ya estaba encendido."
    }
} else {
    Write-Host "      Servicio MariaDB no encontrado. Si usas XAMPP, pulsa Start en MySQL."
}

if (-not (Test-Listen 3306)) {
    Write-Host "ERROR: MySQL/MariaDB no responde en el puerto 3306."
    Write-Host "Enciendelo y vuelve a ejecutar iniciar-red.bat"
    Wait-User "Enter para salir"
    exit 1
}

$envFile = Join-Path $Root ".env"
if (-not (Test-Path $envFile) -and (Test-Path (Join-Path $Root ".env.example"))) {
    Copy-Item (Join-Path $Root ".env.example") $envFile
}

$venvPy = Join-Path $Root ".venv\Scripts\python.exe"
Write-Host "[2/8] Entorno Python..."
if (-not (Test-Path $venvPy)) {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { & py -3 -m venv (Join-Path $Root ".venv") }
    else { & python -m venv (Join-Path $Root ".venv") }
}
if (-not (Test-Path $venvPy)) {
    Write-Host "ERROR: no se encontro Python. Instala 3.12 o 3.13 y marca Add to PATH."
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[3/8] Dependencias Python..."
& $venvPy -m pip install -q --upgrade pip
& $venvPy -m pip install -q -r (Join-Path $Root "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR instalando requirements.txt"
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[4/8] Migraciones..."
& $venvPy (Join-Path $Root "backend\manage.py") migrate --noinput
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR en migrate. Revisa usuario/clave en .env y que exista la base proyecto_sigecom."
    Wait-User "Enter para salir"
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: no se encontro Node.js / npm. Instala Node 20 o 22."
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[5/8] Empaquetando la web..."
$frontendDir = Join-Path $Root "frontend"
Push-Location $frontendDir
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "ERROR en npm install"
        Wait-User "Enter para salir"
        exit 1
    }
}
npm run build
$buildCode = $LASTEXITCODE
Pop-Location
if ($buildCode -ne 0) {
    Write-Host "ERROR al generar la web (npm run build)."
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[6/8] Cloudflare Tunnel..."
if (-not (Get-Cloudflared)) {
    Wait-User "Enter para salir"
    exit 1
}
Write-Host "      cloudflared listo."

Write-Host "[7/8] Levantando SIGeCom en este PC..."
Stop-SshTunnel
Stop-Localtunnel
Stop-Cloudflared
Stop-Port $BackendPort
Stop-Port 5173
Start-Sleep -Seconds 1
Remove-Item $CfLog, $CfOut, $CfErr, $LtOut, $LtErr, $SshOut, $SshErr -ErrorAction SilentlyContinue
Enable-SigecomFirewall $BackendPort

$lanUrls = @(Get-LanUrls $BackendPort)
$env:SIGECOM_LAN = "1"
$env:DJANGO_ALLOWED_HOSTS = "*"
$env:FRONTEND_URL = "http://127.0.0.1:$BackendPort"
$cors = @("http://127.0.0.1:$BackendPort", "http://localhost:$BackendPort") + $lanUrls
$env:CORS_ALLOWED_ORIGINS = ($cors | Select-Object -Unique) -join ","

$backendDir = Join-Path $Root "backend"
$runApi = 'title SIGeCom SERVIDOR' + ' & "' + $venvPy + '" manage.py runserver 0.0.0.0:' + $BackendPort
Start-Process -FilePath "cmd.exe" -WorkingDirectory $backendDir -ArgumentList "/k", $runApi

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    if (Test-Listen $BackendPort) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    Write-Host "ERROR: el sistema no arranco en el puerto $BackendPort. Mira la ventana SIGeCom SERVIDOR."
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[8/8] Publicando con Cloudflare..."
$publicUrl = Start-CloudflareQuickTunnel
if ($publicUrl) {
    Save-CloudflareUrl $publicUrl
    $env:FRONTEND_URL = $publicUrl
}

$okCf = $false
if ($publicUrl) {
    $hostName = ([Uri]$publicUrl).Host
    for ($i = 0; $i -lt 15; $i++) {
        if (Test-DnsNameCustom $hostName "1.1.1.1") { $okCf = $true; break }
        Start-Sleep -Seconds 1
    }
}

$lineas = @(
    "SIGeCom Mesa de Ayuda - Cloudflare"
    ""
    "Mientras este PC este encendido y no cierres SIGeCom SERVIDOR:"
    ""
)
if ($publicUrl) {
    $lineas += "Internet (comparte esta URL):"
    $lineas += "  $publicUrl"
    $lineas += ""
}
$lineas += "Misma WiFi / oficina:"
if ($lanUrls.Count -eq 0) {
    $lineas += "  http://127.0.0.1:$BackendPort"
} else {
    foreach ($u in $lanUrls) { $lineas += "  $u" }
}
$lineas += ""
$lineas += (Write-DnsSeguroAyuda)
$lineas += ""
$lineas += "Para apagar: detener-red.bat"
$lineas += "Nota: la URL de Cloudflare cambia cada vez que arrancas iniciar-red.bat"
$urlFile = Join-Path $Root "url-red.txt"
$lineas | Set-Content -Path $urlFile -Encoding UTF8
if ($publicUrl) { try { Set-Clipboard -Value $publicUrl } catch {} }

if ($publicUrl) {
    Start-Process $publicUrl
}

Write-Host ""
Write-Host "=============================================="
if ($publicUrl) {
    Write-Host "  LISTO. Comparte esta URL de Cloudflare:"
    Write-Host ""
    Write-Host "      $publicUrl"
    Write-Host ""
    Write-Host "  Quedo copiada al portapapeles y en url-red.txt"
    Write-Host "  No cierres SIGeCom SERVIDOR ni apagues el PC."
    Write-Host ""
    Write-Host "  Si alguien no puede entrar (sitio no existe), que active DNS seguro:"
    Write-Host "    Chrome: chrome://settings/security  →  Usar DNS seguro  →  Cloudflare 1.1.1.1"
    Write-Host "    Edge:   Privacidad y seguridad  →  Seguridad  →  DNS seguro  →  Cloudflare"
    Write-Host "  Luego que recargue el enlace. En celular con datos suele abrir directo."
} else {
    Write-Host "  El tunel tarda un poco. Abre tools\cloudflared.err.log y busca https://....trycloudflare.com"
    Write-Host "  Si no aparece, revisa internet y vuelve a ejecutar iniciar-red.bat"
}
Write-Host "=============================================="
Write-Host ""
Wait-User "Enter para cerrar esta ventana (el servidor sigue corriendo)"
