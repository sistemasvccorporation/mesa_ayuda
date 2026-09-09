# Arranque local SIGeCom Mesa de Ayuda (Windows)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$BackendPort = 8000
$FrontendPort = 5173
$Url = "http://127.0.0.1:$FrontendPort"

function Test-Listen([int]$Port) {
    foreach ($hostName in @("127.0.0.1", "::1")) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $iar = $tcp.BeginConnect($hostName, $Port, $null, $null)
            $ok = $iar.AsyncWaitHandle.WaitOne(400)
            $connected = $false
            if ($ok) {
                try { $connected = $tcp.Connected } catch { $connected = $false }
            }
            try { $tcp.Close() } catch {}
            if ($connected) { return $true }
        } catch {}
    }
    return $false
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

function Wait-User([string]$Message) {
    if ($env:SIGECOM_NO_PAUSE -ne "1") {
        Read-Host $Message
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "  SIGeCom Mesa de Ayuda - esta maquina"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/6] Encendiendo MariaDB..."
$maria = Get-Service -Name "MariaDB" -ErrorAction SilentlyContinue
if ($maria) {
    if ($maria.Status -ne "Running") {
        try {
            Start-Service MariaDB
            Write-Host "      MariaDB iniciado."
        } catch {
            Write-Host "      No se pudo iniciar MariaDB. Ejecuta este archivo como administrador o abre XAMPP."
        }
    } else {
        Write-Host "      MariaDB ya estaba encendido."
    }
} else {
    Write-Host "      Servicio MariaDB no encontrado. Si usas XAMPP, pulsa Start en MySQL."
}

if (-not (Test-Listen 3306)) {
    Write-Host "ERROR: MySQL/MariaDB no responde en el puerto 3306."
    Write-Host "Enciendelo y vuelve a ejecutar iniciar-local.bat"
    Wait-User "Enter para salir"
    exit 1
}

$envFile = Join-Path $Root ".env"
if (-not (Test-Path $envFile) -and (Test-Path (Join-Path $Root ".env.example"))) {
    Copy-Item (Join-Path $Root ".env.example") $envFile
}

$venvPy = Join-Path $Root ".venv\Scripts\python.exe"
Write-Host "[2/6] Entorno Python..."
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

Write-Host "[3/6] Dependencias Python..."
& $venvPy -m pip install -q --upgrade pip
& $venvPy -m pip install -q -r (Join-Path $Root "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR instalando requirements.txt"
    Wait-User "Enter para salir"
    exit 1
}

Write-Host "[4/6] Migraciones..."
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

Write-Host "[5/6] Dependencias de la web..."
$nm = Join-Path $Root "frontend\node_modules"
if (-not (Test-Path $nm)) {
    Push-Location (Join-Path $Root "frontend")
    npm install
    $npmCode = $LASTEXITCODE
    Pop-Location
    if ($npmCode -ne 0) {
        Write-Host "ERROR en npm install"
        Wait-User "Enter para salir"
        exit 1
    }
}

Write-Host "[6/6] Levantando API y web..."
Stop-Port $BackendPort
Stop-Port $FrontendPort
Start-Sleep -Seconds 1

$backendDir = Join-Path $Root "backend"
$frontendDir = Join-Path $Root "frontend"

$runApi = 'title SIGeCom API' + ' & "' + $venvPy + '" manage.py runserver 127.0.0.1:' + $BackendPort
$runWeb = 'title SIGeCom Web' + ' & npm run dev'
Start-Process -FilePath "cmd.exe" -WorkingDirectory $backendDir -ArgumentList "/k", $runApi
Start-Process -FilePath "cmd.exe" -WorkingDirectory $frontendDir -ArgumentList "/k", $runWeb

Write-Host "Esperando a que todo quede en linea..."
$readyApi = $false
$readyWeb = $false
for ($i = 0; $i -lt 40; $i++) {
    if (-not $readyApi) { $readyApi = Test-Listen $BackendPort }
    if (-not $readyWeb) { $readyWeb = Test-Listen $FrontendPort }
    if ($readyApi -and $readyWeb) { break }
    Start-Sleep -Seconds 1
}

Write-Host ""
if ($readyApi -and $readyWeb) {
    Start-Process $Url
    Write-Host "LISTO. Todo activo en $Url"
    Write-Host "No cierres las ventanas SIGeCom API y SIGeCom Web."
    Write-Host "Para apagar: detener-local.bat"
} elseif ($readyApi) {
    Start-Process $Url
    Write-Host "API activa. La web sigue arrancando: $Url"
} else {
    Write-Host "No se detectaron los puertos. Mira las ventanas SIGeCom API y SIGeCom Web."
    Write-Host "Luego abre $Url"
}

Write-Host ""
Wait-User "Enter para cerrar esta ventana (el sistema sigue corriendo)"
