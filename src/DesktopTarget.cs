using System;
using System.ComponentModel;
using System.Drawing;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

internal interface IDesktopTarget
{
    Rectangle? CurrentBounds { get; }
    Task<Rectangle> PrepareAsync(CancellationToken cancellation);
    void Focus();
}

internal sealed class WindowsDesktopTarget : IDesktopTarget
{
    private readonly string appId;
    private IntPtr window;
    private readonly int waitSeconds;
    private readonly bool deferTimeout;
    private Stopwatch waitClock;
    internal Action<IntPtr, Rectangle?> WindowAvailable;
    internal WindowsDesktopTarget(string appId, int waitSeconds = 300, bool deferTimeout = false)
    { this.appId = appId; this.waitSeconds = waitSeconds; this.deferTimeout = deferTimeout; }
    internal void BeginWaiting(bool restart = false)
    { if (restart || waitClock == null) waitClock = Stopwatch.StartNew(); }
    internal bool HasTimedOut { get { return waitClock != null && waitClock.Elapsed.TotalSeconds >= waitSeconds; } }
    internal bool IsForeground { get { return GetForegroundWindow() == window && window != IntPtr.Zero; } }

    public Rectangle? CurrentBounds
    {
        get
        {
            window = FindWindow(0);
            return ReadBounds(window);
        }
    }
    public async Task<Rectangle> PrepareAsync(CancellationToken cancellation)
    {
        if (!deferTimeout) BeginWaiting();
        IntPtr notifiedWindow = IntPtr.Zero;
        Exception windowFailure = null;
        Action<IntPtr> notify = delegate(IntPtr candidate) {
            window = candidate;
            notifiedWindow = candidate;
            if (WindowAvailable != null) WindowAvailable(candidate, ReadBounds(candidate));
        };
        // Observe creation/show/geometry before activation, instead of waiting for the
        // next polling tick after Codex has already appeared in front of the overlay.
        WinEventProc observer = delegate(IntPtr hook, uint kind, IntPtr candidate,
            int objectId, int childId, uint thread, uint time) {
            if (objectId != 0 || childId != 0 || windowFailure != null ||
                (kind != 0x8000 && kind != 0x8002 && kind != 0x800B)) return;
            if (!IsTargetWindow(candidate, 0, false)) return;
            try { notify(candidate); }
            catch (Exception error) { windowFailure = error; } // Report at the async host boundary.
        };
        var observerRoot = GCHandle.Alloc(observer);
        IntPtr subscription = SetWinEventHook(0x8000, 0x800B, IntPtr.Zero, observer, 0, 0, 2);
        if (subscription == IntPtr.Zero)
        {
            observerRoot.Free();
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        try
        {
            window = FindWindow(0);
            if (window != IntPtr.Zero) notify(window);
            uint processId = await Task.Run(() => LauncherWindow.ActivateCodex(appId), cancellation);
            Rectangle lastBounds = Rectangle.Empty;
            DateTime stableSince = DateTime.UtcNow;
            DateTime composerSince = DateTime.MinValue;
            IntPtr previousWindow = IntPtr.Zero;
            Task<bool> conversationProbe = null;
            while (!HasTimedOut)
            {
                cancellation.ThrowIfCancellationRequested();
                if (windowFailure != null)
                    throw new InvalidOperationException("无法衔接 Codex 启动窗口：" + windowFailure.Message, windowFailure);
                window = FindWindow(processId);
                if (window != IntPtr.Zero && notifiedWindow != window) notify(window);
                if (window != previousWindow)
                {
                    previousWindow = window;
                    stableSince = DateTime.UtcNow;
                    composerSince = DateTime.MinValue;
                    conversationProbe = null;
                }
                RECT rectangle;
                UIntPtr response;
                if (window != IntPtr.Zero && GetWindowRect(window, out rectangle) &&
                    SendMessageTimeout(window, 0, UIntPtr.Zero, IntPtr.Zero, 2, 150, out response) != IntPtr.Zero)
                {
                    var bounds = Rectangle.FromLTRB(rectangle.Left, rectangle.Top, rectangle.Right, rectangle.Bottom);
                    if (bounds.Width >= 400 && bounds.Height >= 300)
                    {
                        if (bounds != lastBounds) { lastBounds = bounds; stableSince = DateTime.UtcNow; }
                        // A responsive shell alone is insufficient: wait for the composer too.
                        if ((DateTime.UtcNow - stableSince).TotalMilliseconds >= 900)
                        {
                            if (conversationProbe == null)
                            {
                                IntPtr candidate = window;
                                conversationProbe = Task.Run(() => ConversationReadiness.IsReady(candidate));
                            }
                            if (conversationProbe.IsCompleted)
                            {
                                if (await conversationProbe)
                                {
                                    if (composerSince == DateTime.MinValue) composerSince = DateTime.UtcNow;
                                    if ((DateTime.UtcNow - composerSince).TotalMilliseconds >= 900) return bounds;
                                }
                                else composerSince = DateTime.MinValue;
                                conversationProbe = null;
                            }
                        }
                    }
                }
                else { stableSince = DateTime.UtcNow; composerSince = DateTime.MinValue; lastBounds = Rectangle.Empty; }
                await Task.Delay(window == IntPtr.Zero ? 40 : 350, cancellation);
            }
            throw new TimeoutException("确认账户后等待 " + waitSeconds + " 秒仍未检测到 Codex 会话输入框。可继续等待，或退出启动器直接查看 Codex。");
        }
        finally
        {
            if (!UnhookWinEvent(subscription)) throw new Win32Exception(Marshal.GetLastWin32Error());
            observerRoot.Free();
        }
    }

    private static Rectangle? ReadBounds(IntPtr candidate)
    {
        RECT rectangle;
        if (candidate == IntPtr.Zero || IsIconic(candidate) || !GetWindowRect(candidate, out rectangle)) return null;
        var bounds = Rectangle.FromLTRB(rectangle.Left, rectangle.Top, rectangle.Right, rectangle.Bottom);
        return bounds.Width >= 600 && bounds.Height >= 400 ? (Rectangle?)bounds : null;
    }

    private IntPtr FindWindow(uint activatedProcessId)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr candidate, IntPtr parameter)
        {
            if (!IsTargetWindow(candidate, activatedProcessId, true)) return true;
            found = candidate;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    private bool IsTargetWindow(IntPtr candidate, uint activatedProcessId, bool requireVisible)
    {
        if (candidate == IntPtr.Zero || (requireVisible && !IsWindowVisible(candidate)) ||
            GetWindow(candidate, 4) != IntPtr.Zero) return false;
        var className = new StringBuilder(128);
        GetClassName(candidate, className, className.Capacity);
        if (!className.ToString().StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal)) return false;
        uint processId;
        GetWindowThreadProcessId(candidate, out processId);
        if (processId != activatedProcessId)
        {
            IntPtr process = OpenProcess(0x1000, false, processId);
            if (process == IntPtr.Zero) return false;
            try
            {
                uint length = 512;
                var identity = new StringBuilder((int)length);
                if (GetApplicationUserModelId(process, ref length, identity) != 0 || identity.ToString() != appId)
                    return false;
            }
            finally { CloseHandle(process); }
        }
        int cloaked;
        if (DwmGetWindowAttribute(candidate, 14, out cloaked, 4) == 0 && cloaked != 0) return false;
        return true;
    }

    public void Focus()
    {
        if (window == IntPtr.Zero || !IsWindow(window)) throw new InvalidOperationException("Codex 窗口已关闭。");
        if (IsIconic(window)) ShowWindowAsync(window, 9);
        if (!SetWindowPos(window, IntPtr.Zero, 0, 0, 0, 0, 0x0013))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        SetForegroundWindow(window);
    }

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);
    private delegate void WinEventProc(IntPtr hook, uint kind, IntPtr window, int objectId, int childId, uint thread, uint time);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWinEventHook(
        uint minimum, uint maximum, IntPtr module, WinEventProc observer, uint processId, uint threadId, uint flags);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnhookWinEvent(IntPtr hook);
    [StructLayout(LayoutKind.Sequential)] private struct RECT { internal int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder name, int capacity);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr window, out RECT rectangle);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr response);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, uint attribute, out int value, int size);
    [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetApplicationUserModelId(IntPtr process, ref uint length, StringBuilder identity);
}
