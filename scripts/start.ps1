# 启动本地开发服务器并打开浏览器
$port = 8080
$webDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'prototypes\web'
$url = "http://localhost:$port/main-app.html"

Write-Host "启动服务器: http://localhost:$port" -ForegroundColor Green
Write-Host "目录: $webDir" -ForegroundColor DarkGray
Write-Host "按 Ctrl+C 停止" -ForegroundColor Yellow

# 延迟 1 秒后打开浏览器，等服务器先启动
Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 1
    Start-Process $u
} -ArgumentList $url | Out-Null

python -m http.server $port --directory $webDir
