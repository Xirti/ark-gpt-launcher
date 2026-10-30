# 方舟 GPT 启动器

为 Windows 版 Codex 桌面应用提供启动动画、账户确认和淡出交接。便携运行，无需安装本启动器。

## 使用

1. 从 [Releases](https://github.com/Xirti/ark-gpt-launcher/releases) 下载 Windows x64 ZIP，解压到可写目录。
2. 确保已安装 Codex 桌面应用、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。
3. 双击 `CodexLauncher.exe`。`预览.cmd` 只预览，不启动 Codex 桌面。

Codex 在动画打开时预加载；“确认登录”读取本机 Codex CLI 既有认证资料，“确认账户”后等待会话输入框就绪，再播放欢迎语并淡出退出。账户查询最多约 8 秒，不执行登录、登出或令牌刷新。

顶部空白处可拖动，贴屏幕顶边松手最大化；右上角提供最小化、最大化／还原、关闭。窗口不置顶，关闭启动器保留 Codex。

## 任务栏与设置

运行 `CodexLauncher.exe --create-shortcut` 可在当前目录生成 `Codex（动画启动）.lnk`。它和启动器使用原 Codex 的 AppUserModelID 申请共用任务栏分组。若要从任务栏经过动画，请自行取消原固定项并固定新快捷方式；工具不会自动操作任务栏。

Windows 可能将商店应用固定项解析回原入口，实际分组及固定后启动顺序需要自行确认。Codex 已运行时，点击分组通常切换现有窗口。就绪检测依赖 UI Automation，90 秒未识别输入框会提示重试／退出；CLI 返回的账户不保证与桌面当前账户相同。

- 动画配置：`web/config.js`。
- 欢迎语音：`web/dsh-startup/asset/line-6.mp3`，当前为机械增强版。替换时使用真正的 MP3，动画会等待音频播放结束。
- 程序图标：`web/dsh-startup/asset/launcher.ico`，替换后重新构建。
- Codex 应用标识：`app-id.txt`，默认 `OpenAI.Codex_2p2nqsd0c76g0!App`。

## 构建与打包

源码仓库只保留 C# 宿主、前端资源、构建脚本、WebView2 SDK 必需 DLL 和许可。WebView2 SDK 版本为 `1.0.4191.47`，随仓库提供的 DLL 可供离线构建；WebView2 Runtime 仍需系统已安装。

在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\src\构建.ps1
```

生成核心便携包和 SHA256 校验文件：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\src\发布打包.ps1 -Version 1.0.0
```

产物位于 `dist/`。Release 不包含源码、录音备份、测试、历史记录、缓存或本机快捷方式。

`CodexLauncher.exe --check` 只检查 WebView2 与应用标识并生成 `check-result.txt`，不启动动画或 Codex。本次发布完成构建、包内文件和音频解码检查；未重新进行 GUI、任务栏固定或真正冷启动测试。

## 清理与回退

工具不添加服务、自启、计划任务、PATH、自动更新或本地 HTTP 端口，不修改 Codex 安装包。账户查询结果不保存为文件，短时查询进程结束后退出。

关闭启动器后可删除 `data/`，下次运行会重建 WebView2 本地运行数据。卸载时先取消自行添加的任务栏固定项，再删除解压目录；不要删除 Codex 本体、`.codex`、认证资料或聊天文件。升级前保留旧便携包，需要回退时退出新版并重新解压旧版。

## 来源与许可

动画基于 [6shenhonghong9/dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen)，来源提交 `1f35ea33810e02a900b31df01f9c806f92f398df`；上游及宿主代码采用 MIT，见 `LICENSE` 与 `licenses/`。

OpenAI 标识来自官方品牌资源，程序 ICO 来自 Codex。音频部分沿用上游，欢迎语使用本次适配音频；品牌及媒体资源的权利归各自权利人，不因代码的 MIT 许可而改变。

这是个人适配项目，并非 OpenAI 官方发布或维护。
