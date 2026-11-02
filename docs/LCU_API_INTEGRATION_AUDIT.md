# LCU API 一致性与首页连接状态专项审计

**审计日期：** 2026-11-02  
**范围：** 只读源码、配置和项目内 LCU 文档；未修改业务代码、UI、Mock、Tauri 安全配置，未推送 GitHub。

结论先行：**现有 Rust LCU 连接链路已经注册并有前端启动调用，但首页/连接页从未消费 `lcuStatus`。真实 Windows 上即使 Rust 已经 `connected`，UI 仍会停留在 `connectionPhase = 'disconnected'` 的「未连接」页。**

---

## 1. 文档基线

文件：[docs/LCU_API_完整文档.md](LCU_API_完整文档.md)

| 项目               | 内容                                                                                       | 位置          |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------- |
| 来源               | `https://lcu.kebs.dev/`，社区逆向整理，不是 Riot 官方稳定 API                              | 文档第 3-5 行 |
| 站点标注客户端版本 | `26.20`                                                                                    | 第 3 行       |
| 生成日期           | `2026-11-02`                                                                               | 第 3 行       |
| 连接方式           | 客户端运行期间本机 HTTPS；端口/密码由启动参数或 `lockfile` 获取；用户名 `riot`；Basic Auth | 第 9-12 行    |
| 响应可靠性         | 文档明确：未提供的返回体结构/状态码/上下文不得猜测                                         | 第 5 行       |

### 1.1 文档覆盖情况

- **HTTP 路径覆盖：** `region-locale`、`gameflow-phase`、`gameflow session`、`lobby`、`champ-select session` 等路径均存在。
- **响应 Schema：** 文档对上述接口普遍写的是：

  > “原始数据没有可可靠确认的统一响应 Schema；请以实际客户端版本的返回为准。”

  例如 `gameflow-phase` 第 7566 行、`gameflow session` 第 7630 行、`lobby` 第 10016 行、`champ-select` 第 2265 行、`region-locale` 第 8998 行。

- **WebSocket/WAMP 协议：** 文档只有 builtin `Subscribe`（第 444-459 行）和 `WebSocketFormat`（第 481-495 行、第 43627-43643 行）；**全文未说明** `OnJsonApiEvent`、WAMP 数组帧格式或订阅路径。
- **lockfile 格式：** 文档只说明可从 `lockfile` 或启动参数获取端口/密码（第 9-10 行）；**未说明**字段格式、PID、进程名、安装目录/路径。
- **错误响应/状态码：** 未见统一错误 Schema 或状态码说明；仅 `error-monitor` 是业务插件，不是 LCU 连接错误协议。
- **客户端生命周期：** 只说明客户端运行期间提供接口；**未说明**断线、重连、进程重启、端口变化处理。
- **官方来源：** 本审计没有引用 Riot 官方/外部社区新规范；以上均为项目内文档结论。任何外部补充都应另列来源。

### 1.2 文档没有覆盖的机制（明确标记“文档未说明”）

1. `OnJsonApiEvent` / WAMP 事件帧。
2. `lockfile` 的精确格式和进程发现方式。
3. HTTP 响应体、错误状态码和 404/认证失败语义。
4. 客户端退出/重启/端口变化的重连语义。
5. `current-summoner` 在真实登录流程中的调用时机（文档仅给路径/示例）。

---

## 2. API 逐项对照

> “是否一致”区分 **路径一致**、**响应契约未被文档确认** 和 **未使用**。接口字符串存在不等于真实执行。

| API 路径                                | 文档定义                                                               | Rust 实际实现                                                              | 是否一致                          | 文件及行号                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `GET /lol-summoner/v1/current-summoner` | 文档列出 GET 路径和 curl 示例，无响应 Schema                           | **未调用**；Rust 没有当前召唤师请求                                        | 不适用/未实现                     | 文档第 11、18420-18428 行；Rust 无对应调用                                        |
| `GET /riotclient/region-locale`         | 文档列出 GET，无响应 Schema                                            | 作为连接 probe 使用；只 GET，Basic Auth                                    | **路径一致；响应契约未确认**      | 文档第 8990-8998 行；`src-tauri/src/lcu/client.rs:6, 36-41`；`monitor.rs:366-370` |
| `GET /lol-gameflow/v1/gameflow-phase`   | 文档列出 GET，无响应 Schema                                            | `PHASE_PATH`，按字符串解析为 GameflowPhase                                 | **路径一致；响应假设未确认**      | 文档第 7558-7566 行；`src-tauri/src/lcu/gameflow_monitor.rs:27, 399-406`          |
| `GET /lol-gameflow/v1/session`          | 文档列出 GET，无响应 Schema                                            | 仅在部分游戏阶段可选读取，仅提取 gameId                                    | **路径一致；响应字段未确认**      | 文档第 7622-7630 行；`gameflow_monitor.rs:28, 424-437`                            |
| `GET /lol-lobby/v2/lobby`               | 文档列出 GET，无响应 Schema                                            | 仅 Lobby 阶段可选读取；解析 lobbyId/gameConfig/members                     | **路径一致；响应字段未确认**      | 文档第 10008-10016 行；`gameflow_monitor.rs:29, 412-415`；`lobby.rs:7-27`         |
| `GET /lol-champ-select/v1/session`      | 文档列出 GET，无响应 Schema                                            | 仅 ChampSelect 阶段可选读取；解析 myTeam/theirTeam                         | **路径一致；响应字段未确认**      | 文档第 2257-2265 行；`gameflow_monitor.rs:30, 416-421`；`champ_select.rs:7-30`    |
| `OnJsonApiEvent` WebSocket 事件         | **文档未说明**该事件名/WAMP 帧；只有通用 `Subscribe`/`WebSocketFormat` | 连接 `wss://127.0.0.1:{port}`，发送 `[5,"OnJsonApiEvent"]`，解析 `[8,...]` | **文档未覆盖；实现未与文档核对**  | `src-tauri/src/lcu/gameflow_events.rs:56-58, 104-166`                             |
| `lockfile`（非 HTTP）                   | 只说明可从中获取端口/密码，无格式                                      | `name:pid:port:password:protocol` + PID 校验                               | **文档未覆盖格式；实现未确认**    | 文档第 9-10 行；`discovery.rs:30-76, 156-190`                                     |
| Basic Auth                              | `riot` + password                                                      | `.basic_auth("riot", password)`                                            | **一致（机制层面）**              | 文档第 9-12 行；`client.rs:41, 106`；`gameflow_events.rs:108-115`                 |
| HTTPS 自签名                            | 文档示例 `curl -k`，说明本机测试                                       | 专用 reqwest/WSS connector `danger_accept_invalid_certs`，仅 loopback      | **意图一致；实际 Windows 未验证** | 文档第 9-12 行；`client.rs:22-26`；`gameflow_events.rs:117-118`                   |

### 2.1 关键结论

- **路径层面**：当前 Rust 使用的 LCU HTTP 路径与项目文档一致。
- **契约层面**：文档没有为这些接口提供可靠响应 Schema，Rust 对 `gameflow-phase` 字符串、`lobby` 字段、`champ-select` 字段的解析属于**未由文档确认的假设**。
- **WebSocket 层面**：`OnJsonApiEvent` 在项目文档中缺失，WSS 实现无法宣称“已按项目文档验证”。
- **current-summoner**：Rust 没有调用；连接 probe 使用的是 `region-locale`，不是 `current-summoner`。

---

## 3. Rust 实现审计

### 3.1 Windows 客户端发现

[src-tauri/src/lcu/discovery.rs](../src-tauri/src/lcu/discovery.rs)

- `discover()`：Windows 才调用 `discover_windows()`；非 Windows 返回 `unsupported_platform`，第 143-152 行。
- `discover_windows()`：
  - `sysinfo::System::new_all()`，第 160 行。
  - `refresh_processes`，第 163 行。
  - 只匹配 `LeagueClientUx.exe` / `LeagueClientUx`，第 166-171 行。
  - 从进程 `exe()` 父目录读取 `lockfile`，第 174-180 行。
  - 校验 lockfile PID 与进程 PID，第 181 行。
  - 多实例/不可读/非法 lockfile 返回错误，第 178-190 行。
- 文档只描述 lockfile/启动参数，不提供进程名、路径或 lockfile 字段；因此这部分属于 P2 实机验证项。

### 3.2 端口、认证、HTTPS

[src-tauri/src/lcu/client.rs](../src-tauri/src/lcu/client.rs)

- 只接受 `https://127.0.0.1:{port}`，`LcuClient::endpoint()`，discovery 第 118-120 行。
- `LcuHttpClient::new()` 使用 `https_only(true)` 和专用 `danger_accept_invalid_certs(true)`，第 21-31 行。
- `probe()` 请求 `/riotclient/region-locale`，Basic Auth，第 36-64 行。
- 401/403 → `authentication_failed`；连接拒绝/超时/TLS/非 2xx 有对应错误码，`error.rs:7-35`。
- 文档只说明 Basic Auth/HTTPS 机制，没有响应 Schema 或错误状态码。

### 3.3 连接状态机与重连

[src-tauri/src/lcu/monitor.rs](../src-tauri/src/lcu/monitor.rs)

- `SystemLcuManager::system()`：Windows 初始 `NotRunning`，macOS `UnsupportedPlatform`，第 382-391 行。
- `start_monitoring()` 创建单一后台任务，第 82-128 行。
- `run_monitor()`：
  - 每轮重新 `discover()`，第 250-253 行；客户端后启动可被发现。
  - 发现客户端后先 `Connecting`，再 `probe()`，第 267-297 行。
  - probe 成功才 `Connected`，第 281-285 行；**不会仅凭进程存在就 connected**。
  - 无客户端 `NotRunning`，第 257-265 行。
  - 客户端退出/重启/端口变化由每轮 discover + fingerprint 处理，第 257-275 行。
  - 错误进入 error/disconnected，并按 500ms-5s 退避重试，第 286-330 行。
- Windows `SystemLcuSource::probe` 创建 HTTP client 并 probe，第 360-377 行。

### 3.4 Gameflow / Lobby / ChampSelect

[src-tauri/src/lcu/gameflow_monitor.rs](../src-tauri/src/lcu/gameflow_monitor.rs)

- 阶段路径：第 27-30 行。
- `read()`：先 phase；仅 Lobby 读 lobby；仅 ChampSelect 读 champ-select；部分游戏阶段可选读 session，第 394-437 行。
- 默认轮询：WebSocket 5s，fallback 1.5s，第 40-48 行；第 346-352 行。
- WSS：`gameflow_events.rs` 连接、订阅、过滤 URI、只发送 wake，第 56-80、104-166 行。
- 文档缺少 WAMP 细节；这部分不能标注为“按文档已验证”。

### 3.5 Tauri Command / Event

[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)

- 构造两个 manager：第 15-17 行。
- 注册 `lcu_get_connection_status`、`lcu_start_monitoring`、`lcu_stop_monitoring`、gameflow 命令：第 18-25 行。
- **没有在 Tauri `setup` 中自动启动 Rust monitor**；启动入口在 `App.vue:49`。
- `lcu_start_monitoring` 通过 `app.emit("lcu://connection-status", status)` 发送事件：`commands/lcu.rs:20-34`。
- capabilities 仅有 `core:default`；本地生成的权限 schema 表明 `core:default` 包含 `core:event:default`，因此事件监听权限本身不是已确认的 P0。

---

## 4. 真实 LCU 连接是否运行

### 4.1 启动入口

实际链路：

```text
Tauri 启动
  lib.rs:15-25 manage(SystemLcuManager) + 注册 command
    ↓
前端 App.vue onMounted（第 25 行）
  subscribeLcuStatus（第 30 行）
  getLcuConnectionStatus（第 41 行）
  startLcuMonitoring（第 49 行）
    ↓
tauri.adapter.ts:47-52  invoke('lcu_start_monitoring')
    ↓
commands/lcu.rs:20-34  state.start_monitoring(callback)
    ↓
monitor.rs:82-128  spawn run_monitor
    ↓
monitor.rs:250-309  discover → probe → connected/error
```

结论：

- **不是 Rust 后台自动启动**，而是 **前端 App 挂载后调用 Tauri command 启动**。
- 如果前端脚本未执行、命令失败、或应用窗口没有挂载，Rust monitor 不会启动。
- App 先启动、LOL 后启动：只要 monitor 已启动，`run_monitor` 每轮重新 discover，逻辑上可发现；但需 Windows 实机验证。
- 找到客户端后会实际执行 **`GET /riotclient/region-locale`** 的 Basic Auth 只读 probe，probe 成功才 connected。
- 仅进程存在不会 connected；`discover` 返回 client 后仍必须 probe。
- 客户端退出后，下一轮 discover 返回 none，状态转为 disconnected/not_running；代码路径存在。
- 客户端重启/端口变化：重新读取 lockfile、PID、port；fingerprint 变化后重新连接。
- **当前 Windows Release 是否包含这些功能：** CI 已编译 Windows 条件代码并生成 NSIS；但 CI 编译通过不等于真实 Windows 客户端连接成功。当前没有 Windows 实机日志。

### 4.2 当前进程/状态证据

- macOS Tauri 实际日志（阶段 10.1/10.2）：

```text
[lcu_get_connection_status] status=UnsupportedPlatform source=Unavailable
[lcu_start_monitoring] status=UnsupportedPlatform source=Unavailable monitoring=false
```

- 这说明 macOS 的 IPC 链路能到 command，但 macOS 不会执行 Windows discovery/probe。
- 不能据此判断 Windows 真实 LCU 已连接。

---

## 5. Rust → Tauri → Pinia → 首页完整链路

### 5.1 链路逐段

| 阶段             | 实际代码                                                                                             | 结果                          |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| Rust status      | `monitor.rs:281-285` 在 probe 成功后 `Connected`                                                     | 状态存在                      |
| Tauri event      | `commands/lcu.rs:26-27` `app.emit(LCU_STATUS_EVENT, status)`                                         | 事件发送                      |
| 前端注册         | `App.vue:30` `subscribeLcuStatus(...)`；`tauri.adapter.ts:61-67` `listen('lcu://connection-status')` | 监听存在                      |
| 初始快照         | `App.vue:41-43` `getLcuConnectionStatus()`                                                           | 初始状态写入                  |
| Service          | `lcu.service.ts:21-35` 选择 Tauri/browser adapter                                                    | 转发正确                      |
| Pinia            | `stores/app.ts:121-123` 只赋值 `lcuStatus`                                                           | **状态已保存**                |
| 首页 AppShell    | `App.vue:108` `v-if="app.isConnected"`                                                               | **使用旧 Mock `isConnected`** |
| `isConnected`    | `stores/app.ts:44` `connectionPhase === 'connected'`                                                 | **不是 lcuStatus**            |
| ConnectionScreen | `ConnectionScreen.vue:62` `@click="app.connect()"`；`stores/app.ts:72-81` 1.5s 模拟连接              | **Mock 连接**                 |
| AppHeader        | `AppHeader.vue:30` 使用 `app.isConnected`                                                            | **Mock 状态**                 |
| HomePage         | `HomePage.vue:30-40` 固定 `connection.connected` + 静态 `homeProfile`                                | 没有真实 LCU 状态/玩家        |

### 5.2 事件/初始快照竞态

- `App.vue` 先订阅事件（第 30 行），再获取初始快照（第 41 行），顺序本身可避免“事件先到无监听”的丢失。
- Pinia 的 `setLcuStatus` 没有 revision 防护（第 121-123 行只赋值），旧事件理论上可覆盖新状态；当前 Tauri event 通常有序，但这是健壮性缺口。
- 真正的 P0 不是竞态，而是 **`lcuStatus` 没有消费者**。

### 5.3 三个概念必须区分

1. **Tauri IPC 正常**：macOS 已实测 command/event 链路；Windows CI 编译；这不是真实 LCU。
2. **浏览器 Mock 显示连接**：`browserLcuAdapter` 返回 `source=mock/simulated=true`；`app.connect()` 1.5s 后显示首页；这是演示。
3. **真实 Windows LCU 已连接**：没有本次 Windows 实机验证证据。

当前 UI 把第 2 个（mock `connectionPhase`）当作唯一连接状态，忽略了第 3 个（`lcuStatus`）。

---

## 6. Windows 未连接根因分类

### P0 — 已通过代码确认的问题

#### P0-1：真实 `lcuStatus` 没有接入 AppShell/首页

- 文件/行号：
  - `src/App.vue:108`：`<AppShell v-if="app.isConnected" />`
  - `src/stores/app.ts:44`：`isConnected = connectionPhase === 'connected'`
  - `src/stores/app.ts:121-123`：`setLcuStatus` 仅赋值 `lcuStatus`
  - `src/stores/app.ts:25`：`connectionPhase` 初始 `disconnected`
- 调用关系：Rust `Connected` → event → `app.setLcuStatus` → **链在此结束**；`isConnected` 不读取 `lcuStatus`。
- 影响：即使 Rust 真实连接成功，`AppShell` 仍不显示，页面继续显示 `ConnectionScreen`「未连接」。
- 文档对应：connection probe/HTTP 机制见文档第 9-12 行；不是接口路径问题。
- 最小修复：在 `store` 新增真实连接派生状态（例如 `isLcuConnected`），并让 `App.vue`/`AppHeader` 使用它；浏览器 Mock 须保留单独分支。

#### P0-2：ConnectionScreen 的「重新连接」只执行 1.5s Mock 连接

- `src/features/connection/ConnectionScreen.vue:62`：`@click="app.connect()"`
- `src/stores/app.ts:72-81`：`connectionPhase` 直接 `connecting → connected`，无 LCU command/状态检查。
- 影响：
  - 用户不点击时，真实 connected 不会自动进入首页。
  - 用户点击时，会显示首页，但这是 Mock，不代表真实 LCU。
- 文档对应：无；这是 UI 状态绑定问题。
- 最小修复：Tauri 运行时按钮不再调用 Mock `connect`，改为启动/检查真实监控并显示真实 `lcuStatus`；浏览器保留 Mock。

#### P0-3：AppHeader/HomePage 显示 Mock 连接/资料

- `src/components/layout/AppHeader.vue:30`：`app.isConnected` 决定「已连接/待连接」。
- `src/features/home/HomePage.vue:30-40`：固定「已连接」标题、`app.homeView.summonerName` 和静态房间信息。
- `src/stores/app.ts:48-53`：`homeView` 使用 `homeProfile` Mock（`mocks/home.ts` 的「峡谷小米」/「房间中」）。
- 影响：即使 UI 被切换，连接文案和召唤师/房间信息也不是真实 LCU 数据；会误导。
- 最小修复：连接状态使用真实 `lcuStatus`；首页未接入真实 summoner 前不要声称真实资料；保留 Mock 仅浏览器。

### P1 — 代码高度可疑的问题

#### P1-1：IPC/事件错误被静默吞掉

- `src/App.vue:36-38, 44-46, 55-57` 的 catch 都只写注释/忽略。
- 影响：如果 Windows command 失败、事件订阅失败或 adapter 抛错，UI 不会显示任何错误，仍停在 Mock 未连接状态；这会让 P0 看起来像“Rust 没连上”。
- 最小修复：至少记录稳定错误码/状态到 store 或开发日志；不要向页面暴露凭据/堆栈。

#### P1-2：`lcuStatus` 没有 revision 防护

- `src/stores/app.ts:121-123` 直接赋值，未比较 `revision`。
- 影响：初始快照与事件交错时，旧状态可能覆盖新状态；当前事件顺序通常正常，但这是可靠性缺口。
- 最小修复：仅接受更高 revision（gameflow 已有的模式）。

#### P1-3：连接页硬编码进程/端口，误导排查

- `ConnectionScreen.vue:114-124` 固定显示 `Target Port: 2999`、`Process 'LeagueClient.exe' NOT found`；实际 discovery 使用 `LeagueClientUx.exe` 和动态端口。
- 影响：这不是根因，但让 Windows 问题更难判断，且与真实状态无关。
- 最小修复：显示真实状态/错误或开发诊断，不把硬编码值当真实结果。

#### P1-4：前端启动 monitor 而非 Rust 自启动

- `lib.rs` 只 manage/register，未在 `setup` 启动；`App.vue:49` 才调用。
- 影响：前端加载失败/命令失败时没有任何监控；以及“应用启动后自动连接”依赖前端挂载。
- 最小修复（设计选择）：可在 Rust `setup` 启动连接 monitor（仍将 UI 状态同步给前端），或明确接受前端启动并加强错误可见性。不要同时启动两套任务。

#### P1-5：今日 Windows 连接页与真实 LCU 状态没有自动切换

- 这是 P0-1/P0-2 的合并表现；`ConnectionScreen` 的 `retrySeconds` 只是 UI 倒计时，`ConnectionScreen.vue:13-17`，没有在倒计时结束时调用 Rust 或重试 UI。
- 影响：用户看到“自动重试”倒计时，但实际页面不会因 Rust 状态变化而离开。
- 最小修复：把真实状态/连接中/错误映射到 UI；倒计时可继续仅作视觉，但必须响应 Rust 事件。

### P2 — 必须 Windows 实机验证的问题

1. **进程发现**：`LeagueClientUx.exe` 名称、`exe()` 路径、`lockfile` 位置（`discovery.rs:156-190`）在真实 Windows 上是否稳定；文档未说明细节。
2. **lockfile 解析**：`splitn(5, ':')` / PID/协议假设（`discovery.rs:30-76`）未由文档确认；实际客户端字段变化可能失败。
3. **认证/HTTPS**：`/riotclient/region-locale` 的响应是否为 JSON、是否在所有登录阶段返回 2xx（`client.rs:36-64`）；文档没有 Schema。
4. **响应结构**：Gameflow phase 是否为裸字符串、Lobby/ChampSelect 的 `myTeam`/`theirTeam`/`gameId`/`puuid` 字段是否如代码假设（`gameflow_monitor.rs:399-437`、`lobby.rs:7-27`、`champ_select.rs:7-45`）；文档明确没有 Schema。
5. **WebSocket**：`OnJsonApiEvent`/WAMP `[5,...]`、`[8,...]` 是否匹配当前客户端（`gameflow_events.rs:56-58, 142-166`）；文档未说明。
6. **版本**：文档标注 26.20，但当前 Windows 客户端实际版本未记录/校验；字段/事件可能不同。
7. **UI 真实数据**：`current-summoner` 未被 Rust 调用；首页的召唤师/房间仍是 Mock，即使连接状态修好也不会显示真实资料。

---

## 7. 七个必答问题

### Q1. 项目内 LCU API 文档覆盖当前使用的接口吗？

**路径覆盖：是。** `region-locale`、`gameflow-phase`、`gameflow session`、`lobby`、`champ-select` 均有 GET 路径定义。  
**契约覆盖：否。** 上述接口的响应 Schema 在文档中均明确写“没有可可靠确认的统一响应 Schema”。  
**WebSocket：否。** 文档没有 `OnJsonApiEvent`/WAMP 事件帧。  
**lockfile/进程：否。** 文档只给一般机制，没有格式、进程名或路径。

### Q2. Rust 真正按照文档接入 LCU API 吗？

- HTTP 路径、Basic Auth、loopback HTTPS、只读 GET：**代码层面基本符合文档描述**。
- 响应解析：**不能确认**；文档没有 Schema，Rust 的 phase 字符串/Lobby/ChampSelect 字段是代码假设。
- `current-summoner`：**未接入**；只用了 `region-locale` 作为 probe。
- WebSocket：**文档缺失**，实现未得到文档确认。
- 结论：**路径一致，响应/事件契约未验证。**

### Q3. 自动发现和连接监控是否实际运行？

- Rust 没有在 `lib.rs` 自动启动；**前端 `App.vue:49` 调用 `lcu_start_monitoring` 才启动**。
- Tauri 启动后，如果 App 挂载且 command 成功，monitor 会每轮重新 discover/probe；客户端后启动逻辑上可发现。
- 当前 macOS 实测只到 `unsupported_platform`；Windows 真实运行没有本次证据。
- 因此：**代码路径存在，Windows 真实监控是否工作未确认。**

### Q4. Rust 是否正确维护真实连接状态？

- 代码层面：有状态机、probe、reconnect、generation、事件；probe 成功才 `Connected`。
- 运行时：Windows 真实客户端未验证；不能确认。
- UI 层：`lcuStatus` 没有被 UI 消费，所以即使 Rust 维护正确，**页面也不会正确显示**。

### Q5. Tauri 是否把连接状态传给前端？

- 命令名/事件名一致：`lcu://connection-status`；event 发送在 `commands/lcu.rs:26-27`；前端监听在 `tauri.adapter.ts:61-67`、`App.vue:30`。
- 初始状态读取在 `App.vue:41-43`。
- 传输链路存在。
- 但前端只把 payload 写入 `lcuStatus`；**没有送入首页/连接页的展示状态**。

### Q6. Pinia 和首页是否完整使用真实状态？

**否。**

- Pinia 保存 `lcuStatus`（`stores/app.ts:121-123`）。
- `isConnected` 仍由 `connectionPhase` 计算（`stores/app.ts:44`）。
- AppShell/AppHeader/ConnectionScreen 使用 `isConnected`/`connect()`，不是 `lcuStatus`（`App.vue:108`、`AppHeader.vue:30`、`ConnectionScreen.vue:62`）。
- HomePage 使用静态 `homeProfile`（`HomePage.vue:30-40`、`stores/app.ts:48-53`）。
- 结论：**真实状态被接收但被 UI 丢弃。**

### Q7. Windows 客户端启动但页面未连接的最可能原因？

**P0（最高置信）：真实状态没有接到 UI。** 最可能链路：

```text
Rust probe 成功
  → Connected
  → lcu://connection-status
  → App.setLcuStatus
  → [链路终止]
  → AppShell 仍检查 connectionPhase === 'disconnected'
  → ConnectionScreen 一直显示
```

即使 Rust 的 Windows discovery/probe 完全正常，页面也不会自动切到首页。  
次高可能：P1 静默错误（命令/事件失败没有可见信息）；P2 Windows discovery/probe 实际失败。  
**不能在没有 Windows 实机日志的情况下把 P2 说成确定根因。**

---

## 8. 最小修复文件清单与顺序

**只列出后续修复建议；本次未修改代码。**

### 第 1 步：先让真实状态可见（不改 UI 设计）

- `src/App.vue`：将 `lcuStatus` 的 status/code 记录到开发日志（脱敏）或一个临时诊断面板；先确认 Windows 上是否出现：
  - `connected`
  - `not_running`
  - `discovery_failed`
  - `authentication_failed`
  - `connection_refused`
  - `timeout`
- 这样先区分“Rust 未连上”与“Rust 连上但 UI 不用”。

### 第 2 步：Pinia 建立真实连接派生状态

- `src/stores/app.ts`
  - 建议新增 `isLcuConnected` / `isLcuConnecting`（基于 `lcuStatus.status === 'connected'`）或等价的单一 computed。
  - 保留 `connectionPhase` 仅给浏览器 Mock/旧流程；不要让两个来源同时决定页面。
  - `setLcuStatus` 增加 revision 防护。
- 关键行：`stores/app.ts:25, 44, 121-123, 170-180`。

### 第 3 步：AppShell / Header / ConnectionScreen 绑定真实状态

- `src/App.vue:108`：Tauri 使用真实 `isLcuConnected`；浏览器保持 Mock。
- `src/components/layout/AppHeader.vue:30`：显示真实连接状态。
- `src/features/connection/ConnectionScreen.vue:62, 93, 114-124`：
  - Tauri 下不再用 `app.connect()` 的 1.5s Mock；按钮应启动/检查真实监控或等待真实状态。
  - 状态文案/详情使用真实 `lcuStatus`；删除/替换硬编码 `Process 'LeagueClient.exe' NOT found` 和 `2999`。
- `src/features/home/HomePage.vue:30-40`：在接入真实 summoner/room 前，不要无条件显示“已连接”和固定 Mock 资料；至少让页面只在真实 connected 时出现。

### 第 4 步：区分浏览器 Mock / Tauri IPC / 真实 LCU

- `browserLcuAdapter` 保持 `source=mock/simulated=true`。
- Tauri `source=real` 才能驱动“真实连接”UI。
- `source=unavailable` 不得显示连接成功。
- 不要把“Tauri IPC 返回成功”当成“真实 LCU 已连接”。

### 第 5 步：Windows 实机验证

在真实 Windows + LOL 客户端上记录：

1. `discover` 是否找到 `LeagueClientUx.exe`。
2. lockfile 是否读取成功、PID 是否匹配。
3. `/riotclient/region-locale` 是否 200/JSON。
4. `lcu_get_connection_status` 与 `lcu://connection-status` 的实际值。
5. 客户端退出/重启/端口变化后状态。
6. 页面是否自动进入/退出首页。

**在该步骤之前，不应修改 discovery/HTTP 解析为“猜测修复”。**

### 修复顺序总结

```text
1. 诊断可见性（App/status）
2. Pinia 真实状态派生 + revision
3. AppShell/Header/ConnectionScreen 绑定真实状态
4. 移除 Tauri UI 的 Mock connect 假阳性
5. Windows 实机验证 discovery/probe/重连
6. 如实证明确失败，再改 Rust discovery/HTTP（P2）
```

---

## 9. 本次审计未执行/未修改

- 未修改任何 `.vue`、`.ts`、`.rs`、Mock、Tauri 配置或安全配置。
- 未修改 `references/deepseek.original.html`。
- 未推送 GitHub。
- 未输出任何 LCU 密码、token 或 Authorization。
- 未连接真实 Windows LCU；Windows CI 编译通过不能作为真实连接成功证据。
- 本报告只是只读审计结论。
