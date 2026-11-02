# 方舟 GPT 启动器

一个为 Windows 版 Codex 桌面应用制作的动画启动器。

启动时播放 OpenAI / Codex 开场动画，经过账户确认、加载和 Welcome 页面，再淡出进入 Codex。Codex 会在后台同步启动，让等待过程和动画一起完成。

![启动器图标](web/dsh-startup/asset/launcher.ico)

## 下载与使用

从 [Releases](https://github.com/Xirti/ark-gpt-launcher/releases/latest) 下载 Windows x64 压缩包，解压后双击 `CodexLauncher.exe`。

运行前需要安装：

- Codex 桌面应用
- .NET Framework 4.8
- Microsoft Edge WebView2 Runtime

想单独看看动画，可以运行 `预览.cmd`。

启动器支持顶部拖动、贴顶最大化，以及最小化、最大化和关闭。动画结束后会自动退出；中途关闭启动器，Codex 会继续运行。

## 动画与账户信息

动画包含开场字幕、账户确认、圆环加载、旋转 Logo 和 Welcome 页面，配有音效及机械风格欢迎语音。

启动器打开时会同步查询本机 Codex CLI 的登录信息，在确认页显示脱敏邮箱和套餐对应的画面代号：

| 套餐 | 身份编号 |
| --- | --- |
| Plus | `L-01x` |
| Pro 100 | `H-10x` |
| Pro 200 | `M-20x` |
| Pro 500 | `U-50x` |

这些编号用于动画展示，末尾的 `x` 为固定字符。账户读取成功后，权限等级显示为 `user`；缺失的信息显示 `----`。

账户信息来自本机 CLI，桌面应用的登录状态以 Codex 内显示的账户为准。查询结果只在本次运行中使用，不写入文件。

确认身份后，启动器会等待 Codex 的会话输入界面就绪，再播放欢迎语并淡出。默认等待时间为 5 分钟，超时后可以重试或退出。

## 桌面与任务栏入口

在启动器目录打开终端，运行：

```powershell
.\CodexLauncher.exe --create-shortcut
```

当前目录会生成 `Codex（动画启动）.lnk`，可以放到桌面使用。

希望从任务栏启动动画时，可以取消原 Codex 固定项，再固定这个快捷方式。Windows 对商店应用快捷方式的处理可能让固定项回到原 Codex 入口，桌面快捷方式可直接作为动画启动入口。

正式运行时，动画窗口跟随 Codex，共用任务栏入口；预览模式使用独立窗口。

## 自定义

| 内容 | 文件 |
| --- | --- |
| 动画设置 | `web/config.js` |
| 等待时间与淡出时长 | `launcher-settings.json` |
| 欢迎语音 | `web/dsh-startup/asset/line-6.mp3` |
| 启动器图标 | `web/dsh-startup/asset/launcher.ico` |
| Codex 应用标识 | `app-id.txt` |

`launcher-settings.json` 中的时间设置：

| 设置项 | 默认值 | 可用范围 |
| --- | --- | --- |
| `desktopWaitSeconds`：等待 Codex 就绪 | 300 秒 | 30–3600 秒 |
| `accountWaitSeconds`：账户查询超时 | 20 秒 | 5–120 秒 |
| `fadeMilliseconds`：退场淡出时长 | 1200 毫秒 | 300–3000 毫秒 |

修改配置后重新打开启动器即可。替换欢迎语音时请使用 MP3 文件，动画会等待语音播放结束。更换程序图标后需要重新构建。

## 从源码构建

仓库包含 C# 窗口宿主、动画资源、构建脚本，以及构建所需的 WebView2 SDK 文件。

在项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\src\构建.ps1
```

生成便携发布包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\src\发布打包.ps1 -Version 1.1.3
```

打包结果位于 `dist/`，包含运行文件和 SHA256 校验文件。

遇到启动问题时，可以运行：

```powershell
.\CodexLauncher.exe --check
```

检查结果会保存到 `check-result.txt`。

## 升级、回退与卸载

启动器为便携程序，不添加开机自启、后台服务、计划任务或自动更新，也不修改 Codex 安装文件。

运行后出现的 `data/` 是 WebView2 的本地运行数据。关闭启动器后可以删除，下次打开时会重新生成。

- **升级：**关闭启动器，将新版解压到新目录，检查后再替换快捷方式。
- **回退：**保留旧版压缩包，需要时重新解压并运行旧版。
- **卸载：**取消自己添加的任务栏固定项，删除快捷方式和启动器目录即可。

Codex 的安装目录、账户资料和聊天记录由 Codex 自身管理，清理启动器时保留这些内容。

## 来源与许可

本项目由 [dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen) 适配而来，加载与 Welcome 动画参考了 [RhineLabUI](https://github.com/LBEILC/RhineLabUI)。

代码许可见 `LICENSE`，第三方代码与字体许可见 `licenses/`。欢迎标题使用 Montserrat 字体。

OpenAI 品牌标识、图像和音频资源的权利归各自权利人所有，媒体资源按各自授权使用。

这是个人制作的 Codex 启动器，与 OpenAI 官方无隶属关系。
