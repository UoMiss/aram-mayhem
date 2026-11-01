# TypeScript 业务类型（阶段 8.2）

以原始 HTML 实际字段为准，不凭空编造业务数据。

## 已建立

- `home.ts`
  - `ScoreRule` / `ScoreRuleSelection`：纯伤害、幸运数字、伤害尾数及“未选择”状态。
  - `HomeProfile`：召唤师昵称与 `roomPhase/gameMode` 业务码，不含 UI 文案。
  - `HomeViewModel`：只包含连接、昵称、房间/模式业务码；显示文案由 i18n 取得。
- `history.ts`
  - `MatchMode` / `HistoryFilter`：海克斯大乱斗、自定义与全部筛选。
  - `MatchResult` / `MatchKda`：胜负与 KDA 数值。
  - `MatchHistoryItem`：战绩 ID、模式、胜负、英雄、本地头像、KDA、好友标记、时间。
  - 筛选只使用 `HistoryFilter` 业务值；中文标签由 i18n 映射。
- `match-detail.ts`
  - `TeamSide` / `PlayerRelation` / `StatTone` / `SettlementLayout`。
  - `SettlementStat`：统计 key、数值、百分比与颜色语义；label 由 i18n 提供。
  - `SettlementPlayer`：队伍、英雄、等级、rank、昵称、关系、KDA、统计、评分。
  - `RedPacketEntry` / `RedPacketNotice`：红包名单条目；标题与说明由 i18n 提供。
  - `MatchDetailFixture`：共享静态 fixture，含 `isSharedFixture` 标记。
  - `MatchDetailSource`：未来按 matchId 载入真实详情的类型契约，本阶段不实现请求。
- `tools.ts`
  - `ScoreRuleOption`：规则 key 与 Font Awesome 图标；名称/说明由 i18n 提供。
  - `TeamPlayer`：稳定 ID + 完整昵称；8 人随机分组名单独立于结算 6 人。
  - `TeamSplit`：A/B 两组玩家数组，由纯算法返回。
  - 不包含真实客户端、API 或随机分组后端结构。
- `desktop.ts`
  - `AppRuntime` / `AppHealth` / `DesktopAdapter`：浏览器与 Tauri 共用的桌面健康检查契约。
  - `DesktopServiceErrorShape`：清洗后的错误形状，不包含 Rust 堆栈。
- `lcu.ts`
  - `LcuConnectionStatus` / `LcuStatusDto` / `LcuAdapter`：Rust ↔ Vue 的只读连接契约。
  - `source: real | unavailable | mock` 明确真实来源、平台不可用和浏览器 Mock。
- `settings.ts`
  - `SettingKey`：`autoStart` / `autoRetry` / `soundEffects`。
  - `SettingsFlags`：三个设置开关的内存状态。
  - 设置只使用 `SettingKey`；显示文案由 i18n 提供。
  - 不包含 localStorage、系统开机启动、音效资源或真实更新 API 类型。

业务值到 i18n key 的映射集中在 `src/i18n/labels.ts`；类型层不保存中文显示文案。

阶段 10.2 在 `lcu.ts` 增加 `GameflowPhase`、`LobbySnapshot`、`ChampionSelectSnapshot`、`GameSessionContext`、`GameflowSnapshot` 与 `GameflowAdapter`；未知阶段保留 `rawPhase`，连接状态与游戏阶段分离。
