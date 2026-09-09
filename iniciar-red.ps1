# Arranque con Cloudflare Tunnel: un clic y sale una URL https publica.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$BackendPort = 8000
$ToolsDir = Join-Path $Root "tools"
$CfExe = Join-Path $ToolsDir "cloudflared.exe"
$CfLog = Join-Path $ToolsDir "cloudflared.log"
$CfUrlFile = Join-Path $Root ".cloudflare-url"

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

function Read-TunnelUrl {
    if (-not (Test-Path $CfLog)) { return $null }
    $text = Get-Content $CfLog -Raw -ErrorAction SilentlyContinue
    if (-not $text) { return $null }
    $m = [regex]::Match($text, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) { return $m.Value }
    return $null
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

Write-Host "[6/8] Cloudflare Tunnel (cloudflared)..."
if (-not (Get-Cloudflared)) {
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[7/8] Levantando SIGeCom en este PC..."
Stop-Cloudflared
Stop-Port $BackendPort
Stop-Port 5173
Start-Sleep -Seconds 1
Remove-Item $CfLog -ErrorAction SilentlyContinue
Remove-Item $CfUrlFile -ErrorAction SilentlyContinue

$env:SIGECOM_LAN = "1"
$env:DJANGO_ALLOWED_HOSTS = "*"
$env:FRONTEND_URL = "http://127.0.0.1:$BackendPort"
$env:CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$BackendPort,http://localhost:$BackendPort"

$backendDir = Join-Path $Root "backend"
$runApi = 'title SIGeCom SERVIDOR' + ' & "' + $venvPy + '" manage.py runserver 127.0.0.1:' + $BackendPort
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
$cfArgs = @(
    "tunnel",
    "--url", "http://127.0.0.1:$BackendPort",
    "--no-autoupdate",
    "--protocol", "http2"
)
Start-Process -FilePath $CfExe -ArgumentList $cfArgs -WorkingDirectory $ToolsDir -RedirectStandardOutput $CfLog -RedirectStandardError $CfLog -WindowStyle Minimized

$publicUrl = $null
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    $publicUrl = Read-TunnelUrl
    if ($publicUrl) { break }
}

if ($publicUrl) {
    Set-Content -Path $CfUrlFile -Value $publicUrl -Encoding UTF8
    $urlFile = Join-Path $Root "url-red.txt"
    @(
        "SIGeCom Mesa de Ayuda - URL Cloudflare"
        ""
        $publicUrl
        ""
        "Cualquiera con internet puede entrar (no hace falta la misma WiFi)."
        "No apagues este PC ni cierres SIGeCom SERVIDOR."
        "Para apagar: detener-red.bat"
        "Nota: esta URL de Cloudflare cambia cada vez que arrancas (tunel rapido)."
    ) | Set-Content -Path $urlFile -Encoding UTF8
    try { Set-Clipboard -Value $publicUrl } catch {}
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
    Write-Host "  Para apagar: detener-red.bat"
} else {
    Write-Host "  El tunel tarda un poco. Abre tools\cloudflared.log y busca https://....trycloudflare.com"
    Write-Host "  Si no aparece, revisa internet y vuelve a ejecutar iniciar-red.bat"
}
Write-Host "=============================================="
Write-Host ""
Wait-User "Enter para cerrar esta ventana (el servidor sigue corriendo)"
