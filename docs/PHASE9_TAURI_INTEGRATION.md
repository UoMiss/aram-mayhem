# 阶段九：Tauri 2 + Rust 桌面工程初始化与 Vue 集成

结论：**通过（macOS，本地验证）**。Tauri 桌面窗口、Rust IPC、生产 `.app` 构建通过；视觉截图与 Tauri WebView 内的剪贴板/下载自动化受主机 macOS 权限限制，见第 10 节。

## 1. 范围

- 基于既有 Vue 3 + Vite + Pinia + Vue I18n 工程增加 Tauri 2 桌面壳。
- 不重写 Vue/Vite/TypeScript 工程；不增加页面、不改变 UI、不接入真实 LCU。
- 浏览器模式继续使用现有 Mock；Tauri 模式只增加一个健康检查 IPC，桌面能力通过适配层隔离。
- 本阶段不实现托盘、真实开机启动、自动更新、数据库、Shell/FS 能力或 LCU。

## 2. 环境与版本

| 项目                     | 版本/结果                                                           |
| ------------------------ | ------------------------------------------------------------------- |
| macOS                    | 27.0.1 arm64                                                        |
| Xcode Command Line Tools | 已安装，SDK 27.0                                                    |
| 完整 Xcode               | **未安装**（`tauri info` 报告 Xcode: not installed）                |
| Rust                     | 1.99.1（stable-aarch64-apple-darwin）                               |
| Cargo                    | 1.99.1                                                              |
| Rust 安装方式            | 工作区本地 `.cargo` / `.rustup`（主机禁止写 `~/.cargo`，避免 sudo） |
| Tauri CLI                | `@tauri-apps/cli` 2.12.4                                            |
| Tauri JS API             | `@tauri-apps/api` 2.12.4                                            |
| Tauri Rust crate         | 2.12.5                                                              |
| tauri-build              | 2.7.4                                                               |
| wry / tao                | 0.57.1 / 0.37.2                                                     |
| Node / pnpm              | 22.23.4 / 10.34.9                                                   |

标准 macOS 开发机可安装 Rust stable + Xcode（或至少 CLT），然后运行 `pnpm install`；本机的完整 Xcode 缺失但 CLT 足以完成本阶段 `.app` 构建。

```bash
# 本工作区因沙箱使用本地 Rust 工具链；普通 macOS 安装无需前两行
source .cargo/env
export RUSTUP_HOME="$PWD/.rustup" CARGO_HOME="$PWD/.cargo"

pnpm install
pnpm tauri dev
```

## 3. 工程结构

```text
src-tauri/
├── Cargo.toml                 # package aram-mayhem，lib aram_mayhem_lib
├── Cargo.lock
├── build.rs
├── tauri.conf.json            # 480x900、CSP、pnpm 前后置命令
├── capabilities/default.json  # 仅 core:default
├── icons/                     # 品牌图标（macOS/Windows/Android/iOS 生成物）
└── src/
    ├── main.rs                # 官方推荐入口，调用 lib::run()
    ├── lib.rs                 # Builder + invoke_handler
    └── commands/
        ├── mod.rs
        └── app.rs             # AppHealth / AppError / app_health_check
```

前端新增：

```text
src/types/desktop.ts                 # AppHealth / AppRuntime / DesktopAdapter
src/adapters/browser.adapter.ts      # 浏览器 Mock 健康响应
src/adapters/tauri.adapter.ts        # 唯一 invoke('app_health_check') 的位置
src/adapters/*.test.ts
src/services/app.service.ts          # 运行时选择 adapter
src/services/desktop-error.ts        # 清洗后的 DesktopServiceError
src/services/app.service.test.ts
```

[App.vue](../src/App.vue) 在 `onMounted` 静默调用 `getAppHealth()`，不增加可见测试按钮或页面元素；失败被忽略，不影响既有 UI。

## 4. 窗口、Vite 与配置

- Tauri 窗口标题：`ARAM: Mayhem`。
- 内容尺寸：480×900；最小 320×568；可调整大小；原生装饰、非透明、非全屏。
- `productName`: `ARAM Mayhem`（避免 macOS bundle 文件名中的冒号）；`identifier`: `com.arammayhem.desktop`。
- Vite 与 Tauri 统一使用 `http://127.0.0.1:1420`；Vite `strictPort: true`。
- `beforeDevCommand`: `pnpm dev`。
- `beforeBuildCommand`: `pnpm build`。
- `frontendDist`: `../dist`。
- `bundle.targets`: `["app"]`；macOS `.app` 构建成功。`.dmg` 在当前沙箱被 `hdiutil` 拒绝，见第 10 节。
- 脚本：`pnpm tauri dev`、`pnpm tauri build`（`package.json` 的 `tauri` 脚本）。

## 5. IPC 契约

### Rust

```rust
pub struct AppHealth {
    status: String,
    runtime: String,      // "tauri"
    app_name: String,     // "ARAM: Mayhem"
    app_version: String,  // CARGO_PKG_VERSION
    platform: String,     // std::env::consts::OS
    simulated: bool,      // true，本阶段仍为 Mock
}

#[tauri::command]
pub fn app_health_check() -> Result<AppHealth, AppError>;
```

`AppError` 仅有 `code` / `message`，不包含宿主堆栈；命令在非 `ok` 时返回 `desktop.unhealthy`，正常时返回健康状态并打印：

```text
[app_health_check] runtime=tauri status=ok version=0.1.0 simulated=true
```

### TypeScript

```ts
export type AppRuntime = 'browser' | 'tauri'

export interface AppHealth {
  status: 'ok' | 'degraded'
  runtime: AppRuntime
  appName: string
  appVersion: string
  platform: string
  simulated: boolean
}

export interface DesktopAdapter {
  getHealth(): Promise<AppHealth>
}
```

调用链：

```text
App.vue onMounted
  -> getAppHealth()
  -> isTauri() ? dynamic import(tauri.adapter) : browser.adapter
  -> invoke<AppHealth>('app_health_check')
```

`tauri.adapter.ts` 将任何 invoke 异常转换为 `DesktopServiceError('desktop.ipc_failed', 'Desktop health check failed')`，不向页面暴露原始 Rust/host 异常。

## 6. 运行模式与 Mock 边界

| 模式          | 健康检查                                                            | 业务数据                | 启动                         |
| ------------- | ------------------------------------------------------------------- | ----------------------- | ---------------------------- |
| 浏览器        | `browser.adapter` 返回 `runtime: "browser"` / `simulated: true`     | 现有 Mock               | `pnpm dev`（1420）           |
| Tauri 桌面    | Rust `app_health_check` 返回 `runtime: "tauri"` / `simulated: true` | 仍为现有 Mock，不接 LCU | `pnpm tauri dev`             |
| Tauri release | 同 Tauri，资源来自 `dist`                                           | 仍为 Mock，不接 LCU     | `pnpm tauri build` 后 `.app` |

没有真实 LCU、真实连接、真实战绩或真实结算；没有伪造“已连接客户端”。健康检查仅证明桌面壳与 IPC 可用。

## 7. 安全配置

- Capability：`capabilities/default.json` 仅启用 `core:default`，窗口 `main`。
- 未启用 Shell、文件系统、HTTP、剪贴板插件、自动更新或全局 Tauri API。
- CSP（生产）：
  `default-src 'self'; img-src 'self' asset: http://asset.localhost data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src ipc: http://ipc.localhost`
- Dev CSP 仅额外放开 `http://127.0.0.1:1420` 与 `ws://127.0.0.1:1420` 供 Vite/HMR。
- 无证书、密钥、更新地址或签名配置；未使用 `--force` 或危险的全局暴露。
- Rust 只有 Tauri 基础依赖、Serde，无 LCU/HTTP/数据库依赖。

## 8. 实际验证结果

| 验证                             | 结果                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 通过                                                            |
| `pnpm typecheck`                 | 通过                                                            |
| `pnpm lint`                      | 通过（忽略 `.cargo`/`target`/`gen`/icons 生成物）               |
| `pnpm format:check`              | 通过                                                            |
| `pnpm test`                      | **16 文件 / 75 测试通过**                                       |
| `pnpm check`                     | 通过                                                            |
| `pnpm build`                     | 通过，**103 模块**（包含 lazy Tauri adapter chunk）             |
| `pnpm audit`                     | 0 漏洞                                                          |
| `pnpm audit --prod`              | 0 漏洞                                                          |
| `cargo check`                    | 通过，无 warning                                                |
| `cargo test`                     | **3 passed**                                                    |
| `cargo fmt --check`              | 通过                                                            |
| `pnpm tauri dev`                 | 通过：Vite 1420 ready、Tauri 进程运行、Rust 收到健康检查        |
| `pnpm tauri build`               | 通过：`ARAM Mayhem.app`，约 10.57 MiB（10.57 MiB 输出，du 11M） |
| release app 运行                 | 通过：`[app_health_check] runtime=tauri ...`                    |

Tauri dev 日志关键行：

```text
VITE v7.3.7 ready
➜ Local: http://127.0.0.1:1420/
[app_health_check] runtime=tauri status=ok version=0.1.0 simulated=true
```

Release `.app` 路径：

```text
src-tauri/target/release/bundle/macos/ARAM Mayhem.app
```

## 9. 浏览器与桌面兼容性

- 浏览器视觉基准仍为阶段 8.2：9 状态 × 5 尺寸，8 个静态状态与阶段八 Vue 基线 0 像素差；证据在 `docs/verification/stage8.2/`。
- 桌面版加载同一 `dist`/Vite 页面资源；新增的启动健康探测不渲染 UI，不改变布局、文案、动画、输入或 Pinia 状态。
- Tauri 窗口使用原生标题栏、非透明背景；保留 480px 页面最大宽度、Font Awesome、唯一 `zh-CN`、本地头像/字体和既有动画。
- 由于 macOS 沙箱权限，未能截取桌面窗口或自动化拖动窗口；窗口进程与 IPC 成功日志证明页面已挂载。窗口尺寸/最小尺寸/可调整性由配置保证，未做人工拖拽验收。

## 10. 已知限制

1. **完整 Xcode 未安装**：`tauri info` 报告 Xcode 缺失；CLT 足以编译和生成 `.app`，但未验证 Xcode 工程级工具链。
2. **DMG 被沙箱拒绝**：`hdiutil create` 报“操作不被允许”；本阶段 `bundle.targets` 收敛为 `app`，不生成 `.dmg`。
3. **macOS 屏幕录制/辅助功能权限被拒**：`screencapture` 与 System Events 均失败，未取得桌面截图或窗口尺寸的 GUI 自动化证据。
4. **Tauri WebView 剪贴板未自动化**：未能在桌面 WebView 中自动点击「复制截图/复制图片」；未接入 Tauri Clipboard 插件。浏览器模式的真实剪贴板（PNG 324,272 bytes）与下载降级已在阶段 8.2 验证。需要在有屏幕/辅助功能权限的 Mac 上人工复测。
5. **WebKit 沙箱警告**：运行 release/dev 时 WebKit 无法在 `~/Library/WebKit` 建 WebsiteData 目录；页面与 IPC 仍正常。属于当前主机沙箱权限，不是应用逻辑错误。
6. **Windows 未测试**：未在 Windows 编译或运行；未来需使用 Windows target 与对应 installer。
7. **代码签名/公证/自动更新**：未配置。`.app` 为本地构建，不应作为分发签名产物。

## 11. Windows 后续验证计划

1. 在 Windows 11 + WebView2 + Rust stable 上运行 `pnpm install`、`cargo check`、`cargo test`。
2. 将 `bundle.targets` 扩展为 Windows 对应 target（如 `nsis`/`msi`），单独验证安装包；不要把 macOS 的 `app` target 当作 Windows 配置。
3. 验证 480×900 窗口、最小尺寸、DPI 缩放、WebView2 字体/头像/PNG 下载。
4. 在 Windows WebView2 中人工验证剪贴板与下载；如不兼容，再评估 Tauri Clipboard 插件，不在本阶段预接入。
5. 不复制 macOS identifier/签名/更新地址；使用独立的 Windows 打包与签名流程。

## 12. 阶段十 LCU 接入准备

- 保持 `src/services/app.service.ts`、adapters、`AppHealth` 契约不直接耦合 LCU。
- 下一阶段新增 `lcu.service.ts`/Rust command 边界，先只读连接状态，再房间/对局事件；页面不直接调用 LCU HTTP。
- LCU 凭据只留在 Rust 侧内存/受控存储，不进入 Vue、CSP 可读的全局对象或 localStorage。
- 保留本阶段 Mock 作为无客户端时的 fallback；不要用 Mock 冒充真实连接。
- 先补 Rust 错误码、超时、重连和 IPC contract tests，再接真实 LCU。
