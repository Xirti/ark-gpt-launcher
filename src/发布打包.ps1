param([ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version = '1.1.0')

$ErrorActionPreference = 'Stop'
$project = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
& (Join-Path $PSScriptRoot '构建.ps1')

$dist = Join-Path $project 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$zipPath = Join-Path $dist "ArkGPTLauncher-v$Version-win-x64.zip"
if (Test-Path -LiteralPath $zipPath) { throw "Release already exists: $zipPath" }
$staging = Join-Path $dist ('.package-' + [Guid]::NewGuid().ToString('N'))
$package = Join-Path $staging 'ArkGPTLauncher'
New-Item -ItemType Directory -Path $package -Force | Out-Null

try {
    # Explicit runtime allowlist; never copy the working directory as a whole.
    foreach ($name in @('CodexLauncher.exe', 'app-id.txt', 'launcher-settings.json', '预览.cmd',
        'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll',
        'WebView2Loader.dll', 'README.md', 'LICENSE', 'licenses')) {
        Copy-Item -LiteralPath (Join-Path $project $name) -Destination $package -Recurse
    }
    foreach ($name in @('index.html', 'bridge.js', 'config.js',
        'dsh-startup\splash.js', 'dsh-startup\splash.css',
        'dsh-startup\asset\montserrat-latin.woff2',
        'dsh-startup\asset\line-1.mp3', 'dsh-startup\asset\line-2.mp3',
        'dsh-startup\asset\line-3.mp3', 'dsh-startup\asset\line-4.mp3',
        'dsh-startup\asset\line-5.mp3', 'dsh-startup\asset\line-6.mp3',
        'dsh-startup\asset\sfx-tick.mp3', 'dsh-startup\asset\sfx-ticks-run.mp3')) {
        $target = Join-Path (Join-Path $package 'web') $name
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path (Join-Path $project 'web') $name) -Destination $target
    }
    $hashes = @(foreach ($file in Get-ChildItem -LiteralPath $package -File -Recurse | Sort-Object FullName) {
        (Get-FileHash -LiteralPath $file.FullName).Hash.ToLowerInvariant() + '  ' +
            $file.FullName.Substring($package.Length + 1).Replace('\', '/')
    })
    [IO.File]::WriteAllLines((Join-Path $package 'SHA256.txt'), $hashes, [Text.UTF8Encoding]::new($false))
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($package, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true)
    $zipHash = (Get-FileHash -LiteralPath $zipPath).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'),
        $zipHash + '  ' + [IO.Path]::GetFileName($zipPath) + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false))
    Write-Output $zipPath
}
finally {
    # Remove only this invocation's generated directory inside dist.
    $resolved = [IO.Path]::GetFullPath($staging)
    if (-not $resolved.StartsWith($dist + '\.package-', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing cleanup outside package staging directory'
    }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
