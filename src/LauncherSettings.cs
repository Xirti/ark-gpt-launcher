using System;
using System.IO;
using System.Web.Script.Serialization;

internal sealed class LauncherSettings
{
    public int desktopWaitSeconds = 300;
    public int accountWaitSeconds = 20;
    public int fadeMilliseconds = 1200;
    public LauncherSettings() { }

    internal static LauncherSettings Read(string root)
    {
        string path = Path.Combine(root, "launcher-settings.json");
        if (!File.Exists(path)) return new LauncherSettings();
        var settings = new JavaScriptSerializer().Deserialize<LauncherSettings>(File.ReadAllText(path));
        if (settings == null || settings.desktopWaitSeconds < 30 || settings.desktopWaitSeconds > 3600 ||
            settings.accountWaitSeconds < 5 || settings.accountWaitSeconds > 120 ||
            settings.fadeMilliseconds < 300 || settings.fadeMilliseconds > 3000)
            throw new InvalidDataException("launcher-settings.json: desktopWaitSeconds 30–3600, accountWaitSeconds 5–120, fadeMilliseconds 300–3000.");
        return settings;
    }
}
