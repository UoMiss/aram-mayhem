# ARAM Mayhem：地图与游戏类型显示改造方案

> **项目**：[UoMiss/aram-mayhem](https://github.com/UoMiss/aram-mayhem)  
> **文档版本**：1.0  
> **编写日期**：2026-11-07  
> **改造重点**：参照《英雄联盟》国服客户端，准确显示「地图」「游戏类型」，并保证房间、匹配、游戏中、历史与赛后结算的数据一致性。  
> **交付性质**：设计与实施指导；本地实现已按下列说明扩展，尚未进行本次国服实机验证。

## 本次落地说明

- 复用已有 `resolveGameMode` 和 `ModeContext`，补充 `mapId`、同会话字段合并以及队列变化时清除旧地图。
- 当前解析依据公开 LCU Schema。大厅读取 `gameConfig.mapId`，Gameflow 读取根对象 `map.id`，历史与结算读取该对局的 `mapId`。这些字段均为可选，不使用队列默认地图补齐。测试样本为合成数据，不声称已经国服实测。
- 增加主窗口专用只读 IPC `lcu_get_game_metadata(accountKey, queueId, mapId)`。原生层校验数值范围、当前账号和连接上下文，客户端名称只采纳 ID 匹配且长度受限的 `name`，不返回原始响应。没有新增插件权限、路径输入或外部 URL 输入。
- 名称查询独立于 Gameflow、战绩和结算加载。Rust 缓存按客户端身份、账号、连接世代以及资源类型隔离，成功缓存 5 分钟，失败缓存 30 秒，最多 512 项。前端按账号和 ID 绑定展示，断线或连接世代变化使旧请求失效。
- 显示层使用客户端中文名称、国际化回退名称或明确未知状态，业务分类仍由原有模式解析器负责。自定义房间及好友排名规则保持原逻辑。
- 首页、近期对局、战绩列表、结算使用相同的游戏类型解析器。按最新界面要求，仅首页当前对局显示地图；战绩卡片和结算不展示地图。底层仍保留真实 `mapId`，截图区域仍不包含顶部。
- 首页标题改为「近期对局」，仍展示最新 5 场；卡片时间显示对局发生时间（本地日期与时刻），不显示游戏时长。
- 通用设置新增默认关闭的「自动接受对局」。启动时恢复已保存的开关，原生 Gameflow 监控仅在 `ReadyCheck`、玩家未回应且账号一致时调用固定的 `POST /lol-matchmaking/v1/ready-check/accept`。同一次确认阶段不重复提交，手动接受或拒绝后不覆盖操作；接口错误不重复提交。此项是用户新授权的写操作，原地图和类型数据查询仍只读。自动化验证不等同于 Windows 客户端联调。
- 本地自动化验证和 Windows 交叉构建不能替代本节下方列出的国服实机验收。具体地图主题是否有独立 ID，仍须采样确认。

### 功能一致性方案 PR-01 / PR-02 收尾

- 当前会话的 `modeContext` 为必传可空字段，IPC 拒绝缺少该字段的旧快照。首页仅从此字段读取模式，不再从旧大厅或游戏快照回退。
- 原生 Gameflow 监控在每次采样前后校验当前账号，切换账号、退出登录或跨账号采样会立即清空已知上下文；稳定的新账号采样重新建立会话。账号标识仅用于原生内存比较，不进入 Gameflow IPC 或诊断日志。
- 当前召唤师及登录会话事件会唤醒采样；没有 WebSocket 时继续使用原有轮询。账号变化不再依赖先收到 `None` 或传输断线。
- 清理账号上下文不会发出旧账号的对局结束事件；前端同时取消旧账号的开局保存重试和结算导航请求，丢弃晚到结果。客户端实例变化也先清空旧会话，即使新阶段采样暂时被取消，也不保留旧模式。
- 同会话队列变化输出 `[lcu_mode_queue_conflict]` 诊断，包含旧/新队列 ID、已知阶段、旧/新来源。未知阶段统一记为 `Unknown`，不记录原始 JSON、账号、房间或对局 ID；重复未变化快照不重复输出。
- 已加入账号切换、采样竞态、退出登录重连、严格 IPC 契约、旧字段不可回退和日志脱敏测试。Windows 国服实机验证仍单独待验收。

以下保留原始分阶段设计，新增上下文部分实际采用扩展已有实现。

## 1. 目标和边界

### 1.1 目标

- 首页同时展示 **地图** 和 **游戏类型**，例如「嚎哭深渊」「海克斯大乱斗」。
- 地图采用实际 `mapId`；游戏类型优先根据实际 `queueId` 与当前客户端的队列元数据生成中文展示名。
- 在 Lobby → Matchmaking → ReadyCheck → ChampSelect → InProgress 阶段，已确认的模式元数据不因临时缺失而闪烁。
- 历史与赛后结果只根据对应 `gameId` 的战绩详情显示实际地图与队列；不从“这是什么模式”反推地图。
- 对 API 数据缺失、国服版本差异、旧队列、未知地图进行明确降级显示。

### 1.2 约束

1. 仅使用本机已连接客户端允许的**只读数据**，复用项目现有的 Rust `LcuHttpClient`、连接认证、会话追踪及 TypeScript IPC 校验。
2. 不使用内存读取、进程注入、隐藏身份反查或绕过客户端机制。
3. 不把 `gameMode`、`gameType`、`queueId`、`mapId` 当成同一个概念。
4. 不将社区提取的 LCU 文档表述成 Riot 对第三方的官方稳定性保证。
5. 不以仿冒官方客户端界面为目标；保持 ARAM Mayhem 的独立产品标识。

## 2. 规范依据与事实等级

| 内容                                                        | 依据与状态                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `queueId`、`mapId`、`gameMode`、`gameType` 是不同的游戏常量 | Riot 官方开发者文档 **Game Constants**；已确认                                                 |
| Riot 官方支持第三方稳定调用 LCU                             | **不成立**：Riot 明确声明 League Client API 不提供正式第三方支持及稳定性保证                   |
| LCU 路由名称                                                | `lcu.kebs.dev` 所示的客户端 Swagger 提取资料；**非 Riot 保证的稳定接口**，须在国服目标版本核对 |
| `2400` 对应 ARAM: Mayhem                                    | 本项目当前已知映射；生产环境应以目标客户端队列元数据和实机测试复核                             |
| `450` 对应普通 ARAM                                         | 常用队列映射；升级时仍需验证                                                                   |
| 地图 `11`（召唤师峡谷）、`12`（嚎哭深渊）                   | 官方静态地图常量及历史资料中使用的地图编号；仅在**实际 `mapId`** 匹配时使用显示名              |
| LCU 响应中的中文 `name` / `description` 字段                | **待实机确认**：存在不同版本、地区和对象结构差异，不能仅凭路由定义保证字段存在                 |

**官方与参考资料：**

- [Riot 官方开发者文档（LoL / Game Constants）](https://developer.riotgames.com/docs/lol)
- [Riot Developer Relations：League of Legends / League Client API 政策](https://support-developer.riotgames.com/hc/en-us/articles/22698698001939-League-of-Legends)
- [Riot：Vanguard FAQ for Third Party Applications](https://www.riotgames.com/en/DevRel/vanguard-faq)
- [社区提取的 LCU API 文档（所查快照显示 26.20）](https://lcu.kebs.dev/)
- [Riot 官方：Bringing Mayhem to ARAM](https://www.leagueoflegends.com/en-us/news/dev/dev-bringing-mayhem-to-aram/)

> 注意：社区文档所显示版本不一定等于国服客户端当前版本。任何字段路径或值的适配均应由 Windows 国服实机样例验证。

## 3. 四类数据的定义

| 字段       | 示例                          | 含义             | 用途                                          |
| ---------- | ----------------------------- | ---------------- | --------------------------------------------- |
| `mapId`    | `12`                          | 对局实际地图标识 | 显示「地图」                                  |
| `queueId`  | `2400`                        | 匹配队列标识     | 优先决定「游戏类型」                          |
| `gameMode` | `ARAM`                        | 底层游戏玩法模式 | 辅助诊断，**不能单独区分普通 ARAM 与 Mayhem** |
| `gameType` | `MATCHED_GAME`、`CUSTOM_GAME` | 对局类别         | 判断匹配/自定义性质，**不是中文玩法名称**     |

示例（仅用于解释字段，**不是国服真实响应**）：

```json
{
  "mapId": 12,
  "queueId": 2400,
  "gameMode": "ARAM",
  "gameType": "MATCHED_GAME"
}
```

期望显示为：

```text
地图       嚎哭深渊
游戏类型   海克斯大乱斗
```

若 `mapId` 缺失，即使队列号已知，也不得把地图写死为「嚎哭深渊」。ARAM: Mayhem 的具体对局可能涉及不同地图。

## 4. API 使用表

| 阶段 / 目的 | 请求方式及路径                             | 读取内容                                                             | 处理要求                                           |
| ----------- | ------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------- |
| 当前房间    | `GET /lol-lobby/v2/lobby`                  | `gameConfig.queueId`、候选 `gameConfig.mapId`、`gameConfig.gameMode` | 可选字段保留 `null`；国服实测确认 `mapId` 是否返回 |
| 当前阶段    | `GET /lol-gameflow/v1/gameflow-phase`      | 当前阶段                                                             | 复用已有监控，不额外高频调用                       |
| 游戏会话    | `GET /lol-gameflow/v1/session`             | `gameData.queue.id`、可用的地图元数据、`gameId`                      | 解析已验证字段；不得假定某个地图路径必然存在       |
| 队列描述    | `GET /lol-game-queues/v1/queues/{id}`      | 队列名称、说明、候选地图信息                                         | 只在 `queueId` 变化时查询，验证响应字段和语言      |
| 队列列表    | `GET /lol-game-queues/v1/queues`           | 可用队列列表                                                         | 可用于缓存与版本诊断，不持续轮询                   |
| 地图描述    | `GET /lol-maps/v1/map/{id}`                | 地图名称及描述                                                       | `mapId` 有效时查询、缓存                           |
| 地图列表    | `GET /lol-maps/v1/maps`                    | 客户端地图列表                                                       | 作为缓存构建或接口兼容性回退                       |
| 历史详情    | `GET /lol-match-history/v1/games/{gameId}` | 对局 `mapId`、`queueId`、`gameMode`、`gameType`                      | 仅映射当前详情返回的实际数据                       |

**重要**：路由存在与**响应 JSON 中某字段必然存在**是两回事。比如 `gameData.mapId`、`gameData.queue.mapId`、队列对象的 `name` 等都需要当前客户端实测并录入 fixture 后，才能写入生产解析器。不得靠猜测强行选择字段。

## 5. 现有代码审查结果

本方案对应已复核的仓库 `main` 分支代码：

| 文件                                                                                                                               | 当前行为                                                                               | 修改原因                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`src-tauri/src/lcu/lobby.rs`](https://github.com/UoMiss/aram-mayhem/blob/main/src-tauri/src/lcu/lobby.rs)                         | 解析 `lobbyId`、`gameConfig.queueId`、`gameConfig.gameMode`、`members.length`          | 没有读取 `mapId`                         |
| [`src-tauri/src/lcu/gameflow.rs`](https://github.com/UoMiss/aram-mayhem/blob/main/src-tauri/src/lcu/gameflow.rs)                   | `LobbySnapshot` 没有 `mapId`，离开 Lobby 时清除 `session.lobby`                        | 模式元数据在部分阶段可能失去来源         |
| [`src-tauri/src/lcu/gameflow_monitor.rs`](https://github.com/UoMiss/aram-mayhem/blob/main/src-tauri/src/lcu/gameflow_monitor.rs)   | 从 Gameflow Session 提取 `gameData.queue.id`、`gameData.queue.gameMode`，保存为 `game` | 尚未提取并携带实际地图标识               |
| [`src/types/lcu.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/types/lcu.ts)                                             | TS `LobbySnapshot` 没有 `mapId`                                                        | IPC 类型需同步                           |
| [`src/shared/ipc/contracts.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/shared/ipc/contracts.ts)                       | `isLobby` 严格校验现有字段                                                             | Rust 加字段后运行时校验需同步            |
| [`src/stores/home.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/stores/home.ts)                                         | 根据 `queueId` / `gameMode` 判断 `hex`、`aram`、`custom`、`other`                      | 没有地图名，也缺少队列中文名称的权威来源 |
| [`src/features/home/HomePage.vue`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/home/HomePage.vue)                 | “当前对局”区域已有模式、人数、规则等行                                                 | 可直接增加“地图”行，保持原有布局         |
| [`src/shared/lib/history-presentation.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/shared/lib/history-presentation.ts) | 独立实现模式判断                                                                       | 应与首页统一解析规则                     |
| `src-tauri/src/lcu/history.rs`、`settlement.rs`                                                                                    | 已保存 `queueId`、`gameMode`、`gameType` 等                                            | 需要新增 `mapId` 并贯通战绩和结算视图    |

## 6. 文件级实施方案

### PR-01：贯通地图 ID（P0）

**修改文件：**

1. `src-tauri/src/lcu/gameflow.rs`
2. `src-tauri/src/lcu/lobby.rs`
3. `src-tauri/src/lcu/gameflow_monitor.rs`
4. `src/types/lcu.ts`
5. `src/shared/ipc/contracts.ts`
6. 涉及 `LobbySnapshot` 的 Rust 单元测试和前端 fixtures

Rust `LobbySnapshot` 增加：

```rust
pub map_id: Option<i64>,
```

`lobby.rs` 的 `parse_lobby()` 增加：

```rust
let map_id = value
    .pointer("/gameConfig/mapId")
    .and_then(Value::as_i64)
    .filter(|id| *id > 0);
```

将 `map_id` 加到 `LobbySnapshot` 构造器。**若国服真实 Lobby 响应不包含 `/gameConfig/mapId`，返回 `None`，不得替它推断一个地图。**

在 `gameflow_monitor.rs::extract_game_metadata()` 中，只有取得经过实机确认的 JSON 路径后，才增加对应地图提取。当前代码已经读取 `gameData.queue.id`；不要凭空假定 `/gameData/queue/mapId` 或 `/gameData/mapId` 哪个是标准字段。

TypeScript 同步增加：

```ts
export interface LobbySnapshot {
  lobbyId: string | null
  queueId: number | null
  mapId: number | null
  gameMode: string | null
  memberCount: number | null
  updatedAt: number
}
```

在 `src/shared/ipc/contracts.ts` 的 `isLobby` 加入：

```ts
mapId: nullable(integer),
```

**验收**：真实 `mapId` 能从 Rust 序列化进入 Pinia；缺失时仍然是 `null`；所有现有快照和测试构造器同步调整。

### PR-02：客户端中文队列 / 地图元数据（P0）

**新增** `src-tauri/src/lcu/metadata.rs`，并在 `src-tauri/src/lcu/mod.rs` 注册。

- 对确定且有效的正整数 `queueId` 请求 `/lol-game-queues/v1/queues/{id}`。
- 对确定且有效的正整数 `mapId` 请求 `/lol-maps/v1/map/{id}`。
- 严格限制允许的字段路径、字符串长度，**仅在完成真实响应检查后写定解析器**。
- 使用 `(connection_generation, id)` 作为缓存隔离键；换连接、换账号时适当失效。
- 404、204、客户端不支持等情况返回空结果而不是假名称；对无关请求不进行重试风暴。
- 不将原始 LCU 响应或凭据直接发送到 Vue 页面。

Rust 调用形式（示意，实际须与当前 `LcuHttpClient` 签名配合）：

```rust
let queue = http
    .get_json_optional(client, &format!("/lol-game-queues/v1/queues/{queue_id}"))
    .await?;

let map = http
    .get_json_optional(client, &format!("/lol-maps/v1/map/{map_id}"))
    .await?;
```

建议对前端仅暴露整理后的 DTO：

```ts
interface GameMetadata {
  queueId: number | null
  mapId: number | null
  queueName: string | null
  mapName: string | null
  queueNameSource: 'client' | 'fallback' | 'unknown'
  mapNameSource: 'client' | 'fallback' | 'unknown'
}
```

### PR-03：统一显示解析器（P0）

**新增** `src/shared/lib/game-info.ts`，将客户端中文名称和本地已知映射统一管理：

```ts
export interface GameInfoInput {
  queueId: number | null
  mapId: number | null
  clientQueueName?: string | null
  clientMapName?: string | null
}

const knownQueues: Record<number, string> = {
  2400: '海克斯大乱斗',
  450: '极地大乱斗',
  420: '排位赛·单排/双排',
  440: '排位赛·灵活排位',
}

const knownMaps: Record<number, string> = {
  11: '召唤师峡谷',
  12: '嚎哭深渊',
}

const nonEmpty = (value?: string | null): string | null => value?.trim() || null

export function resolveGameInfo(input: GameInfoInput) {
  const queueId = input.queueId
  const mapId = input.mapId
  // 客户端当前中文名称经过检查后优先；本地映射作为明确的回退。
  const clientQueueName = nonEmpty(input.clientQueueName)
  const clientMapName = nonEmpty(input.clientMapName)

  return {
    gameTypeLabel:
      clientQueueName ?? (queueId !== null ? knownQueues[queueId] : undefined) ?? '待客户端确认',
    mapLabel:
      // 仅有实际地图 ID 时才允许展示名称。
      mapId === null ? '待客户端确认' : (clientMapName ?? knownMaps[mapId] ?? '未知地图'),
  }
}
```

注意：上面是**显示层参考代码**，不等于完整的生产实现。正式代码应保留 `source` 标识，校验客户端返回名称确实来自当前 ID，且当队列名称为原始英文标识或内部代号时，可使用本地 `zh_CN` 显示映射。不能因为队列元数据携带某地图信息，就把该默认地图当成当局的实际 `mapId`。

`src/shared/lib/history-presentation.ts` 和 `src/stores/home.ts` 应调用同一个队列识别函数；不要继续维护两套不同的 `queueId` 判断链。

### PR-04：Gameflow 跨阶段保持一致性（P0）

**修改** `src-tauri/src/lcu/gameflow.rs`、`gameflow_monitor.rs`、`src/stores/home.ts`。

建议新增会话级 `ModeContext`（至少含 `queueId`、`mapId`、数据来源及有效会话标识），而不是把旧 `LobbySnapshot` 永远保留：

- Lobby：通过当前房间读取。
- Matchmaking / ReadyCheck：在 `sessionKey` 未变化时，保留已知模式与地图信息。
- ChampSelect / InProgress：如收到**已验证、属于同一对局**的新元数据，则更新。
- EndOfGame：保持本局上下文直到结算切换。
- None、新房间、连接世代变化、账号切换：丢弃旧上下文。

`memberCount` 是房间/队伍计数，不应随着地图和队列上下文一起永久保留。

### PR-05：首页、历史、结算 UI（P1）

**修改文件：**

- `src/features/home/HomePage.vue`
- `src/stores/home.ts`
- `src/types/home.ts`
- `src/i18n/locales/zh-CN.ts`
- `src-tauri/src/lcu/history.rs`
- `src-tauri/src/lcu/settlement.rs`
- 相关 API DTO、Tauri IPC 契约与前端对应的战绩/结算组件

首页沿用当前 `dl` 结构和样式，只添加**地图**行，并将现有模式行命名为**游戏类型**：

```vue
<div class="flex items-baseline justify-between gap-3 py-2">
  <dt class="text-xs text-text-muted">{{ t('home.map') }}</dt>
  <dd class="text-right text-sm font-semibold text-text-soft">
    {{ mapLabel }}
  </dd>
</div>
<div class="flex items-baseline justify-between gap-3 py-2">
  <dt class="text-xs text-text-muted">{{ t('home.gameType') }}</dt>
  <dd class="text-right text-sm font-semibold text-text-soft">
    {{ gameTypeLabel }}
  </dd>
</div>
```

两项应由 `home.ts` 的计算属性传入，而非直接从 Vue 模板访问未验证的 LCU 原始对象。

`zh-CN.ts` 新增：

```ts
home: {
  // 与现有 home 翻译对象合并，不要覆盖其他键
  map: '地图',
  gameType: '游戏类型',
  pendingMetadata: '待客户端确认',
  unknownMap: '未知地图',
}
```

历史与赛后 DTO 加入 `mapId` 后，也必须同步 Rust 返回值、TypeScript 类型、IPC 守卫和 fixtures，并使用当局 `mapId` 展示。需要避免让此前保存的缺失地图数据被误解析为 `0`。

## 7. 按游戏阶段选择数据源

| 阶段                        | 地图                               | 游戏类型                            | 备注                         |
| --------------------------- | ---------------------------------- | ----------------------------------- | ---------------------------- |
| `Lobby`                     | 已证实的 `gameConfig.mapId`        | `gameConfig.queueId` → 当前队列名称 | 不将队列默认地图冒充实际地图 |
| `Matchmaking`、`ReadyCheck` | 同一 `sessionKey` 的有效已知地图   | 同一 `sessionKey` 的有效队列        | 临时缺失不清空上下文         |
| `ChampSelect`               | 本局可用、已验证的地图信息         | 本局 queue 元数据                   | 不误用新旧游戏 ID            |
| `InProgress`、`Reconnect`   | 实际当前会话地图，或保留可靠上下文 | 实际当前会话队列                    | 未知则显示待确认             |
| `EndOfGame`                 | 当前会话，最终以战绩详情为准       | 当前会话，最终以战绩详情为准        | 不污染下一局                 |
| 历史、赛后                  | 该 `gameId` 的战绩 `mapId`         | 该 `gameId` 的战绩 `queueId`        | 必须关联正确账号             |
| 未连接、无房间              | `—`                                | `—`                                 | 不显示旧会话数据             |

## 8. 测试计划

### 8.1 Rust 单元测试

文件：`lcu/lobby.rs`、`lcu/gameflow.rs`、`lcu/gameflow_monitor.rs`、`lcu/metadata.rs`（新增）、`lcu/history.rs`、`lcu/settlement.rs`。

- [ ] 有 `gameConfig.mapId` 时读取正确；无字段时为 `None`。
- [ ] `mapId` 为负数、非数字、对象或错误类型时拒绝/忽略，不产生默认值。
- [ ] 已有 `LobbySnapshot` 构造器和 `same_data()` 纳入 `map_id`。
- [ ] Lobby → Matchmaking → ReadyCheck 不丢失同一会话的有效地图/队列。
- [ ] 新 `sessionKey`、断线、新 `connection_generation` 会清空旧地图。
- [ ] 队列/地图元数据 404、204 或异常结构不会泄漏 LCU 原始响应或凭据。
- [ ] 历史战绩 `mapId` 与 `gameId` 严格对应，不能混入其他局。

### 8.2 Vitest / Vue 测试

推荐新增 `src/shared/lib/game-info.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { resolveGameInfo } from './game-info'

describe('地图与游戏类型中文显示', () => {
  it('使用实际地图及已知队列', () => {
    expect(resolveGameInfo({ queueId: 2400, mapId: 12 })).toEqual({
      gameTypeLabel: '海克斯大乱斗',
      mapLabel: '嚎哭深渊',
    })
  })

  it('不根据队列猜测地图', () => {
    expect(resolveGameInfo({ queueId: 2400, mapId: null }).mapLabel).toBe('待客户端确认')
  })

  it('未知 ID 可以采用客户端提供的中文名称', () => {
    expect(
      resolveGameInfo({
        queueId: 9999,
        mapId: 999,
        clientQueueName: '国服测试模式',
        clientMapName: '国服测试地图',
      }),
    ).toEqual({
      gameTypeLabel: '国服测试模式',
      mapLabel: '国服测试地图',
    })
  })
})
```

另需测试：

- [ ] `src/shared/ipc/contracts.ts` 校验新增 `mapId` 和后续 `ModeContext`。
- [ ] 同一 raw 数据在首页、历史和赛后显示一致。
- [ ] 组件由真实连接状态切到断开状态时地图和模式清空。
- [ ] 单独 `gameMode='ARAM'` 不被误报为普通 ARAM。
- [ ] 未知队列不会默认显示「海克斯大乱斗」。

### 8.3 Windows 国服实机测试

- [ ] 在当前目标版本的国服客户端登录，记录**脱敏后的**游戏版本、区域和语言。
- [ ] 创建普通 ARAM 房间，记录 `gameConfig` 的 `queueId`、`mapId` 是否存在。
- [ ] 创建 ARAM: Mayhem 房间，记录对应队列 ID 和本地化队列名称。
- [ ] 查询 `/lol-game-queues/v1/queues/{id}`，确认响应字段、类型及中文语言。
- [ ] 查询 `/lol-maps/v1/map/{id}`，确认地图名称字段及区域差异。
- [ ] 进入匹配与确认阶段，验证地图和游戏类型不闪烁。
- [ ] 进入游戏及战绩落盘后，核对本局实际 `mapId`、`queueId`。
- [ ] 分别测试取消匹配、换房间、切换账号、LCU 重启。
- [ ] 如果出现不同 ARAM 地图，确认显示的是**真实地图**，不是固定「嚎哭深渊」。

**采样安全要求**：不保存 lockfile 密码、Authorization Header、access token、完整 PUUID 或玩家敏感身份。若需要添加 JSON 测试夹具，先人工脱敏并仅保留必要字段。

### 8.4 推荐检查命令

```bash
pnpm install --frozen-lockfile
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

最终仍须在 Windows 环境下执行 `pnpm tauri dev` 进行真实客户端联调。

## 9. 任务拆分与验收标准

| PR  | 提交建议                          | 通过条件                                          |
| --- | --------------------------------- | ------------------------------------------------- |
| 01  | `feat/lcu-map-id`                 | `mapId` 完整贯通 Rust → IPC → Pinia               |
| 02  | `feat/lcu-game-metadata`          | 可查询/缓存客户端地图与队列元数据，失败可安全降级 |
| 03  | `refactor/game-info-resolver`     | 首页、历史、结算统一队列及地图显示规则            |
| 04  | `fix/gameflow-metadata-lifecycle` | 同一对局状态保留、新对局状态隔离                  |
| 05  | `feat/home-map-and-game-type`     | 中文 UI 与实机数据一致，自动化测试通过            |

**最终验收：**

1. 游戏类型来自确切 `queueId` 或已验证的客户端队列名称，而非 `gameMode` 单字段猜测。
2. 地图来自确切 `mapId`；缺失时明确标注未知，不通过队列推断实际地图。
3. 房间、匹配、选英雄、游戏中、历史和结算的显示一致且可解释。
4. 断线、重连、取消匹配、切换账号后不展示旧地图和旧队列。
5. 国服实机完成字段验证，并保留可回归的**脱敏** fixture。
6. 不违反 Riot 关于 LCU、产品注册、游戏完整性、隐私和第三方产品身份的规定。

---

**文档结论**：先打通真实 `mapId` 和 `queueId`，再基于当前客户端的地图/队列本地化元数据完成中文显示。实现上应复用现有 `LobbySnapshot`、`GameflowMachine`、`HomeStore` 和严格 IPC 校验，避免新增独立于对局生命周期的猜测型状态。本文为可执行设计，不代表已经验证所有国服响应字段。
