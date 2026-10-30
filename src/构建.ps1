$ErrorActionPreference = 'Stop'
# Offline rebuild. No installs, downloads, registry changes, or authentication calls.
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe'
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    & $compiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output /win32manifest:src\app.manifest /win32icon:web\dsh-startup\asset\launcher.ico /out:CodexLauncher.exe /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:WPF\UIAutomationClient.dll /r:WPF\UIAutomationTypes.dll /r:WPF\WindowsBase.dll src\Launcher.cs src\DesktopTarget.cs src\AccountReader.cs src\ConversationReadiness.cs src\TaskbarShortcut.cs
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. Close the launcher before rebuilding.' }
}
finally { Pop-Location }


