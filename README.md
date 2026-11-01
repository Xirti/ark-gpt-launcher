# 方舟 GPT 启动器

为 Windows 版 Codex 桌面应用提供启动动画、账户确认和淡出交接。便携运行，无需安装本启动器。

## v1.1.0

- OpenAI / CODEX 开场、参考式圆环与 Welcome 动画，圆环收尾停留约半秒。
- 左侧 Logo 平滑循环实心／空心，以正弦式加减速逆时针旋转；支持系统减少动态效果设置。
- 启动时并行预读账户、缺失字段显示 `----`，完善键盘确认、窗口跟随与独立淡出退场。
- 使用自定义启动器图标、离线字体及配套许可；不修改 Codex 本体。

## 使用

1. 从 [Releases](https://github.com/Xirti/ark-gpt-launcher/releases) 下载 Windows x64 ZIP，解压到可写目录。
2. 确保已安装 Codex 桌面应用、.NET Framework 4.8 和 Microsoft Edge WebView2 Runtime。
3. 双击 `CodexLauncher.exe`。`预览.cmd` 只预览，不启动 Codex 桌面。

Codex 在动画打开时预加载；启动器同时预读一次本机 Codex CLI 既有认证资料，默认最多约 20 秒，不执行登录、登出或令牌刷新。身份名称只显示实际读取到的脱敏邮箱。身份编号是按已识别套餐映射的画面代号，读取成功时的 `user` 是固定展示值；二者不代表真实账户编号或权限。读取失败、未登录或无法识别套餐的相应字段显示 `----`。“确认身份”后开始计算默认 5 分钟的会话就绪等待，确认前停留不消耗这段时间。就绪后播放欢迎语，以约 1.2 秒淡出，最后交接焦点并退出。

顶部空白处可拖动，贴屏幕顶边松手最大化；右上角提供最小化、最大化／还原、关闭。正式启动窗口不单独登记任务栏按钮，而是归属于 Codex：最小化时一起收起，恢复 Codex 时带回启动窗口。窗口不全局置顶，关闭启动器保留 Codex。
Codex 主窗口出现前，最小化键暂不可用；预览模式有独立任务栏按钮，因为它不启动 Codex。

## 任务栏与设置

运行 `CodexLauncher.exe --create-shortcut` 可在当前目录生成 `Codex（动画启动）.lnk`，沿用原 Codex 的 AppUserModelID。若要从任务栏经过动画，请自行取消原固定项并固定新快捷方式；工具不会自动操作任务栏。正式动画窗口通过原生 owner 关系跟随 Codex，不依赖 Windows 把两个独立任务栏窗口强行合并。

Windows 可能将商店应用固定项解析回原入口，实际分组及固定后启动顺序需要自行确认。Codex 已运行时，点击分组通常切换现有窗口。就绪检测依赖 UI Automation，确认后超过配置时限仍未识别输入框会提示重试／退出，重试会重新计时；CLI 返回的账户不保证与桌面当前账户相同。

- 动画配置：`web/config.js`。
- 等待与退场：`launcher-settings.json`，修改后重开即可。`desktopWaitSeconds` 默认 300（范围 30–3600 秒），`accountWaitSeconds` 默认 20（范围 5–120 秒），`fadeMilliseconds` 默认 1200（范围 300–3000 毫秒）。
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
powershell -NoProfile -ExecutionPolicy Bypass -File .\src\发布打包.ps1 -Version 1.1.0
```

产物位于 `dist/`。Release 不包含源码、录音备份、测试、历史记录、缓存或本机快捷方式。

`CodexLauncher.exe --check` 检查配置、WebView2 与应用标识并生成 `check-result.txt`，不启动动画或 Codex。本次覆盖账户空值、超时计时及重试、原生透明度与焦点顺序，以及既有窗口归属回归。透明度测试使用隔离桌面中的合成画面与模拟前台条件；没有切换用户桌面或操作正在使用的 Codex，真实冷启动闪现和显示器上的最终观感仍需自行确认。

## 清理与回退

工具不添加服务、自启、计划任务、PATH、自动更新或本地 HTTP 端口，不修改 Codex 安装包。账户查询结果不保存为文件，短时查询进程结束后退出。
预加载期间临时监听窗口创建、显示和位置变化，以提前建立覆盖关系，结束、超时或取消时解除；仅在本进程接收事件，不向 Codex 注入代码，不全局置顶。

关闭启动器后可删除 `data/`，下次运行会重建 WebView2 本地运行数据。卸载时先取消自行添加的任务栏固定项，再删除解压目录；不要删除 Codex 本体、`.codex`、认证资料或聊天文件。升级前保留旧便携包，需要回退时退出新版并重新解压旧版。

## 来源与许可

动画基于 [6shenhonghong9/dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen)（来源提交 `1f35ea33810e02a900b31df01f9c806f92f398df`），参考 [RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的启动动效；项目代码和参考实现的 MIT 许可见 `LICENSE` 与 `licenses/`。欢迎标题使用离线 Montserrat 字体，其 SIL OFL 许可见 `licenses/`。

OpenAI 标识来自官方品牌资源，程序 ICO 为用户提供的自定义图像。音频部分沿用上游，欢迎语使用本次适配音频；品牌及媒体资源的权利归各自权利人，不因代码的 MIT 许可而改变。

这是个人适配项目，并非 OpenAI 官方发布或维护。
