# ARAM Mayhem

Windows 桌面助手，基于 Tauri 2、Vue 3 和 TypeScript。连接本机英雄联盟客户端后，可查看账号与对局状态、最近战绩、随机分组和对局结算。结算支持纯伤害、伤害尾数和赛后幸运数字规则。

## 安装和开发

- Windows 安装包在 [GitHub Releases](https://github.com/UoMiss/aram-mayhem/releases) 提供，安装包旁附 SHA-256 校验文件。
- 安装 Node.js 22、pnpm 10 和 Rust stable。Windows 原生构建还需要 MSVC 和 WebView2。
- `pnpm install --frozen-lockfile` 安装前端依赖。
- `pnpm dev` 启动浏览器演示。`pnpm tauri dev` 启动桌面应用。
- `pnpm check` 运行设计基线校验、格式检查、类型检查、Lint、前端测试及生产构建。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml` 运行 Rust 测试。

Windows Release 工作流从版本标签构建 NSIS 安装包，并在 Windows 上验证静默安装与启动。源码仓库保留构建所需资源、测试样本及设计基线。

### 内部测试版 0.1.3-rc.1

本轮包含伤害大小玩法、浏览器演示联动、随机分队 3 秒揭示和结算展示调整；修复 PRE-001 开奖标题与集成测试不一致。该版本用于内部测试，尚未完成 Windows 国服、WebView2 截图与真实升级验收，不代表生产验收通过。

RC 通过 GitHub Pre-release 手动下载安装，不设为 Latest，不进入正式客户端自动更新通道。公开仓库的预发布链接仍公开可访问。发布脚本仅在显式 `--prerelease` 时接受 `X.Y.Z-rc.N`，仍验证安装包签名及绑定版本；工作流自动将 RC 草稿标记为预发布。

测试版与正式版使用同一应用标识和本地数据目录，不能视作隔离的第二套安装。安装前完全退出助手并备份 `%LOCALAPPDATA%\\com.arammayhem.desktop`；不删除锁定规则、幸运数字和大小开奖记录。回退旧版本的数据兼容性需另行验证。

## 浏览器演示

运行 `pnpm dev`，点击“进入浏览器演示”。演示与桌面端共用首页、战绩、工具、结算和设置页面，以及名单刷新、3 秒洗牌、规则锁定、结算重试和截图交付流程。浏览器数据标记为 `mock`，不会调用原生 IPC，也不会写入桌面端的规则与幸运数字历史。

右上角“演示”面板可以切换 3v3、4v4、5v5 自定义房间或匹配模式，推进匹配、确认、选人、开局、游戏中和赛后阶段，并模拟断开与重新连接。“自动接受对局”开关会改变模拟确认状态。开局锁定当前规则；赛后模拟两次数据未就绪，随后恢复结算。幸运数字在数据就绪后生成，同局保持不变；完成的模拟对局会进入近期对局和最多 20 条的战绩列表。模拟记录仅保存在当前页面内存中，刷新浏览器会重置。

版本更新可以演示检查、下载进度、取消、安装确认和完成提示，但不下载或执行安装包。系统托盘、窗口控制、真实 LCU、Windows WebView2 剪贴板权限和原生安装更新仍需 Windows 实机验证，浏览器演示不代表这些能力已通过验收。

## 设置与版本更新

通用设置只保留“自动接受对局”，默认关闭。旧版开机自启注册会在新版启动时尝试清除；提示音已移除，客户端连接监测自动运行。

更新使用 [Tauri 2 官方 Updater](https://v2.tauri.app/plugin/updater/)。Windows x64 客户端读取固定地址 `https://github.com/UoMiss/aram-mayhem/releases/latest/download/latest.json`，在客户端内下载并显示进度，支持取消与失败重试。下载完成后验证签名和签名绑定的版本；用户点击“安装更新”并确认后才启动 NSIS。安装程序启动成功后助手退出，安装后重新启动。匹配、选人、游戏及等待结算阶段禁止安装。页面重新打开会恢复本次进程中的更新状态；重启助手后需要重新检查、下载。

更新包和签名仅保存在原生内存中，前端通过经过校验的状态 DTO 和进度 Channel 交互，不接收安装文件、签名私钥或任意下载地址。Updater 的前端通用权限没有开放；主窗口专用命令控制检查、下载、取消及安装。原生端只接受固定仓库和版本下的 Windows 安装包地址，不允许降级或预发布。发布页作为手动备用入口保留。

发布新版须同步递增 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 与 `src-tauri/tauri.conf.json` 的应用版本，创建对应 `vX.Y.Z` 标签，然后运行 Windows Release 工作流并将生成的草稿正式发布。每次发布包含：

- `aram-mayhem-windows-x64-setup.exe`
- `aram-mayhem-windows-x64-setup.exe.sig`
- `latest.json`
- `windows-installer.sha256`

工作流从 GitHub Actions Secrets 读取 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。`createUpdaterArtifacts` 开启后，由 Tauri CLI 自动签名；`scripts/updater-artifacts.mjs` 验证安装包、公钥和签名绑定版本一致后生成清单。草稿、Actions Artifact 或同版本覆盖不会触发正式更新。首次启用 Updater 的客户端需要先手动安装，之后才能在线升级到版本号更高的发布。

本机签名备份位于 Git 忽略目录 `.updater-signing/`，目录和私钥限制为当前用户可读写。请单独安全备份密钥及密码，后续发布沿用相同签名密钥；源码中只包含公钥。签名保证更新包来源与完整性，与 Windows Authenticode 代码签名不同。

开发与验证可运行 `pnpm check`、`cargo test --locked --manifest-path src-tauri/Cargo.toml`。本地打包还需通过环境变量提供签名私钥路径及密码；仅修改 `.env` 不会触发 Tauri 签名。Windows 实机升级链仍需从已安装的旧版验证下载、退出、覆盖安装和重启。

英雄头像使用 [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)。

ARAM Mayhem isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
