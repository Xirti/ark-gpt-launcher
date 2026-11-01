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
                var settings = LauncherSettings.Read(root);
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
                using (var window = new LauncherWindow(root, appId, preview, settings))
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
    private readonly LauncherSettings settings;
    private readonly WebView2 web = new WebView2();
    private bool closing;
    private enum HandoffPhase { Idle, WaitingForDesktop, Retiring }
    private HandoffPhase handoffPhase;
    private bool browserReady;
    private bool animationFailureShown;
    private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
    private Task<Rectangle> desktopReady;
    private TaskCompletionSource<Rectangle> handoffReady = new TaskCompletionSource<Rectangle>();
    private Task<AccountInfo> accountReady;
    private bool desktopRequested;
    private Exception desktopFailure;
    private bool desktopFailureShown;
    private bool userMoved;
    private IntPtr desktopOwner;
    private RetirementWindow retirementWindow;
    internal LauncherWindow(string root, string appId, bool preview)
        : this(root, appId, preview, LauncherSettings.Read(root)) { }

    internal LauncherWindow(string root, string appId, bool preview, LauncherSettings settings)
        : this(root, preview, new WindowsDesktopTarget(appId, settings.desktopWaitSeconds, true),
            new CodexAccountReader(timeoutMs: settings.accountWaitSeconds * 1000), settings)
    {
        ((WindowsDesktopTarget)desktopTarget).WindowAvailable = delegate(IntPtr owner, Rectangle? bounds) {
            AttachDesktopOwner(owner);
            if (!userMoved && bounds.HasValue && Bounds != bounds.Value) Bounds = bounds.Value;
            if (WindowState != FormWindowState.Minimized && IsStartupForeground && GetForegroundWindow() != Handle)
            { BringToFront(); Activate(); }
        };
    }

    internal LauncherWindow(string root, bool preview, IDesktopTarget desktopTarget)
        : this(root, preview, desktopTarget, null, new LauncherSettings()) { }

    internal LauncherWindow(string root, bool preview, IDesktopTarget desktopTarget, IAccountReader accountReader)
        : this(root, preview, desktopTarget, accountReader, new LauncherSettings()) { }

    internal LauncherWindow(string root, bool preview, IDesktopTarget desktopTarget, IAccountReader accountReader, LauncherSettings settings)
    {
        this.root = root;
        this.preview = preview;
        this.desktopTarget = desktopTarget;
        this.accountReader = accountReader;
        this.settings = settings;
        DoubleBuffered = true;
        Text = preview ? "Codex 启动动画 · 仅预览" : "Codex 启动动画";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        // Only Codex gets a taskbar button. Preview has no owner and needs its own entry.
        ShowInTaskbar = preview;
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
            handoffReady.TrySetCanceled();
            if (accountReader != null) accountReader.Dispose();
        };
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        try
        {
            // Preload immediately; account confirmation has its own independent gate.
            StartAccount();
            StartDesktop(false);
            // All browser data belongs to this tool; no default browser profile is used.
            var options = new CoreWebView2EnvironmentOptions(
                "--disable-background-networking --disable-component-update --no-first-run");
            var environment = await CoreWebView2Environment.CreateAsync(null,
                Path.Combine(root, "data", "webview2"), options);
            if (closing || animationFailureShown) return;
            await web.EnsureCoreWebView2Async(environment);
            if (closing || animationFailureShown) return;
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
            core.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs failure)
            {
                if (failure.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited ||
                    failure.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited) FailAnimation();
            };
            core.NavigationCompleted += async delegate(object sender, CoreWebView2NavigationCompletedEventArgs navigation)
            {
                if (navigation.IsSuccess && !closing)
                {
                    try
                    {
                        // Successful HTML navigation does not guarantee that its
                        // required scripts loaded or initialized the native bridge.
                        string initialized = await core.ExecuteScriptAsync(
                            "!!window.__DSH_STARTUP_API__ && typeof window.__CODEX_START_DESKTOP__ === 'function' && " +
                            "Array.from(document.styleSheets).some(s => s.href && new URL(s.href).pathname === '/dsh-startup/splash.css' && s.cssRules.length > 0)");
                        if (!closing)
                        {
                            if (initialized != "true") FailAnimation();
                            else FitLayout();
                        }
                    }
                    catch (Exception) { if (!closing) FailAnimation(); }
                }
                if (!navigation.IsSuccess && !closing)
                {
                    MessageBox.Show(this, "无法加载本地动画：" + navigation.WebErrorStatus,
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    Close();
                }
            };
            core.WebMessageReceived += OnWebMessage;
            await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__CODEX_STAGED__ = true; window.__CODEX_NATIVE_MODE__ = " + (preview ? "false" : "true") + ";");
            if (closing || animationFailureShown) return;
            core.Navigate(PageUrl);
        }
        catch (Exception error)
        {
            if (closing || animationFailureShown) return;
            MessageBox.Show(this, "无法打开动画窗口。\n\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private async void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (closing || e.Source != PageUrl) return;
        try
        {
            string message = e.TryGetWebMessageAsString();
            if (message == "close-launcher") { Close(); return; }
            if (message == "animation-error") { FailAnimation(); return; }
            if (animationFailureShown) return;
            if (message == "minimize-launcher" && handoffPhase != HandoffPhase.Retiring)
            {
                userMoved = true;
                if (preview) WindowState = FormWindowState.Minimized;
                else if (desktopOwner != IntPtr.Zero && IsWindow(desktopOwner))
                {
                    // Owned overlays hide/restore with the owner. Do not separately
                    // minimize this overlay, which has no taskbar restore entry.
                    if (!ShowWindowAsync(desktopOwner, 6))
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
                }
                return;
            }
            if (message == "toggle-maximize-launcher" && handoffPhase != HandoffPhase.Retiring)
            {
                userMoved = true;
                MaximizedBounds = Screen.FromHandle(Handle).WorkingArea;
                WindowState = WindowState == FormWindowState.Maximized
                    ? FormWindowState.Normal : FormWindowState.Maximized;
                return;
            }
            if (handoffPhase != HandoffPhase.Idle) return;
            if (message == "account-request")
            {
                StartAccount();
                return;
            }
            if (message == "desktop-request") { StartDesktop(true); return; }
            if (message == "animation-started")
            {
                browserReady = true;
                PublishWindowState();
                PublishDesktopReady();
                PublishAccount();
                return;
            }
            if (message != "animation-done" && message != "animation-handoff") return;
            handoffPhase = HandoffPhase.WaitingForDesktop;
            if (preview)
            {
                Text = "Codex 启动动画 · 预览完成（未启动 Codex）";
                Close();
                return;
            }
            StartDesktop(true, true);
            // A failed readiness attempt can be retried. Await the overall outcome,
            // rather than retaining the failed attempt that opened the retry prompt.
            await handoffReady.Task;
            if (closing || animationFailureShown) return;
            handoffPhase = HandoffPhase.Retiring;
            PublishWindowState();
            Bitmap capturedFrame;
            using (var stream = new MemoryStream())
            {
                await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
                if (closing || animationFailureShown) return;
                stream.Position = 0;
                using (var image = Image.FromStream(stream)) capturedFrame = new Bitmap(image);
            }
            using (capturedFrame)
            using (var retirement = new RetirementWindow(capturedFrame, Bounds))
            {
                retirementWindow = retirement;
                retirement.FormClosed += delegate {
                    if (!closing && retirement.Alpha > 0)
                        BeginInvoke(new Action(delegate { if (!closing) Close(); }));
                };
                bool wasForeground = IsStartupForeground;
                retirement.PrepareBehind(Handle, desktopOwner);
                if (closing || animationFailureShown) return;
                // Keep the browser's HWND and renderer intact; hide the complete
                // host only after the independent GDI frame is already committed.
                Hide();
                var fade = Stopwatch.StartNew();
                while (!closing && !animationFailureShown)
                {
                    // The final delay can outlive both the fade and its window.
                    if (retirement.IsDisposed) { Close(); return; }
                    if (fade.ElapsedMilliseconds >= settings.fadeMilliseconds) break;
                    double progress = Math.Min(1.0, fade.Elapsed.TotalMilliseconds / settings.fadeMilliseconds);
                    double opacity = 1.0 - progress * progress * (3.0 - 2.0 * progress);
                    retirement.SetAlpha((byte)Math.Round(opacity * 255));
                    await Task.Delay(16);
                }
                if (closing || animationFailureShown) return;
                bool focusDesktop = wasForeground && IsStartupForeground;
                retirement.SetAlpha(0);
                if (focusDesktop) desktopTarget.Focus();
                retirementWindow = null;
            }
            Close();
        }
        catch (OperationCanceledException) { /* The user closed the overlay while waiting. */ }
        catch (Exception error)
        {
            if (closing || animationFailureShown) return;
            MessageBox.Show(this, "无法打开 Codex。请使用原来的 Codex 入口。\n\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private sealed class RetirementWindow : Form
    {
        internal byte Alpha { get; private set; }
        internal RetirementWindow(Image frame, Rectangle bounds)
        {
            AutoScaleMode = AutoScaleMode.None;
            StartPosition = FormStartPosition.Manual;
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            ShowIcon = false;
            DoubleBuffered = true;
            BackColor = Color.Black;
            BackgroundImage = frame;
            BackgroundImageLayout = ImageLayout.Stretch;
            Bounds = bounds;
            // Create the GDI-only surface fully transparent. It is painted and put
            // behind the live host before the native alpha is raised to 255.
            Opacity = 0;
        }
        protected override bool ShowWithoutActivation { get { return true; } }
        internal void PrepareBehind(IntPtr host, IntPtr owner)
        {
            Show();
            if (owner != IntPtr.Zero)
            {
                SetLastError(0);
                IntPtr previous = SetWindowLongPtr(Handle, -8, owner);
                int error = Marshal.GetLastWin32Error();
                if (previous == IntPtr.Zero && error != 0)
                    throw new System.ComponentModel.Win32Exception(error);
            }
            if (!SetWindowPos(Handle, host, 0, 0, 0, 0, 0x0213)) // no move/size/activation/owner reorder
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            Refresh();
            if (!GdiFlush()) throw new InvalidOperationException("Unable to commit the retirement frame.");
            Marshal.ThrowExceptionForHR(DwmFlush());
            SetAlpha(255);
            Marshal.ThrowExceptionForHR(DwmFlush());
        }
        internal void SetAlpha(byte alpha)
        {
            if (!SetLayeredWindowAttributes(Handle, 0, alpha, 2))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            Alpha = alpha;
        }
    }

    private void FailAnimation()
    {
        if (closing || animationFailureShown) return;
        animationFailureShown = true;
        lifetime.Cancel();
        handoffReady.TrySetCanceled();
        // Leave WebView's event callback before entering a modal message loop.
        BeginInvoke(new Action(delegate {
            if (closing) return;
            MessageBox.Show(this, "动画发生错误。Codex 可能已在后台打开，可直接使用原入口。",
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }));
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
            canMinimize = handoffPhase != HandoffPhase.Retiring &&
                (preview || (desktopOwner != IntPtr.Zero && IsWindow(desktopOwner))),
            canMaximize = handoffPhase != HandoffPhase.Retiring,
            scale = 1.0 / web.ZoomFactor
        }));
    }

    private void StartDesktop(bool requested, bool recheck = false)
    {
        var target = desktopTarget as WindowsDesktopTarget;
        Rectangle? previousReadyBounds = null;
        if (recheck && target != null && desktopReady != null &&
            desktopReady.Status == TaskStatus.RanToCompletion)
        {
            // The welcome animation can outlive the first readiness result. A new
            // wait must not inherit its already-completed handoff signal.
            previousReadyBounds = desktopReady.Result;
            desktopReady = null;
            handoffReady = new TaskCompletionSource<Rectangle>();
        }
        if (requested && target != null) target.BeginWaiting(previousReadyBounds.HasValue);
        desktopRequested |= requested;
        if (desktopReady != null)
        {
            if (desktopRequested && desktopFailure != null) ShowDesktopFailure();
            return;
        }
        desktopReady = preview ? Task.FromResult(Bounds) : previousReadyBounds.HasValue
            ? target.PrepareAsync(lifetime.Token, previousReadyBounds)
            : desktopTarget.PrepareAsync(lifetime.Token);
        MonitorDesktop();
    }

    private async void MonitorDesktop()
    {
        try
        {
            Rectangle desktopBounds = await desktopReady;
            if (closing || animationFailureShown) return;
            if (!preview)
            {
                if (!userMoved) Bounds = desktopBounds;
                if (WindowState != FormWindowState.Minimized && IsStartupForeground) { BringToFront(); Activate(); web.Focus(); }
            }
            handoffReady.TrySetResult(desktopBounds);
            PublishDesktopReady();
        }
        catch (OperationCanceledException) { /* Closing the startup window cancels this wait. */ }
        catch (Exception error)
        {
            if (closing || animationFailureShown) return;
            desktopFailure = error;
            if (desktopRequested) ShowDesktopFailure();
        }
    }

    private void ShowDesktopFailure()
    {
        if (closing || desktopFailureShown) return;
        desktopFailureShown = true;
        DialogResult choice;
        try
        {
            choice = MessageBox.Show(this, "尚未检测到 Codex 会话输入框。\n\n" + desktopFailure.Message +
                "\n\n重试：继续等待。取消：退出启动器，直接查看 Codex。", Text,
                MessageBoxButtons.RetryCancel, MessageBoxIcon.Information);
        }
        finally { desktopFailureShown = false; }
        if (closing) return;
        if (choice == DialogResult.Retry)
        {
            var target = desktopTarget as WindowsDesktopTarget;
            if (target != null) target.BeginWaiting(true);
            desktopReady = null;
            desktopFailure = null;
            // Leave the current prompt stack before a synchronously failing retry.
            BeginInvoke(new Action(delegate { if (!closing) StartDesktop(true); }));
        }
        else Close();
    }

    private void PublishDesktopReady()
    {
        if (browserReady && handoffReady.Task.Status == TaskStatus.RanToCompletion)
            web.CoreWebView2.PostWebMessageAsString("desktop-ready");
    }

    private bool IsStartupForeground
    {
        get
        {
            if (WindowState == FormWindowState.Minimized ||
                (desktopOwner != IntPtr.Zero && IsIconic(desktopOwner))) return false;
            if (GetForegroundWindow() == Handle || (retirementWindow != null &&
                retirementWindow.IsHandleCreated && GetForegroundWindow() == retirementWindow.Handle)) return true;
            var target = desktopTarget as WindowsDesktopTarget;
            return target != null && target.IsForeground;
        }
    }

    internal void AttachDesktopOwner(IntPtr owner)
    {
        // Change only our window's owner, never the Codex window or package.
        if (GetWindow(Handle, 4) != owner)
        {
            SetLastError(0);
            IntPtr previous = SetWindowLongPtr(Handle, -8, owner); // GWLP_HWNDPARENT
            int error = Marshal.GetLastWin32Error();
            if (previous == IntPtr.Zero && error != 0)
                throw new System.ComponentModel.Win32Exception(error);
        }
        desktopOwner = owner;
        PublishWindowState();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (desktopOwner != IntPtr.Zero) AttachDesktopOwner(desktopOwner);
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
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("dwmapi.dll")] private static extern int DwmFlush();
    [DllImport("gdi32.dll")] private static extern bool GdiFlush();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetLayeredWindowAttributes(
        IntPtr window, uint key, byte alpha, uint flags);
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
    [DllImport("kernel32.dll")] private static extern void SetLastError(uint error);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(
        IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);

    private void StartAccount()
    {
        if (accountReady != null) return;
        CancellationToken cancellation = lifetime.Token;
        accountReady = accountReader == null ? Task.FromResult(new AccountInfo { status = "manual" })
            : Task.Run(() => accountReader.ReadAsync(cancellation));
        MonitorAccount();
    }

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
            if (retirementWindow != null) retirementWindow.Dispose();
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

