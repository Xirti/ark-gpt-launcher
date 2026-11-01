using System;
using System.Runtime.InteropServices;
using System.Windows.Automation;

// Read only control metadata. Never reads text/value patterns or conversation contents.
internal static class ConversationReadiness
{
    internal static bool IsReady(IntPtr window)
    {
        try
        {
            var root = AutomationElement.FromHandle(window);
            var candidates = root.FindAll(TreeScope.Descendants, new AndCondition(
                new OrCondition(
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document)),
                new PropertyCondition(AutomationElement.IsEnabledProperty, true),
                new PropertyCondition(AutomationElement.IsPasswordProperty, false)));
            foreach (AutomationElement candidate in candidates)
            {
                var info = candidate.Current;
                if (info.IsOffscreen || !info.IsKeyboardFocusable ||
                    info.BoundingRectangle.Width < 200 || info.BoundingRectangle.Height <= 0) continue;
                string name = info.Name.ToLowerInvariant();
                string id = info.AutomationId.ToLowerInvariant();
                string className = info.ClassName.ToLowerInvariant();
                if (id.Contains("prompt") || id.Contains("composer") || className.Contains("prosemirror") ||
                    name.Contains("message codex") || name.Contains("ask codex") ||
                    name.Contains("follow-up") || name.Contains("follow up") ||
                    name.Contains("询问") || name.Contains("发送消息") || name.Contains("后续问题")) return true;
            }
            return false;
        }
        catch (ElementNotAvailableException) { return false; } // Renderer replaced; retry next poll.
        catch (COMException) { return false; } // Provider starting or rebuilding its tree.
    }
}
