# Minimaler statischer Webserver fuer den Prototyp (keine Installation noetig).
# Nimmt ausserdem Screenshots aus dem Spiel (Taste P) per POST /__shot entgegen
# und speichert sie im Ordner "screenshots".
param(
  [int]$Port = 8080,
  [switch]$Open
)

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$shots = Join-Path $root 'screenshots'
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Server laeuft auf http://localhost:$Port/  (Strg+C beendet)"
if ($Open) { Start-Process "http://localhost:$Port/" }

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(200)) { }
    $ctx = $task.Result
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

      if ($req.HttpMethod -eq 'POST' -and $path -eq '/__shot') {
        $name = [System.IO.Path]::GetFileName($req.QueryString['name'])
        if (-not $name -or -not $name.EndsWith('.png')) { $name = "shot-$(Get-Date -Format 'yyyyMMdd-HHmmss').png" }
        New-Item -ItemType Directory -Force -Path $shots | Out-Null
        $fs = [System.IO.File]::Create((Join-Path $shots $name))
        $req.InputStream.CopyTo($fs)
        $fs.Close()
        Write-Host "Screenshot gespeichert: screenshots\$name"
        $res.StatusCode = 200
        $res.Close()
        continue
      }

      $rel = $path.TrimStart('/')
      if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $rel))
      if (-not $file.StartsWith($root) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $res.StatusCode = 404
        $res.Close()
        continue
      }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
    } catch {
      Write-Host "Fehler: $_"
      try { $res.StatusCode = 500; $res.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
