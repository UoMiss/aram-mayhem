# 阶段状态（2026-11-01）

## 当前阶段：阶段九 Tauri 2 + Rust 完成 — macOS 本地通过

在既有 Vue 3 工程上增加 Tauri 2 桌面壳、Rust IPC 和浏览器/Tauri 适配层。仍使用全部现有 Mock，不接入真实 LCU；浏览器模式未回归。

阶段八/8.2 的浏览器视觉、中文 i18n、截图与 70 测试基线保留；阶段九新增到 **75 个前端测试 / 103 个构建模块**。

阶段九说明：[PHASE9_TAURI_INTEGRATION.md](PHASE9_TAURI_INTEGRATION.md)。

## 环境

- macOS 27.0.1 arm64；Xcode Command Line Tools 27.0；完整 Xcode 未安装。
- Rust 1.99.1 / Cargo 1.99.1（工作区本地工具链；主机禁止写 `~/.cargo`）。
- Tauri CLI / JS API 2.12.4；Rust tauri 2.12.5、tauri-build 2.7.4、wry 0.57.1、tao 0.37.2。
- Node 22.23.4 / pnpm 10.34.9；无 npm/yarn 锁文件。

## 阶段九已完成

- `src-tauri/`：官方 `main.rs` → `lib.rs` 入口，`commands/app.rs` 独立命令模块。
- 窗口 `ARAM: Mayhem`，480×900，最小 320×568；原生装饰、非透明、可调整大小。
- Vite 与 Tauri 统一 `http://127.0.0.1:1420`，`strictPort: true`；beforeDev/beforeBuild 均 pnpm。
- `app_health_check` Rust command + 类型化 `AppHealth`/`AppError`；前端 `invoke()`。
- `browser.adapter` / `tauri.adapter` / `app.service`；App 启动静默探测，无可见测试按钮。
- `@tauri-apps/api`/CLI 2.12.4；Tauri 图标、Cargo.lock、capability。
- CSP 与仅 `core:default` 的最小能力配置；无 Shell/FS/HTTP/Clipboard 插件/Updater/LCU。
- 适配器/IPC 契约测试 5 个；Rust 3 个测试。

## 实际验证结果

- `pnpm install --frozen-lockfile`：通过。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过（忽略 `.cargo`、`.rustup`、`src-tauri/target`、`gen`、`icons` 生成物）。
- `pnpm format:check`：通过。
- `pnpm test`：**16 文件 / 75 测试通过**。
- `pnpm build`：通过，**103 模块**。
- `pnpm check`：通过。
- `pnpm audit`：0 漏洞；`pnpm audit --prod`：0。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过，无 warning。
- `cargo test --manifest-path src-tauri/Cargo.toml`：**3 passed**。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `pnpm tauri dev`：Vite 1420 ready；Tauri 窗口运行；Rust 输出 `[app_health_check] runtime=tauri status=ok version=0.1.0 simulated=true`。
- `pnpm tauri build`：通过，生成 `src-tauri/target/release/bundle/macos/ARAM Mayhem.app`（约 10.57 MiB）。
- release `.app` 独立运行：再次输出 `[app_health_check]`，证明生产资源、CSP 与 IPC 正常。
- 原始 HTML SHA-256：`6197327909428f19baca483aa8ec9de170bfa8a34bf88e9d2db4b7546fbecd9e`，未变化。

## 浏览器与桌面差异

- 浏览器：`pnpm dev` → 1420；`browser.adapter` 返回 `runtime: "browser"`、`simulated: true`；现有 Mock。
- 桌面：`pnpm tauri dev`/build；同一 Vue 页面和 Mock；`tauri.adapter` 调用 Rust 健康检查。
- 桌面版不伪造 LCU 连接；健康检查只报告桌面壳状态。
- 视觉/i18n/动画/480px 最大宽度/Font Awesome/本地资源均沿用现有前端。

## IPC 与安全

- 命令：`app_health_check`，无参数；返回 `status/runtime/appName/appVersion/platform/simulated`。
- Rust `AppError { code, message }`；前端转为 `DesktopServiceError`，无堆栈。
- Capability 仅 `core:default`；无 shell/fs/http/updater/global Tauri。
- CSP 生产只允许 self、本地 asset、inline style、字体、IPC；dev CSP 额外 Vite/WS。

## 已知限制

- macOS 屏幕录制/辅助功能权限被拒，未取得 Tauri 窗口截图或拖拽自动化证据。
- Tauri WebView 内剪贴板/下载未自动化点击；未接入 Tauri Clipboard 插件。浏览器剪贴板/下载已实测。
- 本机完整 Xcode 未安装；`.app` 由 CLT 构建成功。
- `.dmg` 的 `hdiutil` 在沙箱被拒绝，bundle target 暂为 `app`。
- WebKit 无法写 `~/Library/WebKit` 的沙箱警告存在，但页面/IPC 正常。
- Windows 未编译/未测试；签名、公证、自动更新、托盘、开机启动均未实现。
- 真实 LCU、真实战绩/结算/红包逻辑未实现，全部仍为 Mock。

## 后续

1. 有 GUI 权限的 Mac 人工验收窗口截图、拖拽缩放、Tauri WebView 剪贴板/下载。
2. Windows 11 + WebView2 编译、NSIS/MSI 安装包、DPI/字体/下载验证。
3. 阶段十：在 Rust 侧增加只读 LCU 服务边界与 IPC contract tests，再逐步接房间/对局事件；凭据不进入 Vue。
4. 生产签名/公证/Updater 单独立项，不复制现有 macOS 配置。
