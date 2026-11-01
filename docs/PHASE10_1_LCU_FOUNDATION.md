# 阶段 10.1：Rust LCU 发现、只读连接、状态机与自动重连

结论：**开发完成，待 Windows 实机验证**。
macOS 已验证：Rust 状态机/监控器、Mock 测试、Tauri IPC 返回 `unsupported_platform`、前端 82 测试、release `.app` 构建。未连接真实 LCU，也未在 Windows 运行。

## 0. 基线

- 阶段九基线已提交：`d85bb44 chore: establish phase 9 Tauri baseline`。
- `.cargo/`、`.rustup/`、`src-tauri/target/`、`src-tauri/gen/`、`.env*`、私钥/证书文件已加入忽略规则。
- 原始 HTML SHA-256：`6197327909428f19baca483aa8ec9de170bfa8a34bf88e9d2db4b7546fbecd9e`，未变化。

## 1. 模块结构

```text
src-tauri/src/
├── commands/
│   ├── app.rs                 # 保留 app_health_check
│   └── lcu.rs                 # 3 个只读 LCU 命令 + Tauri Event
├── lcu/
│   ├── mod.rs                 # 导出与 lcu://connection-status
│   ├── discovery.rs           # lockfile 解析、PID 校验、Windows 进程发现
│   ├── client.rs              # 专用 loopback HTTPS 连接器、只读探测
│   ├── connection.rs          # 状态机、revision、generation
│   ├── monitor.rs             # 单任务监控、退避、LcuSource 注入、退出清理
│   ├── models.rs              # LcuStatus/LcuStatusDto/StatusUpdate
│   └── error.rs               # 稳定错误码、无凭据/堆栈
└── lib.rs                     # manage(SystemLcuManager) + RunEvent::Exit
```

前端：

```text
src/types/lcu.ts               # LcuConnectionStatus/LcuStatusDto/LcuAdapter
src/services/lcu.service.ts    # 浏览器/Tauri runtime 选择
src/services/desktop-error.ts  # LcuServiceError（清洗后错误）
src/adapters/browser.adapter.ts# source=mock 的浏览器 Mock
src/adapters/tauri.adapter.ts  # 唯一 invoke/listen 的 LCU 模块
src/stores/app.ts              # lcuStatus + setLcuStatus（不驱动现有 UI）
src/App.vue                    # 静默订阅/获取/启动/停止，无可见测试按钮
```

## 2. 客户端发现与 Windows 适用范围

- 解析 League Client 的 `lockfile`：`name:pid:port:password:protocol`。
- 只接受 `https`、非零 PID/端口、非空名称/密码。
- `LcuClient::endpoint()` 固定 `https://127.0.0.1:{port}`，不从 lockfile 接受任意主机。
- 校验 lockfile 的 PID 等于运行中的 `LeagueClientUx.exe` 进程 PID，防止旧 lockfile/错误实例。
- Windows 发现：
  - 使用 `sysinfo` 列出 `LeagueClientUx.exe`（兼容无扩展名）。
  - 从进程可执行文件父目录读取 `lockfile`；不硬编码安装目录。
  - 如果可执行路径不可用，读取进程参数 `--install-directory=...` 作为 fallback。
  - 多实例/无效 lockfile/不可读 lockfile 返回 `discovery_failed`/`invalid_lockfile`；无进程返回 `Ok(None)`。
- 非 Windows：`discover()` 直接返回 `unsupported_platform`，在任何 HTTP/TLS 请求前终止。
- 不保存凭据到磁盘；`LcuClient`/`LcuLockfile` 的 Debug 输出将 password 替换为 `[REDACTED]`。

**Windows 适用范围**：代码已按 Windows 条件编译编写，但当前 macOS 环境没有真实客户端，且交叉 `cargo check --target x86_64-pc-windows-msvc` 因缺少 Microsoft SDK 头文件 `windows.h`（aws-lc-sys 构建）失败。不能声称 Windows 发现/连接已验证。

## 3. 只读 LCU HTTP 与 TLS

- Rust `reqwest` 专用 client，`https_only(true)`。
- 探测范围只有只读 `GET /riotclient/region-locale`；无任何写请求、无游戏状态修改。
- 连接/请求超时均为 3 秒。
- 自签名证书处理：
  - `danger_accept_invalid_certs(true)` **仅**应用于此专用 `LcuHttpClient`；不对全局 reqwest/系统 TLS 做修改。
  - 目标固定为发现结果中的 `https://127.0.0.1:{port}`，不使用用户输入 URL。
  - 原因：LCU 在 loopback 使用自签名证书；该策略只覆盖经过 lockfile+PID 校验的本地客户端。
  - 风险：若本机其他进程劫持 loopback 端口，可能被误连；通过 PID/port/lockfile 校验和 loopback 限制降低风险，但仍需 Windows 实机验证。
- 认证：每请求 `basic_auth("riot", password)`；密码只在内存和请求头中使用。
- 不打印 password、Authorization、lockfile 原文或请求头。
- 错误映射：
  - 401/403 → `authentication_failed`
  - 连接拒绝 → `connection_refused`
  - 超时 → `timeout`
  - TLS → `tls_error`
  - 非 2xx → `http_status`
  - JSON 解析失败 → `invalid_response`
  - 其他 → `internal`
- 所有对前端错误只有 `{ code, message }`，无宿主堆栈。

## 4. 状态机

```ts
type LcuConnectionStatus =
  | 'unsupported_platform'
  | 'not_running'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
```

- 初始 macOS：`unsupported_platform`、`source=unavailable`、`monitoring=false`。
- 初始 Windows：`not_running`、`source=real`。
- 启动监控：`discovering` → `connecting` → `connected`。
- 无客户端：`not_running`（code `client_not_found`）。
- 客户端退出：`disconnected`（code `client_exited`）。
- 重启/端口变化：重新 discovery，fingerprint 改变后 `connecting` → `connected`。
- 失败：认证/格式错误为 `error`；拒绝/超时/TLS/HTTP 为 `disconnected`；重试前 `reconnecting`。
- `LcuStatusDto` 包含 `revision`、`updatedAt`、`monitoring`、`source`、`simulated`。
- 相同状态/错误码/工作模式不重复发事件；`updatedAt`/`revision` 只在变化时更新。
- `generation` 在停止/重启时递增；旧异步结果通过 `machine.is_current(generation)` 丢弃。
- 本状态**不代表**房间中/游戏中；不读取 gameflow。

## 5. 监控与重连

- `LcuManager` 是单一连接管理器；`start_monitoring` 在已有任务时直接返回当前状态，不重复创建。
- 后台任务使用 Tokio，不阻塞 Tauri UI。
- 默认：
  - 已连接轮询：2 秒。
  - 失败初始退避：500ms，倍增，最大 5 秒。
  - 成功后退避重置。
- 每次重试重新 `discover`，因此会重新读取进程/PID/lockfile；客户端重启/端口变化可恢复。
- `stop_monitoring` 发送 cancellation、等待 JoinHandle、使 generation 失效；新启动的监控不会被旧 stop 覆盖。
- `shutdown()` 用于应用退出：take monitor、递增 generation、abort task，无残留后台任务。
- 前端在 `onUnmounted` 注销 event listener 并调用 stop；Tauri `RunEvent::Exit` 再次 shutdown 兜底。

## 6. IPC 契约

命令：

```text
lcu_get_connection_status
lcu_start_monitoring
lcu_stop_monitoring
```

事件：

```text
lcu://connection-status
```

`LcuStatusDto`（Rust camelCase，TS 同名）：

```ts
interface LcuStatusDto {
  status: LcuConnectionStatus
  code: string | null
  message: string | null
  source: 'real' | 'unavailable' | 'mock'
  simulated: boolean
  revision: number
  updatedAt: number
  monitoring: boolean
}
```

前端调用链：

```text
App.vue
  -> subscribeLcuStatus(listener)        // Tauri listen / browser no-op
  -> getLcuConnectionStatus()            // lcu_get_connection_status
  -> startLcuMonitoring()                // lcu_start_monitoring
  -> stopLcuMonitoring() on unmount      // lcu_stop_monitoring
```

Tauri adapter 将 invoke/listen 错误转换为 `LcuServiceError('lcu.ipc_failed', ...)`，不泄露 Rust 异常/凭据。

## 7. Mock 与真实模式隔离

| 运行环境          | source                    | simulated | 行为                                             |
| ----------------- | ------------------------- | --------- | ------------------------------------------------ |
| `pnpm dev` 浏览器 | `mock`                    | true      | 现有 Mock 连接；Lcu status 为显式 mock connected |
| macOS Tauri       | `unavailable`             | false     | `unsupported_platform`；不启动网络任务           |
| Windows Tauri     | `real`                    | false     | 发现/连接真实本机 LCU；未实机验证                |
| Rust 单元测试     | `real` + 注入 `LcuSource` | false     | 可控 fake discovery/probe                        |

- 浏览器 Mock 不会变成 `source=real`。
- macOS Tauri 没有伪造 `connected`；实际日志为 `status=UnsupportedPlatform source=Unavailable`。
- 真实连接失败不会回退为 connected；只返回 error/disconnected/not_running。
- 现有 `connectionPhase`（首页模拟连接）与 `lcuStatus` 分离；未修改 UI。
- `LcuSource` trait 支持测试注入：`discover()` / `probe()` 可替换为 fake。

## 8. 测试结果

### Rust

```text
cargo test --manifest-path src-tauri/Cargo.toml
27 passed; 0 failed
```

覆盖：

- 无客户端、unsupported platform。
- lockfile 正常解析、非法字段、PID 不匹配。
- HTTP client 仅 loopback、专用 TLS client 构建。
- 状态机 revision/时间戳/同状态抑制/generation。
- 正常连接、认证失败、连接拒绝、超时、非法响应。
- 客户端退出、重启/端口变化、自动重连。
- 重复启动不创建第二个任务。
- stop/shutdown 清理；旧 generation 不覆盖新状态。
- 事件 status 序列化不含 password/authorization；Debug 输出 redacted。
- 原有 `app_health_check` 3 测试保持。

### Vue / TypeScript

```text
pnpm test: 17 files / 82 tests passed
pnpm build: 106 modules
pnpm check: passed
pnpm audit / audit --prod: 0
```

新增 7 个前端测试：browser Mock source、Tauri LCU invoke/event、service runtime 选择、Pinia lcuStatus、错误清洗。原有 75 个测试未删除或降低断言。

### macOS Tauri 实际日志

```text
[app_health_check] runtime=tauri status=ok version=0.1.0 simulated=true
[lcu_get_connection_status] status=UnsupportedPlatform source=Unavailable
[lcu_start_monitoring] status=UnsupportedPlatform source=Unavailable monitoring=false
```

Tauri dev 与 release `.app` 均重复得到上述结果；没有启动 monitor，也没有伪造真实 LCU。

### 构建

- `pnpm tauri build` → `ARAM Mayhem.app`，11.36 MiB。
- macOS 屏幕录制/辅助功能权限仍不可用，无法截图或自动拖拽；不是本阶段代码问题。
- DMG 仍受 `hdiutil` 沙箱限制，bundle target 仍为 `app`。

## 9. Windows 实际验证结果

**未执行。**

- 当前机器为 macOS 27.0.1 arm64，无 Windows/LOL 客户端。
- 已完成 Windows 条件编译代码（`#[cfg(windows)]`），但未在 Windows 编译/运行。
- 交叉检查 `cargo check --target x86_64-pc-windows-msvc` 被 `aws-lc-sys` 构建所需的 `windows.h`/MSVC SDK 缺失阻断；这不是对本项目 Windows 代码的类型验证。
- 不得声称已发现/连接真实 LCU，也不得声称 Windows 自动重连已验证。

必须在安装并运行 LOL 客户端的 Windows 上验证：无客户端、启动中、已登录、主动关闭、重启、端口/认证变化、应用先/后启动。

## 10. 风险与限制

1. Windows 条件代码未实机编译/运行；`sysinfo` 版本/API 和 `LeagueClientUx.exe` 行为需实机确认。
2. 自签名证书的专用 loopback TLS 策略降低但不消除本机端口劫持风险；需 Windows 实机安全评审。
3. 未接真实 LCU，所有状态来自 Rust 单元测试/fake source 或 macOS unsupported 结果。
4. 桌面窗口截图/拖拽、WebView 剪贴板/下载仍受 macOS 权限限制；阶段九遗留。
5. `connected` 仅表示认证探测成功，不代表已登录/房间中/游戏中。
6. 无 tray/auto-start/updater/DB/LCU 写操作/真实战绩。
7. `LcuStatus` 事件在 macOS 上无真实状态变化，无法验证实际 event payload 到达 Vue；Tauri adapter event 仅由前端契约测试覆盖。
8. 进程发现/HTTP connector 依赖本机环境；Windows 需验证多实例、权限、编码、路径。

## 11. 阶段 10.2 准备

- 在 Windows 实机先完成 10.1 全场景验收，再读取 gameflow/房间。
- 新增只读 endpoint 时保持 service/command 边界，不把 HTTP 直接放入 Vue。
- 增加 `event revision` 的消费策略：Vue 只接受更高 revision，避免乱序。
- 为 `connected` 后的 gameflow 状态建立独立契约，不复用连接状态。
- 凭据仍只留 Rust 内存；日志/事件/测试不得包含 password/Authorization。
- 先用本地假 LCU HTTPS 服务做 auth/超时/重启集成测试，再接真实客户端。
- 不提前实现红包、结算或任何写操作。

## 12. 阶段 10.1.5 Windows CI 补充

- Windows CI Run `41294166671` 成功；Windows-2022。
- `cargo check --target x86_64-pc-windows-msvc` 通过；`cargo test --target ...` 27 passed。
- `pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis` 成功。
- NSIS `ARAM Mayhem_0.1.0_x64-setup.exe` 4,182,062 bytes；SHA-256 `d08cacced2dde3049860a52fed425752b9748c035c4af14635b5099b57bf205f`。
- Artifact `aram-mayhem-windows-x64`（id `13078453720`）已上传。
- 真实 Windows 10/11 桌面安装/运行与真实 LCU 仍未验收。
- 详情：[PHASE10_1_5_WINDOWS_CI.md](PHASE10_1_5_WINDOWS_CI.md)。
