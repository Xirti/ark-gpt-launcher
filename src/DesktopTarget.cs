using System;
using System.ComponentModel;
using System.Drawing;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

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
    // A timed-out wait cannot interrupt synchronous UIA. Keep its one worker
    // owned by the target, so retries cannot accumulate blocked calls.
    private readonly object probeGate = new object();
    private Task<bool> inFlightProbe;
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
    public Task<Rectangle> PrepareAsync(CancellationToken cancellation)
    { return PrepareAsync(cancellation, null); }

    internal async Task<Rectangle> PrepareAsync(CancellationToken cancellation, Rectangle? previousReadyBounds)
    {
        cancellation.ThrowIfCancellationRequested();
        if (!deferTimeout) BeginWaiting();
        IntPtr notifiedWindow = IntPtr.Zero;
        Rectangle? notifiedBounds = null;
        var notificationContext = SynchronizationContext.Current;
        bool observerStopped = false, notificationPending = false;
        IntPtr pendingWindow = IntPtr.Zero;
        Exception windowFailure = null;
        Action<IntPtr> notify = delegate(IntPtr candidate) {
            Rectangle? bounds = ReadBounds(candidate);
            window = candidate;
            if (notifiedWindow == candidate && notifiedBounds == bounds) return;
            notifiedWindow = candidate;
            notifiedBounds = bounds;
            if (WindowAvailable != null) WindowAvailable(candidate, bounds);
        };
        // Observe creation/show/geometry before activation, instead of waiting for the
        // next polling tick after Codex has already appeared in front of the overlay.
        WinEventProc observer = delegate(IntPtr hook, uint kind, IntPtr candidate,
            int objectId, int childId, uint thread, uint time) {
            if (objectId != 0 || childId != 0 || windowFailure != null ||
                (kind != 0x8000 && kind != 0x8002 && kind != 0x800B)) return;
            if (!IsTargetWindow(candidate, 0, false)) return;
            if (candidate != window && IsTargetWindow(window, 0, true)) return;
            pendingWindow = candidate;
            if (notificationPending) return;
            notificationPending = true;
            // Leave the native callback before touching WinForms. Coalesce queued
            // events and read geometry in the UI context, without native reentrancy.
            notificationContext.Post(delegate {
                notificationPending = false;
                if (observerStopped || cancellation.IsCancellationRequested || windowFailure != null) return;
                try {
                    if (pendingWindow != window && IsTargetWindow(window, 0, true)) return;
                    if (IsTargetWindow(pendingWindow, 0, false)) notify(pendingWindow);
                }
                catch (Exception error) { windowFailure = error; } // Report at the async host boundary.
            }, null);
        };
        GCHandle observerRoot = default(GCHandle);
        IntPtr subscription = IntPtr.Zero;
        // Native event subscriptions must be removed on their registration thread.
        // Only use them with the WinForms UI context; console callers use polling.
        if (notificationContext is WindowsFormsSynchronizationContext)
        {
            observerRoot = GCHandle.Alloc(observer);
            subscription = SetWinEventHook(0x8000, 0x800B, IntPtr.Zero, observer, 0, 0, 2);
            if (subscription == IntPtr.Zero)
            {
                int error = Marshal.GetLastWin32Error();
                observerRoot.Free();
                throw new Win32Exception(error);
            }
        }
        try
        {
            IntPtr previousReadyWindow = window;
            window = FindWindow(0);
            if (window != IntPtr.Zero) notify(window);
            uint processId;
            if (window != IntPtr.Zero && !IsIconic(window)) GetWindowThreadProcessId(window, out processId);
            else processId = await Task.Run(() => LauncherWindow.ActivateCodex(appId), cancellation);
            // A handoff recheck always probes the live composer again. Preserve
            // only the prior settling period for the same window and geometry;
            // any negative probe or window/bounds change restores normal settling.
            bool rechecking = previousReadyBounds.HasValue && window != IntPtr.Zero && window == previousReadyWindow;
            Rectangle lastBounds = rechecking ? previousReadyBounds.Value : Rectangle.Empty;
            var settleClock = Stopwatch.StartNew();
            long stableSince = rechecking ? -900 : 0;
            long? composerSince = rechecking ? (long?)stableSince : null;
            IntPtr previousWindow = rechecking ? window : IntPtr.Zero;
            Task<bool> conversationProbe = null;
            IntPtr probeWindow = IntPtr.Zero;
            int readinessVersion = 0, probeVersion = -1;
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
                    stableSince = settleClock.ElapsedMilliseconds;
                    composerSince = null;
                    lastBounds = Rectangle.Empty;
                    readinessVersion++;
                }
                IntPtr observedWindow = window;
                RECT rectangle = default(RECT);
                bool usable = observedWindow != IntPtr.Zero && !IsIconic(observedWindow) &&
                    GetWindowRect(observedWindow, out rectangle);
                if (usable)
                {
                    var bounds = Rectangle.FromLTRB(rectangle.Left, rectangle.Top, rectangle.Right, rectangle.Bottom);
                    if (bounds.Width >= 400 && bounds.Height >= 300)
                    {
                        if (bounds != lastBounds)
                        {
                            lastBounds = bounds;
                            stableSince = settleClock.ElapsedMilliseconds;
                            composerSince = null;
                            readinessVersion++;
                        }
                        // A responsive shell alone is insufficient: wait for the composer too.
                        // Preload warms the app and tracks its owner, but readiness is
                        // evaluated only when the account confirmation requests it.
                        if ((!deferTimeout || waitClock != null) &&
                            settleClock.ElapsedMilliseconds - stableSince >= 900)
                        {
                            if (conversationProbe == null)
                            {
                                lock (probeGate)
                                {
                                    if (inFlightProbe != null && inFlightProbe.IsCompleted)
                                    {
                                        Task<bool> previousProbe = inFlightProbe;
                                        inFlightProbe = null;
                                        // Observe failures, but never reuse readiness from an old wait.
                                        previousProbe.GetAwaiter().GetResult();
                                    }
                                    if (inFlightProbe == null)
                                    {
                                        IntPtr candidate = observedWindow;
                                        probeWindow = candidate;
                                        probeVersion = readinessVersion;
                                        conversationProbe = Task.Run(() => {
                                            UIntPtr response;
                                            return SendMessageTimeout(candidate, 0, UIntPtr.Zero, IntPtr.Zero, 2, 150, out response) != IntPtr.Zero &&
                                                ConversationReadiness.IsReady(candidate);
                                        });
                                        inFlightProbe = conversationProbe;
                                    }
                                }
                            }
                            if (conversationProbe != null && conversationProbe.IsCompleted)
                            {
                                lock (probeGate)
                                {
                                    if (inFlightProbe == conversationProbe) inFlightProbe = null;
                                }
                                bool available = await conversationProbe;
                                conversationProbe = null;
                                if (probeVersion == readinessVersion && probeWindow == window)
                                {
                                    if (available)
                                    {
                                        if (!composerSince.HasValue) composerSince = settleClock.ElapsedMilliseconds;
                                        if (settleClock.ElapsedMilliseconds - composerSince.Value >= 900) return bounds;
                                    }
                                    else composerSince = null;
                                }
                            }
                        }
                    }
                    else usable = false;
                }
                if (!usable)
                {
                    stableSince = settleClock.ElapsedMilliseconds;
                    composerSince = null;
                    if (lastBounds != Rectangle.Empty) readinessVersion++;
                    lastBounds = Rectangle.Empty;
                }
                await Task.Delay(window == IntPtr.Zero ? 40 : 350, cancellation);
            }
            throw new TimeoutException("确认账户后等待 " + waitSeconds + " 秒仍未检测到 Codex 会话输入框。可继续等待，或退出启动器直接查看 Codex。");
        }
        finally
        {
            observerStopped = true;
            if (subscription != IntPtr.Zero)
            {
                if (!UnhookWinEvent(subscription)) throw new Win32Exception(Marshal.GetLastWin32Error());
                observerRoot.Free();
            }
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
        if (IsTargetWindow(window, activatedProcessId, true)) return window;
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
        if (candidate == IntPtr.Zero || GetAncestor(candidate, 2) != candidate ||
            (GetWindowLongPtr(candidate, -20).ToInt64() & 0x80) != 0 ||
            (requireVisible && !IsWindowVisible(candidate)) ||
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
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
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
