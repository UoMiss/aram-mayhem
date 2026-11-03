# LCU 真实连接状态与首页联动修复

## 修复前 P0 证据

审计报告：[LCU_API_INTEGRATION_AUDIT.md](LCU_API_INTEGRATION_AUDIT.md)。

- Rust 状态事件写入 `lcuStatus`，但 `isConnected` 仍来自 `connectionPhase`。
- `App.vue` 使用 `app.isConnected`，因此真实 connected 不会切到 AppShell。
- `ConnectionScreen.vue` 的「重新连接」调用 `app.connect()` 的 1.5s Mock。
- `AppHeader.vue`/`HomePage.vue` 使用 Mock 连接状态和固定资料。

## 修复方案

### 浏览器与 Tauri 分流

`src/stores/app.ts`：

- 保留 `connectionPhase` 给浏览器 Mock。
- 新增 `isDesktopRuntime`（`isTauri()`）。
- 新增 `isRealLcuConnected`：只有 `source=real`、`simulated=false`、`status=connected` 才成立。
- `isConnected`：
  - 浏览器：`connectionPhase === 'connected'`
  - Tauri：`isRealLcuConnected`
- `isConnecting`：
  - 浏览器：`connectionPhase === 'connecting'`
  - Tauri：`discovering|connecting|reconnecting`
- `connect()` 在 Tauri 下直接 no-op，不能人为制造 connected。
- `setLcuStatus` 增加 revision 防护；只有真实 connected 清除 bridge error。

### 页面联动

- `App.vue`：AppShell/ConnectionScreen 由统一 `app.isConnected` 自动切换；真实 connected 自动进入首页，disconnected/not_running/error 自动回连接页。
- `AppHeader.vue`：使用统一 `app.isConnected`。
- `ConnectionScreen.vue`：
  - 浏览器保留 Mock `app.connect()`。
  - Tauri 下按钮改为 `startLcuMonitoring()`，幂等触发真实检测；不调用 Mock。
  - 显示未运行/检测中/连接中/已断开/错误/unsupported 状态。
  - 移除固定 `2999` 和 `Process 'LeagueClient.exe' NOT found`。
- `HomePage.vue`：
  - 浏览器 Mock 显示「演示数据」标识。
  - Tauri 真实 connected 时隐藏 Mock 召唤师/房间，显示「真实玩家资料尚未接入」。
  - 不新增真实 summoner 接口。

### 诊断

- Tauri adapter 错误码：
  - `lcu.status_failed`
  - `lcu.start_failed`
  - `lcu.stop_failed`
  - `lcu.subscribe_failed`
- `App.vue` 将 LcuServiceError code 写入 Pinia `lcuBridgeError`；连接页显示脱敏 code。
- Rust monitor 状态变化打印 `[lcu_status]`（仅 status/source/code/monitoring，不含凭据）。
- 不输出 password/token/Authorization/完整异常堆栈。

## 测试

- 新增 `src/stores/app.desktop.test.ts`（7）。
- 新增 `src/App.desktop.test.ts`（5）。
- 当前：19 文件 / **102 前端测试**。
- Rust：**54 测试**（Windows CI，含 Windows-only 测试）。
- 浏览器 Mock 原有测试全部保留。

覆盖：

- 浏览器 Mock 点击连接进入首页。
- Tauri 初始 disconnected 显示连接页。
- Tauri real connected 自动首页。
- 真实 disconnected 自动回连接页。
- not_running 不显示已连接。
- mock/simulated/unavailable 不显示真实连接。
- Tauri connect() 不执行 Mock。
- revision 旧快照丢弃。
- bridge error 可显示。
- Header/Home 状态一致。
- 已移除固定端口/进程文案。

## 未完成

- 真实 Windows 10/11 + LOL 客户端实机连接尚未执行。
- Windows CI 编译/NSIS 构建不能替代真实客户端连接验证。
- 真实 Windows 未验证前，阶段 10.1 不能判定正式通过。

## 验证顺序

1. Windows 实机启动 ARAM（无 LOL）→ 未连接。
2. 启动 LOL/登录 → Rust probe → connected → 首页自动出现。
3. 关闭 LOL → disconnected → 连接页自动恢复。
4. 重启 LOL（不重启 ARAM）→ 自动重连。
5. 若失败，先看 `[lcu_status]` 与 `lcuStatus.code`，再决定是否修改 discovery/probe。

## Windows CI 与 Artifact

- Commit SHA：`11fe3f01ac02397eca1981a5348194659754e01c`
- Validation：https://github.com/UoMiss/aram-mayhem/actions/runs/41404607342
  - 3m49；102 前端测试、47 Rust 测试、audit；通过
- Release：https://github.com/UoMiss/aram-mayhem/actions/runs/41405146532
  - 4m29；Rust cache full match；通过
- Artifact：`aram-mayhem-windows-x64`（id `13123466431`）
- 安装包：`aram-mayhem-windows-x64-setup.exe`
- 大小：**4,314,581 bytes**
- SHA-256：

```text
14b022f98067e369849304c9d88d8d8c2b7e8e1e3dc2e0e8089213a015ab3705
```

- 下载页：https://github.com/UoMiss/aram-mayhem/actions/runs/41405146532/artifacts/13123466431
- 未签名、未创建 GitHub Release。
- CI 只证明编译/测试/NSIS；**不证明 Windows 真实 LCU 已连接**。

## 验收状态

- 代码/自动化/Windows Release 构建：通过。
- Windows 10/11 + LOL 客户端实机连接：**未执行，不能判定正式通过阶段 10.1**。
- 下一步必须按上面的实机顺序验证；若失败，先收集 `[lcu_status]` 和 `lcuStatus.code`，不要先改 discovery/probe。
