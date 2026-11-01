# 阶段 10.2：LCU 游戏阶段、房间、选英雄快照与 Rust → Vue 同步

结论：**代码开发与自动化验收通过，真实 Windows 游戏流程待实机确认。**

Windows CI Run `41312013808` 成功：90 前端测试、47 Rust 测试、MSVC 编译、NSIS 打包和 Artifact 上传全部通过。macOS 明确返回 unavailable，不伪造 LCU 数据；未接真实客户端。

## 1. 模块结构

```text
src-tauri/src/
├── commands/
│   ├── app.rs
│   ├── lcu.rs
│   └── gameflow.rs
├── lcu/
│   ├── discovery.rs
│   ├── client.rs
│   ├── connection.rs
│   ├── monitor.rs
│   ├── gameflow.rs           # Phase / snapshots / session / state machine
│   ├── gameflow_events.rs    # authenticated WebSocket + WAMP parser
│   ├── gameflow_monitor.rs   # HTTP polling + WS wake + fallback
│   ├── lobby.rs              # minimal Lobby parser
│   ├── champ_select.rs       # minimal ChampSelect parser
│   ├── models.rs
│   └── error.rs
└── lib.rs
```

前端：

```text
src/types/lcu.ts               # GameflowPhase/Snapshot/Adapter
src/services/lcu.service.ts    # gameflow commands + events
src/adapters/browser.adapter.ts
src/adapters/tauri.adapter.ts
src/stores/app.ts              # gameflowSnapshot + revision guard
src/App.vue                    # silent subscribe/get/start/stop
src/i18n/locales/zh-CN.ts      # gameflow phase zh-CN labels
src/i18n/labels.ts             # GAMEFLOW_PHASE_KEYS
```

## 2. Gameflow 阶段

TS 契约：

```ts
type GameflowPhase =
  | 'none'
  | 'lobby'
  | 'matchmaking'
  | 'ready_check'
  | 'champ_select'
  | 'game_start'
  | 'in_progress'
  | 'reconnect'
  | 'waiting_for_stats'
  | 'pre_end_of_game'
  | 'end_of_game'
  | 'terminated_in_error'
  | 'unknown'
```

- Rust 显式解析所有已知客户端原值。
- 未知值 → `Unknown(raw)`；序列化 `phase: "unknown"`，`rawPhase` 保留原字符串。
- 断开连接 → `connected=false`、`phase=null`，不会伪造成客户端实际 `None`。
- `InProgress` 与 `EndOfGame` 分别独立解析。
- 连接状态（阶段 10.1 `LcuConnectionStatus`）与游戏阶段是两套独立状态。

## 3. HTTP 数据源与按阶段读取

只使用现有 `LcuHttpClient` 的只读 GET：

| 阶段                                                                  | 请求                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| 所有已连接阶段                                                        | `GET /lol-gameflow/v1/gameflow-phase`                 |
| Lobby                                                                 | `GET /lol-lobby/v2/lobby`                             |
| ChampSelect                                                           | `GET /lol-champ-select/v1/session`                    |
| GameStart/InProgress/Reconnect/WaitingForStats/PreEndOfGame/EndOfGame | optional `GET /lol-gameflow/v1/session` 仅用于 gameId |

- 不在每个循环请求全部接口。
- Lobby/ChampSelect 的 404/204 视为资源尚不存在，不用异常替代。
- 认证失败、超时、连接拒绝、非 2xx、JSON 格式错误保持阶段 10.1 的稳定错误码。
- 原始大 JSON 不进入 Pinia 或 Vue 事件。
- 所有请求 GET；无写操作。

## 4. WebSocket 与轮询兜底

- `LcuWebSocketEventSource` 使用 `tokio-tungstenite` + 平台 native TLS，仅连接 `wss://127.0.0.1:{port}`。
- 认证使用内存 lockfile password 的 Basic Header；不记录密码/Authorization。
- 自签名证书只在专用 WSS connector 上禁用校验；不修改全局 TLS。
- 订阅 `OnJsonApiEvent`，解析 WAMP `[8,"OnJsonApiEvent",{uri,eventType,data}]`。
- 仅关注：
  - `/lol-gameflow/v1/gameflow-phase`
  - `/lol-gameflow/v1/session`
  - `/lol-lobby/v2/lobby`
  - `/lol-champ-select/v1/session`
- 事件只作为“需要刷新”的 wake 信号；不存在把原始事件直接发给 Vue 的路径。
- WebSocket 断开/失败时：
  - 轮询 fallback 1.5s；
  - WebSocket 正常时低频 5s 校验；
  - 重连失败采用有界退避；
  - 客户端退出时终止 WS 任务。
- 单一 `GameflowManager` 任务，无重复轮询/WS 任务。
- generation 在 stop/shutdown 时递增，旧异步结果不能覆盖新状态。

## 5. Lobby Snapshot

```ts
interface LobbySnapshot {
  lobbyId: string | null
  queueId: number | null
  gameMode: string | null
  memberCount: number | null
  updatedAt: number
}
```

- 只有 LCU 实际提供时才填字段；不伪造人数。
- 不把 Lobby 成员顺序当作最终红蓝方。
- 离开 Lobby 后会话中的 lobby 被清空。
- 只保留本阶段必要字段。

## 6. Champion Select Snapshot

```ts
interface ChampionSelectPlayer {
  playerId: string | null // puuid 优先，summonerId fallback
  championId: number | null
  team: 'my_team' | 'their_team' // LCU 明确分组
  cellId: number | null
  assignedPosition: string | null
}

interface ChampionSelectSnapshot {
  gameId: string | null
  myTeam: ChampionSelectPlayer[]
  theirTeam: ChampionSelectPlayer[]
  localPlayerCellId: number | null
  complete: boolean
  updatedAt: number
}
```

- 保留 LCU 的 `myTeam` / `theirTeam`，不按数组顺序猜红蓝方。
- 只有两队都非空且每个玩家都有稳定标识时才 `complete=true`。
- 缺失队伍/玩家标识 → `incomplete`，不补造数据。
- 选人结束/进入游戏后保留本局快照；下一场 Lobby 或新 generation 时重置。
- 选人取消/闪退回到 Lobby 时旧会话结束，不复用。
- 不采集无关账号资料。

## 7. GameSessionContext 生命周期

```ts
interface GameSessionContext {
  sessionKey: string
  connectionGeneration: number
  phase: GameflowPhase
  startedAt: number
  updatedAt: number
  lobby: LobbySnapshot | null
  championSelect: ChampionSelectSnapshot | null
  snapshotComplete: boolean
}
```

规则：

- Lobby 建立会话；Matchmaking/ReadyCheck/ChampSelect/GameStart/InProgress/WaitingForStats/EndOfGame 复用同一 context。
- 下一场 Lobby（上一场 terminal）→ 新 sessionKey。
- 选人取消回到 Lobby → 新会话，不复用旧快照。
- 客户端重启/连接 generation 变化 → 新会话并结束旧上下文。
- `GameflowPhase::None` → 结束会话；断开连接 → 结束会话。
- sessionKey 包含唯一序号，避免同一 lobbyId 的不同场次合并。
- 不引入数据库，仅 Rust 内存。

## 8. IPC 与事件

命令：

```text
lcu_get_gameflow_snapshot
lcu_start_gameflow_monitoring
lcu_stop_gameflow_monitoring
```

事件：

```text
lcu://gameflow-updated
lcu://lobby-updated
lcu://champ-select-updated
lcu://session-ended
```

- `lcu://gameflow-updated` → `GameflowSnapshot`。
- `lcu://lobby-updated` → `LobbySnapshot | null`。
- `lcu://champ-select-updated` → `ChampionSelectSnapshot | null`。
- `lcu://session-ended` → `GameSessionContext | null`。
- 前端先订阅、再获取初始快照；Pinia 按 revision 丢弃旧/相等 revision。
- 页面卸载解绑全部事件；无重复监听。
- 事件不含密码、Authorization、完整原始事件或大 JSON。
- `lcu_get_connection_status`/`app_health_check` 保持工作。

## 9. 前端接入

- `browserGameflowAdapter`：`source=mock`、`simulated=true`，不冒充真实 LCU。
- `tauriGameflowAdapter`：唯一知道 gameflow 命令/事件名的前端模块。
- macOS Tauri：`source=unavailable`，无真实阶段；不伪造 `connected`。
- Windows Tauri：真实 LCU 数据源（CI 编译通过，未实机连接）。
- Pinia 新增 `gameflowSnapshot`；连接状态与游戏阶段独立。
- `GAMEFLOW_PHASE_KEYS` 映射到 zh-CN；未新增页面/UI。
- 新事件不会切换页面、不触发红包、不替换战绩/结算 Mock。

## 10. 测试

### Rust（Windows CI 与 macOS）

```text
47 tests passed
```

覆盖：

- 全部已知 Gameflow phase 解析、unknown、InProgress/EndOfGame 区分。
- Lobby 进入/退出、字段缺失不伪造、malformed 404 类似错误。
- ChampSelect team 保留、稳定 ID、incomplete、不猜 red/blue。
- 完整 Lobby→Matchmaking→ReadyCheck→ChampSelect→GameStart→InProgress→WaitingForStats→EndOfGame 会话连续性。
- 下一场 Lobby 新 session；选人取消/连接 generation 重置。
- WebSocket WAMP 事件解析、非相关 URI 忽略。
- 轮询 fallback、客户端断开、无真实 None 混淆。
- 阶段 10.1 的 27 个连接测试继续通过。

### 前端

```text
17 files / 90 tests passed
```

新增覆盖：

- 初始 Gameflow 快照读取。
- Tauri gameflow 命令与四类事件订阅。
- unsubscribe 全部 unlisten。
- revision 旧/相等数据丢弃。
- 连接状态 vs Gameflow 独立。
- 浏览器 Mock source/simulated。
- zh-CN phase 文案全部非空。
- 原有 UI/导航/Mock 测试全部保留。

## 11. Windows CI 与 Artifact

- Workflow：`Windows x64 CI`
- Run：https://github.com/UoMiss/aram-mayhem/actions/runs/41312013808
- head commit：`166a9748af42cef403422ac5fe628f1421c75f15`
- `pnpm check`：90 前端测试通过
- `cargo check --target x86_64-pc-windows-msvc`：通过
- `cargo test --target x86_64-pc-windows-msvc`：47 passed
- `pnpm tauri build --target x86_64-pc-windows-msvc --bundles nsis`：成功
- Artifact：`aram-mayhem-windows-x64`（id `13085867754`）
- NSIS：`ARAM Mayhem_0.1.0_x64-setup.exe`
- 安装包大小：**4,315,210 bytes**
- SHA-256：

```text
e5df5ce93e184e40ba46afb7746cde697477c111b9fddc331e54237b48103342
```

- Artifact zip：4,297,611 bytes
- 首次 CI 失败原因：Windows 条件路径下 `GameflowEventSource` trait 未导入；`166a974` 修复后通过。
- 未签名、未创建 Release。

## 12. macOS 结果

实际 Tauri dev 日志：

```text
[lcu_start_gameflow_monitoring] connected=false phase=None transport=Disconnected
```

- macOS 不启动真实 gameflow task；source unavailable。
- 不伪造 `connected`/`phase`。
- 浏览器 Mock 仍可用。
- 本机 release `.app` 15.32 MiB 构建成功。

## 13. 未执行的 Windows 实机验收

未安装/运行 Windows 10/11 桌面，也未启动真实 LOL 客户端。仍需验收：

- 安装/卸载、WebView2。
- 客户端未启动/启动/登录。
- Lobby/Matchmaking/ReadyCheck/ChampSelect/GameStart/InProgress/WaitingForStats/EndOfGame。
- 取消排队/选人、第二场对局会话隔离。
- 真实 WebSocket 事件与 HTTP 轮询回退。
- 客户端断线/重连、端口/认证变化。
- 图片复制/下载、480×900、中文字体。

## 14. 已知兼容性与数据缺口

- 真实 LCU 的 `myTeam`/`theirTeam`、`puuid`/`summonerId`、`gameId` 字段需 Windows 实机确认。
- LCU WebSocket WAMP 帧格式可能随客户端版本变化；解析器有回退到 HTTP 轮询。
- 选人数据缺失时明确 incomplete；不猜测阵营。
- Tauri Event 在 macOS 只验证了前端 adapter 契约，真实事件由 Windows 实机验证。
- 桌面截图/剪贴板权限限制仍为阶段九遗留。

## 15. 阶段 10.3 准备

- 先在 Windows 实机完成 10.2 全流程验收，再读取战绩/结算。
- 使用已捕获的 `sessionKey` 作为本局快照键；不要把选人快照直接当最终结算。
- 增加 LCU 假 HTTPS/WSS 服务的端到端集成测试，再扩大真实数据字段。
- 继续保持只读；任何写操作/自动接受/选英雄不得进入下一阶段。
- 真实战绩加载时需独立 contract 和脱敏策略。
