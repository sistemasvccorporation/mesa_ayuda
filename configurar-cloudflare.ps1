# Una sola vez: autoriza este PC en Cloudflare y crea el tunel con nombre.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$ToolsDir = Join-Path $Root "tools"
$CfExe = Join-Path $ToolsDir "cloudflared.exe"
$BackendPort = 8000

. (Join-Path $Root "tunel-cloudflare.ps1")

Write-Host ""
Write-Host "=============================================="
Write-Host "  SIGeCom - Tunel Cloudflare (URL fija)"
Write-Host "=============================================="
Write-Host ""
Write-Host "Esto crea un tunel CON NOMBRE. Cualquiera entra desde cualquier sitio,"
Write-Host "sin cambiar DNS y sin escribir una IP."
Write-Host ""
Write-Host "Necesitas:"
Write-Host "  - Cuenta Cloudflare (gratis) con el dominio de V&C, p.ej. vc-corporation.com"
Write-Host "  - O un token Zero Trust en .env (CLOUDFLARE_TUNNEL_TOKEN + CLOUDFLARE_PUBLIC_URL)"
Write-Host ""

if (-not (Get-Cloudflared)) {
    Read-Host "Enter para salir"
    exit 1
}

$url = Ensure-SigecomCloudflareTunnel -AllowLogin
if (-not $url) {
    Read-Host "Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "=============================================="
Write-Host "  Tunel listo. URL publica:"
Write-Host ""
Write-Host "      $url"
Write-Host ""
Write-Host "  Ahora ejecuta iniciar-red.bat para encender SIGeCom + el tunel."
Write-Host "  Esa URL no cambia en cada arranque (a diferencia del tunel rapido)."
Write-Host "=============================================="
Write-Host ""
Read-Host "Enter para cerrar"
