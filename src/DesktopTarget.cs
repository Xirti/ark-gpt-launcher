using System;
using System.ComponentModel;
using System.Drawing;
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
    internal Action<IntPtr> WindowAvailable;
    internal WindowsDesktopTarget(string appId) { this.appId = appId; }
    internal bool IsForeground { get { return GetForegroundWindow() == window && window != IntPtr.Zero; } }

    public Rectangle? CurrentBounds
    {
        get
        {
            window = FindWindow(0);
            RECT rectangle;
            if (window == IntPtr.Zero || IsIconic(window) || !GetWindowRect(window, out rectangle)) return null;
            var bounds = Rectangle.FromLTRB(rectangle.Left, rectangle.Top, rectangle.Right, rectangle.Bottom);
            return bounds.Width >= 600 && bounds.Height >= 400 ? (Rectangle?)bounds : null;
        }
    }
    public async Task<Rectangle> PrepareAsync(CancellationToken cancellation)
    {
        uint processId = await Task.Run(() => LauncherWindow.ActivateCodex(appId), cancellation);
        var deadline = DateTime.UtcNow.AddSeconds(90);
        Rectangle lastBounds = Rectangle.Empty;
        DateTime stableSince = DateTime.UtcNow;
        DateTime composerSince = DateTime.MinValue;
        IntPtr previousWindow = IntPtr.Zero;
        Task<bool> conversationProbe = null;
        IntPtr notifiedWindow = IntPtr.Zero;
        while (DateTime.UtcNow < deadline)
        {
            cancellation.ThrowIfCancellationRequested();
            window = FindWindow(processId);
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
                    if (notifiedWindow != window)
                    {
                        notifiedWindow = window;
                        if (WindowAvailable != null) WindowAvailable(window);
                    }
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
            await Task.Delay(350, cancellation);
        }
        throw new TimeoutException("90 秒内未检测到 Codex 会话输入框。可能需要登录，或此版本未提供可识别的界面信息。可直接查看 Codex。");
    }

    private IntPtr FindWindow(uint activatedProcessId)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr candidate, IntPtr parameter)
        {
            if (!IsWindowVisible(candidate) || GetWindow(candidate, 4) != IntPtr.Zero) return true;
            uint processId;
            GetWindowThreadProcessId(candidate, out processId);
            if (processId != activatedProcessId)
            {
                IntPtr process = OpenProcess(0x1000, false, processId);
                if (process == IntPtr.Zero) return true;
                try
                {
                    uint length = 512;
                    var identity = new StringBuilder((int)length);
                    if (GetApplicationUserModelId(process, ref length, identity) != 0 || identity.ToString() != appId)
                        return true;
                }
                finally { CloseHandle(process); }
            }
            int cloaked;
            if (DwmGetWindowAttribute(candidate, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
            var className = new StringBuilder(128);
            GetClassName(candidate, className, className.Capacity);
            if (!className.ToString().StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal)) return true;
            found = candidate;
            return false;
        }, IntPtr.Zero);
        return found;
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
