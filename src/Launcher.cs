using System;
using System.Drawing;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Portable host only: upstream animation and its interaction remain in web/.
internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string lockPath = Path.Combine(root, ".launcher.lock");
        try
        {
            using (var instanceLock = new FileStream(lockPath, FileMode.OpenOrCreate,
                FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose))
            {
                bool preview = args.Length == 1 && args[0] == "--preview";
                bool check = args.Length == 1 && args[0] == "--check";
                bool shortcut = args.Length == 1 && args[0] == "--create-shortcut";
                if (args.Length > 0 && !preview && !check && !shortcut)
                    throw new ArgumentException("Supported arguments: --preview, --check, --create-shortcut");
                string appId = File.ReadAllText(Path.Combine(root, "app-id.txt")).Trim();
                if (!Regex.IsMatch(appId, @"\A[A-Za-z0-9._-]+![A-Za-z0-9._-]+\z"))
                    throw new InvalidDataException("Invalid app-id.txt application identity.");
                if (shortcut)
                {
                    TaskbarShortcut.Create(root, appId);
                    return 0;
                }
                string runtime = CoreWebView2Environment.GetAvailableBrowserVersionString();
                if (check)
                {
                    File.WriteAllText(Path.Combine(root, "check-result.txt"),
                        "WebView2: " + runtime + Environment.NewLine + "App ID: " + appId + Environment.NewLine);
                    return 0;
                }
                // Match the Codex group without changing its package or pinned shortcut.
                Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(appId));
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var window = new LauncherWindow(root, appId, preview))
                    Application.Run(window);
            }
            return 0;
        }
        catch (IOException e)
        {
            MessageBox.Show("无法打开启动器文件，或本启动器已经在运行。\n\n" + e.Message,
                "Codex 启动动画", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        catch (Exception e)
        {
            // Application boundary: display the error; never install missing components.
            MessageBox.Show("启动器无法运行。未修改 Codex，可继续使用原来的入口。\n\n" + e.Message,
                "Codex 启动动画", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
}

internal sealed class LauncherWindow : Form
{
    private const string HostName = "codex-launcher.invalid";
    private const string PageUrl = "https://codex-launcher.invalid/index.html";
    private readonly string root;
    private readonly bool preview;
    private readonly IDesktopTarget desktopTarget;
    private readonly IAccountReader accountReader;
    private readonly WebView2 web = new WebView2();
    private bool closing;
    private bool handedOff;
    private bool browserReady;
    private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
    private Task<Rectangle> desktopReady;
    private Task<AccountInfo> accountReady;
    private bool desktopRequested;
    private Exception desktopFailure;
    private bool userMoved;

    internal LauncherWindow(string root, string appId, bool preview)
        : this(root, preview, new WindowsDesktopTarget(appId), new CodexAccountReader())
    {
        ((WindowsDesktopTarget)desktopTarget).WindowAvailable = delegate {
            if (WindowState != FormWindowState.Minimized && IsStartupForeground) { BringToFront(); Activate(); }
        };
    }

    internal LauncherWindow(string root, bool preview, IDesktopTarget desktopTarget)
        : this(root, preview, desktopTarget, null) { }

    internal LauncherWindow(string root, bool preview, IDesktopTarget desktopTarget, IAccountReader accountReader)
    {
        this.root = root;
        this.preview = preview;
        this.desktopTarget = desktopTarget;
        this.accountReader = accountReader;
        Text = preview ? "Codex 启动动画 · 仅预览" : "Codex 启动动画";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        // The shared AppUserModelID groups this window with Codex and permits restore after minimizing.
        ShowInTaskbar = true;
        ShowIcon = false;
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        StartPosition = FormStartPosition.Manual;
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        MaximizedBounds = area;
        Bounds = preview ? new Rectangle(area.X + area.Width / 10, area.Y + area.Height / 10,
            area.Width * 8 / 10, area.Height * 8 / 10) : desktopTarget.CurrentBounds ?? area;
        BackColor = Color.Black;
        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Color.Black;
        Controls.Add(web);
        ClientSizeChanged += delegate { FitLayout(); };
        FormClosing += delegate {
            closing = true;
            lifetime.Cancel();
            if (accountReader != null) accountReader.Dispose();
        };
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            // Preload immediately; account confirmation has its own independent gate.
            StartDesktop(false);
            // All browser data belongs to this tool; no default browser profile is used.
            var options = new CoreWebView2EnvironmentOptions(
                "--disable-background-networking --disable-component-update --no-first-run");
            var environment = await CoreWebView2Environment.CreateAsync(null,
                Path.Combine(root, "data", "webview2"), options);
            if (closing) return;
            await web.EnsureCoreWebView2Async(environment);
            if (closing) return;
            FitLayout();
            var core = web.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(HostName, Path.Combine(root, "web"),
                CoreWebView2HostResourceAccessKind.DenyCors);
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsNonClientRegionSupportEnabled = true;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += delegate(object sender, CoreWebView2WebResourceRequestedEventArgs request)
            {
                Uri uri = new Uri(request.Request.Uri);
                if (uri.Scheme == "https" && uri.Host == HostName && uri.IsDefaultPort) return;
                if (uri.Scheme == "data" || uri.Scheme == "blob") return;
                request.Response = environment.CreateWebResourceResponse(
                    new MemoryStream(), 403, "External resource blocked", "Content-Type: text/plain");
            };
            core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs navigation)
            {
                if (navigation.Uri != PageUrl) navigation.Cancel = true;
            };
            core.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs request)
            { request.Handled = true; };
            core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs request)
            { request.State = CoreWebView2PermissionState.Deny; };
            core.DownloadStarting += delegate(object sender, CoreWebView2DownloadStartingEventArgs download)
            { download.Cancel = true; };
            core.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs navigation)
            {
                if (navigation.IsSuccess && !closing) FitLayout();
                if (!navigation.IsSuccess && !closing)
                {
                    MessageBox.Show(this, "无法加载本地动画：" + navigation.WebErrorStatus,
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Close();
                }
            };
            core.WebMessageReceived += OnWebMessage;
            await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__CODEX_STAGED__ = true; window.__CODEX_NATIVE_MODE__ = " + (preview ? "false" : "true") + ";");
            if (closing) return;
            core.Navigate(PageUrl);
        }
        catch (Exception error)
        {
            if (closing) return;
            MessageBox.Show(this, "无法打开动画窗口。\n\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private async void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (closing || handedOff || e.Source != PageUrl) return;
        try
        {
            string message = e.TryGetWebMessageAsString();
            if (message == "close-launcher") { Close(); return; }
            if (message == "minimize-launcher")
            {
                userMoved = true;
                WindowState = FormWindowState.Minimized;
                return;
            }
            if (message == "toggle-maximize-launcher")
            {
                userMoved = true;
                MaximizedBounds = Screen.FromHandle(Handle).WorkingArea;
                WindowState = WindowState == FormWindowState.Maximized
                    ? FormWindowState.Normal : FormWindowState.Maximized;
                return;
            }
            if (message == "account-request")
            {
                if (accountReady == null)
                {
                    accountReady = accountReader == null ? Task.FromResult(new AccountInfo { status = "manual" })
                        : Task.Run(() => accountReader.ReadAsync(lifetime.Token));
                    MonitorAccount();
                }
                return;
            }
            if (message == "desktop-request") { StartDesktop(true); return; }
            if (message == "animation-error")
            {
                MessageBox.Show(this, "动画发生错误。Codex 可能已在后台打开，可直接使用原入口。",
                    Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }
            if (message == "animation-started")
            {
                browserReady = true;
                PublishWindowState();
                PublishDesktopReady();
                PublishAccount();
                return;
            }
            if (message != "animation-done" && message != "animation-handoff") return;
            handedOff = true;
            if (preview)
            {
                Text = "Codex 启动动画 · 预览完成（未启动 Codex）";
                Close();
                return;
            }
            StartDesktop(true);
            await desktopReady;
            if (closing) return;
            using (var stream = new MemoryStream())
            {
                await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
                if (closing) return;
                stream.Position = 0;
                using (var frame = Image.FromStream(stream)) BackgroundImage = new Bitmap(frame);
            }
            BackgroundImageLayout = ImageLayout.Stretch;
            web.Visible = false;
            Update();
            // A background overlay fades in place without taking focus from another app.
            if (IsStartupForeground)
            {
                desktopTarget.Focus();
                // One ordinary Z-order raise for the fade, never HWND_TOPMOST.
                if (!SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0013))
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            var fade = Stopwatch.StartNew();
            while (fade.ElapsedMilliseconds < 780 && !closing)
            {
                double progress = Math.Min(1.0, fade.Elapsed.TotalMilliseconds / 780.0);
                Opacity = 1.0 - progress * progress * (3.0 - 2.0 * progress);
                await Task.Delay(16);
            }
            if (closing) return;
            Opacity = 0;
            Close();
        }
        catch (OperationCanceledException) { /* The user closed the overlay while waiting. */ }
        catch (Exception error)
        {
            if (closing) return;
            MessageBox.Show(this, "无法打开 Codex。请使用原来的 Codex 入口。\n\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private void FitLayout()
    {
        // Scale the entire composition, including CSS viewport units, as one canvas.
        if (web.CoreWebView2 != null)
        {
            using (var graphics = CreateGraphics())
            {
                double dpi = graphics.DpiX / 96.0;
                web.ZoomFactor = Math.Max(0.25, Math.Min(1.0,
                    Math.Min(ClientSize.Width / (1440.0 * dpi), ClientSize.Height / (900.0 * dpi))));
            }
            PublishWindowState();
        }
    }

    private void PublishWindowState()
    {
        if (!browserReady || closing) return;
        web.CoreWebView2.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(new {
            type = "window-state", maximized = WindowState == FormWindowState.Maximized,
            scale = 1.0 / web.ZoomFactor
        }));
    }

    private void StartDesktop(bool requested)
    {
        desktopRequested |= requested;
        if (desktopReady != null)
        {
            if (desktopRequested && desktopFailure != null) ShowDesktopFailure();
            return;
        }
        desktopReady = preview ? Task.FromResult(Bounds) : desktopTarget.PrepareAsync(lifetime.Token);
        MonitorDesktop();
    }

    private async void MonitorDesktop()
    {
        try
        {
            Rectangle desktopBounds = await desktopReady;
            if (closing) return;
            if (!preview)
            {
                if (!userMoved) Bounds = desktopBounds;
                if (WindowState != FormWindowState.Minimized && IsStartupForeground) { BringToFront(); Activate(); web.Focus(); }
            }
            PublishDesktopReady();
        }
        catch (OperationCanceledException) { /* Closing the startup window cancels this wait. */ }
        catch (Exception error)
        {
            if (closing) return;
            desktopFailure = error;
            if (desktopRequested) ShowDesktopFailure();
        }
    }

    private void ShowDesktopFailure()
    {
        var choice = MessageBox.Show(this, "尚未检测到 Codex 会话输入框。\n\n" + desktopFailure.Message +
            "\n\n重试：继续等待。取消：退出启动器，直接查看 Codex。", Text,
            MessageBoxButtons.RetryCancel, MessageBoxIcon.Information);
        if (choice == DialogResult.Retry)
        {
            desktopReady = null;
            desktopFailure = null;
            StartDesktop(true);
        }
        else Close();
    }

    private void PublishDesktopReady()
    {
        if (browserReady && desktopReady != null && desktopReady.Status == TaskStatus.RanToCompletion)
            web.CoreWebView2.PostWebMessageAsString("desktop-ready");
    }

    private bool IsStartupForeground
    {
        get
        {
            if (WindowState == FormWindowState.Minimized) return false;
            if (GetForegroundWindow() == Handle) return true;
            var target = desktopTarget as WindowsDesktopTarget;
            return target != null && target.IsForeground;
        }
    }

    protected override void WndProc(ref Message message)
    {
        // Native app-region dragging enters the normal Windows move loop.
        if (message.Msg == 0x0231) userMoved = true; // WM_ENTERSIZEMOVE
        base.WndProc(ref message);
        if (message.Msg == 0x0232 && !closing && WindowState == FormWindowState.Normal) // WM_EXITSIZEMOVE
        {
            Point pointer = Cursor.Position;
            Screen screen = Screen.FromPoint(pointer);
            // Borderless windows need an explicit top-edge snap after the drag ends.
            if (pointer.Y >= screen.Bounds.Top && pointer.Y <= screen.Bounds.Top + 8)
            {
                userMoved = true;
                MaximizedBounds = screen.WorkingArea;
                WindowState = FormWindowState.Maximized;
            }
        }
    }

    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(
        IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);

    private async void MonitorAccount()
    {
        try { await accountReady; if (!closing) PublishAccount(); }
        catch (OperationCanceledException) { /* Closing cancels the short-lived account query. */ }
        catch (Exception)
        {
            if (closing) return;
            accountReady = Task.FromResult(new AccountInfo { status = "unavailable", reason = "账户服务未能完成读取" });
            PublishAccount();
        }
    }

    private void PublishAccount()
    {
        if (browserReady && accountReady != null && accountReady.Status == TaskStatus.RanToCompletion)
            web.CoreWebView2.PostWebMessageAsJson(new JavaScriptSerializer().Serialize(accountReady.Result));
    }

    internal static uint ActivateCodex(string appId)
    {
        var manager = (IApplicationActivationManager)new ApplicationActivationManager();
        try
        {
            uint processId;
            int result = manager.ActivateApplication(appId, null, 0, out processId);
            Marshal.ThrowExceptionForHR(result);
            return processId;
        }
        finally { Marshal.ReleaseComObject(manager); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            if (accountReader != null) accountReader.Dispose();
            web.Dispose();
            if (BackgroundImage != null) BackgroundImage.Dispose();
            lifetime.Dispose();
        }
        base.Dispose(disposing);
    }

    [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    private class ApplicationActivationManager { }

    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
        [PreserveSig]
        int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
        [PreserveSig]
        int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            IntPtr itemArray, out uint processId);
    }
}

