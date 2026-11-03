# 阶段状态（2026-11-01）

## 当前阶段：阶段 10.2 LCU Gameflow — 代码/Windows CI 通过，待真实 Windows 游戏流程验收

已完成 Rust LCU 发现、只读 loopback HTTPS 探测、连接状态机、单任务自动重连、Tauri IPC/Event、前端 service/adapter/Pinia 契约。macOS 已实测返回 `unsupported_platform`，不伪造真实客户端；未连接真实 LCU。

阶段 10.2 说明：[PHASE10_2_GAMEFLOW.md](PHASE10_2_GAMEFLOW.md)。

阶段 10.1.5 说明：[PHASE10_1_5_WINDOWS_CI.md](PHASE10_1_5_WINDOWS_CI.md)。

阶段 10.1 说明：[PHASE10_1_LCU_FOUNDATION.md](PHASE10_1_LCU_FOUNDATION.md)。

阶段九基线提交：`d85bb44 chore: establish phase 9 Tauri baseline`。

## 环境

- macOS 27.0.1 arm64；Xcode CLT 27.0；完整 Xcode 未安装。
- Rust 1.99.1 / Cargo 1.99.1（工作区本地工具链）。
- Tauri CLI / JS API 2.12.4；Rust tauri 2.12.5、tauri-build 2.7.4。
- Node 22.23.4 / pnpm 10.34.9。
- 新增 Rust：`reqwest` 0.13.5（rustls）、`tokio` 1.54.1、`async-trait` 0.1；Windows 专用 `sysinfo` 0.40.1。

## 已完成

- `src-tauri/src/lcu/`：discovery、client、connection、monitor、models、error。
- lockfile 解析：`name:pid:port:password:protocol`；只接受 https、非零 PID/端口、非空名称/密码。
- 发现：Windows `LeagueClientUx.exe` + lockfile + PID 校验；不硬编码安装目录/端口；多实例/不可读/无效返回稳定错误。
- 非 Windows：`unsupported_platform`，不创建 monitor、不发起网络请求。
- 只读 HTTP：专用 loopback `reqwest` client，仅 `GET /riotclient/region-locale`；3 秒连接/请求超时。
- 自签名证书：仅专用 client 禁用验证，目标固定 `https://127.0.0.1:{port}`；未全局关闭 TLS。
- 状态机：unsupported_platform/not_running/discovering/connecting/connected/disconnected/reconnecting/error。
- 状态 DTO：code/message/source/simulated/revision/updatedAt/monitoring；无密码/Authorization。
- 监控：单任务、2s 正常轮询、500ms–5s 退避、generation 防旧结果、stop/shutdown 清理。
- Tauri 命令：`lcu_get_connection_status`、`lcu_start_monitoring`、`lcu_stop_monitoring`；事件 `lcu://connection-status`。
- 前端：`types/lcu.ts`、`services/lcu.service.ts`、browser/tauri adapters、Pinia `lcuStatus`；App 静默订阅/获取/启动，无 UI 改动。
- 浏览器 Mock `source=mock/simulated=true`；macOS Tauri `source=unavailable/simulated=false`；真实失败不会变成 connected。
- `app_health_check` 继续正常。
- 新增 7 个前端测试；原有 75 个测试未删除。

## 实际验证结果

- `pnpm install --frozen-lockfile`：通过。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm format:check`：通过。
- `pnpm test`：**17 文件 / 82 测试通过**。
- `pnpm build`：**106 模块**。
- `pnpm check`：通过。
- `pnpm audit`：0；`pnpm audit --prod`：0。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过，无 warning。
- `cargo test --manifest-path src-tauri/Cargo.toml`：**27 passed**。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`：通过。
- `pnpm tauri dev`：Vite 1420 + Tauri 窗口；实际日志：

```text
[app_health_check] runtime=tauri status=ok version=0.1.0 simulated=true
[lcu_get_connection_status] status=UnsupportedPlatform source=Unavailable
[lcu_start_monitoring] status=UnsupportedPlatform source=Unavailable monitoring=false
```

- `pnpm tauri build`：通过，`ARAM Mayhem.app` 11.36 MiB。
- release `.app` 运行：同样得到 `UnsupportedPlatform/Unavailable`，无 monitor 任务。
- 原始 HTML SHA-256：`6197327909428f19baca483aa8ec9de170bfa8a34bf88e9d2db4b7546fbecd9e`，未变化。

## 未完成 / 风险

- **Windows 真实 LCU 未验证**：无 Windows/LOL 环境；Windows 条件代码未实机编译/运行。
- 尝试 `cargo check --target x86_64-pc-windows-msvc` 被缺失的 MSVC SDK/`windows.h`（aws-lc-sys 构建）阻断，不能据此声称 Windows 代码已类型验证。
- Windows 需验证：无客户端、启动中、登录后、关闭、重启、端口/认证变化、应用先后启动。
- 自签名证书策略隔离在专用 loopback connector；仍存在本机端口劫持风险，需 Windows 安全评审。
- 真实 Tauri Event 只在 macOS 无状态变化场景/前端 mock 测试覆盖；Windows 真实事件未验证。
- 桌面截图/拖拽、WebView 剪贴板/下载仍受 macOS 权限限制（阶段九遗留）。
- `connected` 仅表示认证探测成功，不代表已登录/房间中/游戏中。
- 无 tray/auto-start/updater/DB/真实战绩/红包/任何 LCU 写操作。

## 后续

1. 在 Windows 实机完成阶段 10.1 全场景验证，修正 `sysinfo`/进程/HTTP 差异。
2. 阶段 10.2 再接入只读 gameflow/房间；状态与连接状态分离，事件按 revision 消费。
3. 增加本地假 LCU HTTPS 服务集成测试（auth/timeout/restart），再考虑真实客户端。
4. 凭据保持 Rust 内存；日志/事件/测试不得出现 password/Authorization。

## Windows CI 结果

- Run `41294166671` 成功；Windows-2022：82 前端测试、27 Rust 测试、MSVC check、NSIS 构建、Artifact 上传。
- NSIS `ARAM Mayhem_0.1.0_x64-setup.exe`：4,182,062 bytes，SHA-256 `d08cacced2dde3049860a52fed425752b9748c035c4af14635b5099b57bf205f`。
- Artifact：`aram-mayhem-windows-x64`，id `13078453720`。
- 真实 Windows 10/11 桌面和真实 LCU 仍未验收；GitHub Runner 通过不等于桌面验收。

## 阶段 10.2 结果

- Rust：Gameflow phase、Lobby/ChampSelect 解析、会话生命周期、WAMP WebSocket、轮询 fallback、generation 防旧结果。
- 前端：Gameflow types/adapter/service/Pinia/i18n 映射；页面无新增视觉。
- 测试：90 前端 / 47 Rust；Windows CI Run `41312013808` 成功（MSVC check/test/NSIS/Artifact）。
- Artifact：`aram-mayhem-windows-x64`，id `13085867754`；NSIS 4,315,210 bytes，SHA-256 `e5df5ce93e184e40ba46afb7746cde697477c111b9fddc331e54237b48103342`。
- macOS Tauri：`connected=false phase=None transport=Disconnected`，不伪造真实数据。
- 真实 Windows 10/11 桌面与真实 LCU gameflow 未验收。

## CI 优化

- Validation：`windows-validation.yml`（push/manual），9m28 冷缓存，不保存 1GB Rust cache。
- Release：`windows-release.yml`（手动），热缓存 4m19，基线 11m42；前端只构建一次。
- Artifact：`aram-mayhem-windows-x64` id `13087243783`；NSIS 4,313,373 bytes；SHA-256 `26916b588de478350d7444cc454b9a74dafcecef710e34c3d2e3ac2bcdb02f48`。
- 详情：[CI_OPTIMIZATION.md](CI_OPTIMIZATION.md)。

## LCU 真实连接状态修复

- 已完成浏览器 Mock / Tauri 真实 LCU 状态分流；Tauri `isConnected` 只接受 `source=real`、`simulated=false`、`status=connected`。
- AppShell 自动切换；连接页 Tauri 重试改为真实 `startLcuMonitoring`；Header/Home 不再冒充真实数据。
- 测试：102 前端 / 47 Rust。
- Validation：run `41404607342`；Release：run `41405146532`；Artifact `13123466431`；SHA-256 `14b022f98067e369849304c9d88d8d8c2b7e8e1e3dc2e0e8089213a015ab3705`。
- Windows 真实客户端实机连接未执行，阶段 10.1 不能正式通过。

## LCU 凭据发现改进

- args-first：同一进程内 `--app-port` + `--remoting-auth-token`；PID/name 归属校验。
- lockfile 回退：Windows 共享读取、3 次重试、空内容/占用不算连接、PID 校验。
- 无 WMIC、无凭据缓存、无日志 token。
- Windows CI Rust 54 通过（含共享锁测试）；前端 102 通过。
- 最新 Release：`41586391688`；Artifact `13208610941`；SHA-256 `7668e7e71c594363d162043a00b161be65ca9f5625e57801ed822d73f1140a3e`。
- Windows 真实启动参数与 HTTPS probe 尚未确认；阶段 10.1 不能正式通过。
