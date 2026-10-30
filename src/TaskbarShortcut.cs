using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

// A local .lnk only: no registry, automatic pinning, or changes to the Codex package.
internal static class TaskbarShortcut
{
    internal static void Create(string root, string appId)
    {
        var link = (IShellLink)new ShellLink();
        try
        {
            string executable = Path.Combine(root, "CodexLauncher.exe");
            link.SetPath(executable);
            link.SetWorkingDirectory(root);
            link.SetDescription("通过方舟GPT启动动画打开 Codex");
            link.SetIconLocation(executable, 0);
            link.SetShowCmd(1);
            var store = (IPropertyStore)link;
            var key = new PropertyKey {
                Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), Id = 5
            };
            var value = new PropVariant { Type = 31, Pointer = Marshal.StringToCoTaskMemUni(appId) };
            try
            {
                store.SetValue(ref key, ref value);
                store.Commit();
            }
            finally { Marshal.FreeCoTaskMem(value.Pointer); }
            ((IPersistFile)link).Save(Path.Combine(root, "Codex（动画启动）.lnk"), true);
        }
        finally { Marshal.ReleaseComObject(link); }
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey { internal Guid Format; internal uint Id; }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant
    {
        [FieldOffset(0)] internal ushort Type;
        [FieldOffset(8)] internal IntPtr Pointer;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        void GetCount(out uint count);
        void GetAt(uint index, out PropertyKey key);
        void GetValue(ref PropertyKey key, out PropVariant value);
        void SetValue(ref PropertyKey key, ref PropVariant value);
        void Commit();
    }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellLink
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, IntPtr findData, uint flags);
        void GetIDList(out IntPtr item);
        void SetIDList(IntPtr item);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int length);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int length);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int command);
        void SetShowCmd(int command);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }
}
