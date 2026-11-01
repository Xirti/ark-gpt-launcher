using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal sealed class AccountInfo
{
    public string type = "account-info";
    public string status;
    public string emailMasked;
    public string authLabel;
    public string planLabel;
    public string reason;
}

internal interface IAccountReader : IDisposable
{
    Task<AccountInfo> ReadAsync(CancellationToken cancellation);
}

// The only account-data boundary. Never requests login, refresh, threads, turns or rate limits.
internal sealed class CodexAccountReader : IAccountReader
{
    private readonly string executable;
    private readonly int timeoutMs;
    private readonly object processGate = new object();
    private Process activeProcess;
    private bool disposed;
    internal CodexAccountReader(string executable = null, int timeoutMs = 20000)
    { this.executable = executable; this.timeoutMs = timeoutMs; }

    public async Task<AccountInfo> ReadAsync(CancellationToken cancellation)
    {
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
        using (var server = new Process())
        {
            timeout.CancelAfter(timeoutMs);
            bool started = false;
            // Drain diagnostic output without retaining possible sensitive strings.
            server.ErrorDataReceived += delegate { };
            try
            {
                string command = executable ?? FindCodex();
                if (command == null) return new AccountInfo { status = "unavailable", reason = "未找到 Codex 命令" };
                server.StartInfo = new ProcessStartInfo(command, "app-server --listen stdio://") {
                    UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true
                };
                lock (processGate)
                {
                    if (disposed) throw new OperationCanceledException(cancellation);
                    started = server.Start();
                    if (started) activeProcess = server;
                }
                if (!started) throw new IOException("App-server did not start");
                server.BeginErrorReadLine();
                var json = new JavaScriptSerializer();
                server.StandardInput.WriteLine(json.Serialize(new {
                    id = 0, method = "initialize", @params = new {
                        clientInfo = new { name = "personal_startup_account", title = "Personal startup account display", version = "0.1.0" }
                    }
                }));
                server.StandardInput.Flush();
                await ReadResponse(server, 0, timeout.Token);
                server.StandardInput.WriteLine("{\"method\":\"initialized\",\"params\":{}}");
                server.StandardInput.WriteLine("{\"id\":1,\"method\":\"account/read\",\"params\":{\"refreshToken\":false}}");
                server.StandardInput.Flush();
                return ParseAccount(await ReadResponse(server, 1, timeout.Token));
            }
            catch (OperationCanceledException)
            {
                if (cancellation.IsCancellationRequested) throw;
                return new AccountInfo { status = "unavailable", reason = "账户读取超时" };
            }
            catch (Exception)
            {
                cancellation.ThrowIfCancellationRequested();
                // Non-critical UI boundary: report failure explicitly without inventing identity.
                return new AccountInfo { status = "unavailable", reason = "无法读取 Codex 账户" };
            }
            finally
            {
                try
                {
                    if (started)
                    {
                        lock (processGate)
                        {
                            if (!server.HasExited)
                            {
                                if (disposed || timeout.IsCancellationRequested) StopProcess(server);
                                else server.StandardInput.Close();
                            }
                        }
                        // Wait on the account worker, outside the lock used by the UI
                        // to stop this child immediately when the launcher closes.
                        if (!server.WaitForExit(500))
                        {
                            lock (processGate) StopProcess(server);
                            if (!server.WaitForExit(2000)) throw new IOException("Account app-server did not exit");
                        }
                    }
                }
                finally { lock (processGate) { if (activeProcess == server) activeProcess = null; } }
            }
        }
    }

    public void Dispose()
    {
        lock (processGate)
        {
            disposed = true;
            if (activeProcess != null) StopProcess(activeProcess);
        }
    }

    private static void StopProcess(Process process)
    {
        if (process.HasExited) return;
        try { process.Kill(); }
        catch (InvalidOperationException) { if (!process.HasExited) throw; }
    }

    private static async Task<Dictionary<string, object>> ReadResponse(Process server, int requestId, CancellationToken cancellation)
    {
        var json = new JavaScriptSerializer();
        var cancelled = Task.Delay(Timeout.Infinite, cancellation);
        while (true)
        {
            cancellation.ThrowIfCancellationRequested();
            var lineTask = server.StandardOutput.ReadLineAsync();
            if (await Task.WhenAny(lineTask, cancelled) != lineTask)
                cancellation.ThrowIfCancellationRequested();
            string line = await lineTask;
            if (line == null) throw new IOException("App-server closed its output");
            var message = json.DeserializeObject(line) as Dictionary<string, object>;
            if (message == null) throw new InvalidDataException("Invalid JSON-RPC envelope");
            object id;
            if (!message.TryGetValue("id", out id) || !Equals(id, requestId)) continue;
            if (message.ContainsKey("error")) throw new InvalidDataException("Account RPC rejected");
            object result;
            if (!message.TryGetValue("result", out result)) throw new InvalidDataException("Missing RPC result");
            var resultObject = result as Dictionary<string, object>;
            if (resultObject == null) throw new InvalidDataException("Invalid RPC result");
            return resultObject;
        }
    }

    internal static AccountInfo ParseAccount(Dictionary<string, object> result)
    {
        object accountValue, required;
        if (!result.TryGetValue("account", out accountValue) ||
            !result.TryGetValue("requiresOpenaiAuth", out required) || !(required is bool))
            throw new InvalidDataException("Invalid account response");
        if (accountValue == null)
            return new AccountInfo {
                status = (bool)required ? "signed-out" : "provider",
                reason = (bool)required ? "Codex 未返回已登录账户" : "当前提供方不返回账户资料"
            };
        var account = accountValue as Dictionary<string, object>;
        if (account == null) throw new InvalidDataException("Invalid account object");
        object typeValue, emailValue, planValue;
        if (!account.TryGetValue("type", out typeValue) || !(typeValue is string) || ((string)typeValue).Length == 0 || ((string)typeValue).Length > 64)
            throw new InvalidDataException("Invalid authentication type");
        account.TryGetValue("email", out emailValue);
        account.TryGetValue("planType", out planValue);
        if (emailValue != null && !(emailValue is string)) throw new InvalidDataException("Invalid account email");
        if (planValue != null && !(planValue is string)) throw new InvalidDataException("Invalid account plan");
        if (planValue != null && ((string)planValue).Length > 64) throw new InvalidDataException("Account plan too long");
        string authType = (string)typeValue;
        string masked = null;
        if (emailValue != null)
        {
            string email = (string)emailValue;
            int at = email.LastIndexOf('@');
            if (at <= 0 || at == email.Length - 1 || email.Length > 254) throw new InvalidDataException("Invalid email format");
            masked = email.Substring(0, Math.Min(2, at)) + "***" + email.Substring(at);
        }
        string plan = (string)planValue;
        return new AccountInfo {
            status = "ready", emailMasked = masked,
            authLabel = authType == "chatgpt" ? "ChatGPT" : authType == "apiKey" ? "API Key" : authType,
            planLabel = string.IsNullOrEmpty(plan) ? null : char.ToUpperInvariant(plan[0]) + plan.Substring(1)
        };
    }

    private static string FindCodex()
    {
        foreach (string directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(directory)) continue;
            string path = Path.Combine(directory.Trim('"'), "codex.exe");
            if (File.Exists(path)) return path;
        }
        string bundled = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OpenAI", "Codex", "bin");
        if (!Directory.Exists(bundled)) return null;
        return Directory.GetDirectories(bundled).OrderByDescending(Directory.GetLastWriteTimeUtc)
            .Select(directory => Path.Combine(directory, "codex.exe")).FirstOrDefault(File.Exists);
    }
}
