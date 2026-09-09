# Apaga API (8000), web (5173) y Cloudflare Tunnel

function Stop-Port([int]$Port) {
    $lines = netstat -ano | Select-String ":$Port\s+.+LISTENING"
    foreach ($line in $lines) {
        $procId = ($line.ToString().Trim() -split "\s+")[-1]
        if ($procId -match "^\d+$") {
            Write-Host "Cerrando PID $procId (puerto $Port)"
            & taskkill /F /PID $procId > $null 2>&1
        }
    }
}

Write-Host "Deteniendo Mesa de Ayuda..."
Stop-Port 8000
Stop-Port 5173
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Cerrando Cloudflare Tunnel (PID $($_.Id))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Write-Host "Listo."
Start-Sleep -Seconds 2
