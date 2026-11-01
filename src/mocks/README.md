# Mock 数据目录（阶段 8.2）

原始演示数据仍完整保存在 `references/deepseek.original.html`；这里提取页面所需的类型化 Mock。

## 已提取

- `home.ts`
  - `createMockHomeProfile()`：峡谷小米昵称与 `inRoom/normal` 业务码；中文显示由 i18n 提供。
  - `INITIAL_SCORE_RULE`：`tail`（伤害尾数规则）。
  - 规则显示名称/说明由 `src/i18n/locales/zh-CN.ts` 提供；Mock 只保留 `INITIAL_SCORE_RULE`。
- `history.ts`
  - `MATCH_HISTORY`：7 条原始战绩，5 条海克斯大乱斗 + 2 条自定义，顺序、英雄、胜负、KDA、时间完全一致。
  - 稳定 ID：`match-001` 至 `match-007`。
  - `HISTORY_FILTERS`：`all/hex/custom` 业务 key；模式/胜负文案由 i18n 提供。
  - `timeLabel` 为演示相对时间数据，不进入语言包。
- `match-detail.ts`
  - `MATCH_DETAIL_FIXTURE`：原始结算示例的唯一静态 fixture。
  - `isSharedFixture: true`：明确不与 7 条历史战绩逐条绑定；不冒充真实逐局详情。
  - 6 名玩家：队伍、头像、等级、rank、昵称、关系、KDA、输出/承伤/治疗及百分比、评分。
  - 队列/时长、5 条红包名单；队伍标题、红包标题/说明、统计 label 由 i18n 提供。
  - 分组视图与全局排行共享同一份 `players`；队伍总 KDA 由 KDA 求和；全局按 rank 排序。

- `tools.ts`
  - `SCORE_RULE_OPTIONS`：三条规则的 key、顺序和图标；说明由 i18n 提供。
  - `TEAM_DRAW_PLAYERS`：原始 8 名玩家——Ezreal、洞爷湖、黛乃奈昭姿、Faker、湘川苦茶子、奢谨筱箅栗、翻斗花园牛爷爷、召唤师52395。
  - 保留完整昵称；初始网格通过 CSS `truncate` 处理长昵称，不把 `...` 写进数据。
  - 该名单是独立工具页 Mock，不从结算详情 6 人推导，也不调用真实客户端。
  - 随机分组由 `features/tools/teamRandomizer.ts` 在运行时洗牌生成，不预置固定结果。
- `settings.ts`
  - `createDefaultSettings()`：三个开关默认全部 true，每次返回独立对象。
  - `SETTINGS_OPTIONS`：三个设置业务 key，顺序固定；中文标签由 i18n 提供。
  - `SETTINGS_VERSION`：原始演示数据 `v2.4.0-release`，不读取 package.json。
  - 更新提示由 `settings.updateLatest` 提供。
  - 不读取/写入 localStorage；刷新后恢复默认值。

英雄头像从 DDragon 14.1.1 下载到 `src/assets/champions/`，运行时不访问外部图片 CDN。Mock 只保存数据与稳定业务值，不保存 UI 文案；设置页不接入真实系统能力。
