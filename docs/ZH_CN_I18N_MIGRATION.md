# 阶段 8.2：简体中文文案资源化实施记录

> 开发规范原文位于 `docs/ARAM_MAYHEM_ZH_CN_I18N_DEV_SPEC.md`。本文件是用户指定路径下的实施记录、文案映射与验收结果。  
> 结论：**通过**。仅注册 `zh-CN`，未创建英文包、语言切换或语言检测。

## 1. 技术实现

- 新增依赖：`vue-i18n@11.4.16`（pnpm）。
- [src/i18n/index.ts](../src/i18n/index.ts)：`createAppI18n()` + 单例 `i18n`；`legacy: false`、`globalInjection: false`、`locale/fallbackLocale = 'zh-CN'`。
- [src/i18n/locales/zh-CN.ts](../src/i18n/locales/zh-CN.ts)：唯一语言包。
- [src/i18n/labels.ts](../src/i18n/labels.ts)：业务值到 i18n key 的类型化映射。
- [src/main.ts](../src/main.ts)：在 `createApp` 与 Pinia 之后安装 `i18n`。
- 组件统一 `useI18n({ useScope: 'global' })`，模板不直接使用 `$t`。
- [src/i18n/i18n.test.ts](../src/i18n/i18n.test.ts)：唯一 locale、叶子 key 完整性、插值/空格测试。

## 2. 文案映射表

完整键值以 `src/i18n/locales/zh-CN.ts` 为准；下表列出全部一级/二级域。

| namespace     | key / 中文                                                                                                                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common`      | `generating` 生成中...；`friend` 友；`self` 我；`backHome` 返回首页                                                                                                                                                                                                                                                                                       |
| `nav`         | `home` 首页；`history` 战绩；`tools` 工具；`settings` 设置                                                                                                                                                                                                                                                                                                |
| `a11y`        | `mainNav` 主导航；`connectionStatus` 连接状态；`historyFilters` 战绩筛选；`refreshHistory` 刷新战绩；`closeTeamDrawer` 关闭随机分组                                                                                                                                                                                                                       |
| `connection`  | `connected` 已连接；`pending` 待连接；`connecting` 连接中...；`waiting` 等待连接英雄联盟；`autoConnect` 打开并登录客户端后会自动连接。；`beforePick` 请在选英雄前启动助手，以记录准确分队。；`reconnect` 重新连接；`stillDisconnected` 仍然未连接？尝试以管理员身份重新打开助手。；`retryHint` 连接详情 · 每 {seconds} 秒自动重试                         |
| `home`        | `inRoom` 房间中；`matchMode` 匹配模式；`settlementNote` 对局结束自动结算；`trayNote` 关闭窗口可收进托盘。；`previousMatch` 上一局；`history` 历史对局                                                                                                                                                                                                     |
| `rules`       | `none` 未选择规则；`damage.name/description` 纯伤害规则 / 按伤害排名结算；`lucky.*` 幸运数字规则 / 按尾数匹配结算；`tail.*` 伤害尾数规则 / 按伤害尾数排名                                                                                                                                                                                                 |
| `history`     | `filters.all` 全部；`modes.hex` 海克斯大乱斗；`modes.custom` 自定义；`results.victory` 胜利；`results.defeat` 失败；`recentHint` 仅显示最近 {count} 局 · 点击查看结算                                                                                                                                                                                     |
| `matchDetail` | `title` 对局结算；`group` 分组模式；`global` 全局排行；`copyScreenshot` 复制截图；`fileNamePrefix` LOL战绩；`redPacketTitle` 发红包名单；`redPacketNote` 本局最后 {count} 名，请准备好你们的红包！；`teams.red/blue` 我方失败 / 敌方胜利；`badges.red/blue` 红方 / 蓝方；`stats.damage/taken/healing` 输出 / 承伤 / 治疗                                  |
| `tools`       | `rulesTitle` 算分规则；`toolsTitle` 小工具；`randomGroup` 随机分组；`moreTools` 更多工具                                                                                                                                                                                                                                                                  |
| `team`        | `title` 随机分组；`description` 从当前参与玩家中随机均分为 A、B 两组。；`participants` 参与玩家；`participantCount` {count} 人；`groupA` A组 (蓝队)；`groupB` B组 (红队)；`groupCount` {count} 人；`timeLabel` 随机时间（北京时间）；`start` 开始分组；`retry` 重新分组；`shuffling` 组队中 {count}s；`revealing` 揭晓中...；`copyImage` 复制图片         |
| `settings`    | `general` 通用设置；`autoStart` 自动启动并后台运行；`autoRetry` 断开连接自动重试；`soundEffects` 提示音效；`about` 关于助手；`version` 当前版本；`checkUpdate` 检查更新；`updateLatest` 已是最新版本！                                                                                                                                                    |
| `toast`       | `connectFirst` 请先连接客户端；`screenshotMissing` 截图区域不存在；`screenshotCopied` 截图已复制到剪贴板；`screenshotDownloaded` 截图已生成并自动下载；`screenshotFailed` 截图生成失败，请重试；`teamSelectFirst` 请先完成随机分组；`teamCopied` 分组图片已复制到剪贴板；`teamDownloaded` 分组图片已生成并自动下载；`teamFailed` 分组图片生成失败，请重试 |
| `placeholder` | `migrationPending` 后续阶段迁移；`description` 原始页面、Mock 数据与交互未删除，完整保存在 references/deepseek.original.html。                                                                                                                                                                                                                            |

## 3. 明确保留为数据/非 UI 的内容

| 内容                                            | 位置                    | 理由                                      |
| ----------------------------------------------- | ----------------------- | ----------------------------------------- |
| `峡谷小米` 召唤师昵称                           | `mocks/home.ts`         | 玩家数据                                  |
| 8 名随机分组玩家昵称                            | `mocks/tools.ts`        | 玩家数据                                  |
| 6 名结算玩家昵称                                | `mocks/match-detail.ts` | 玩家数据                                  |
| 英雄名、头像、KDA、评分、排名、伤害数值、百分比 | Mock / fixture          | 游戏数据                                  |
| `match-001..007`、`hex/custom`、规则 ID         | Mock / Store            | 稳定业务标识                              |
| `9小时前` 等相对时间                            | `mocks/history.ts`      | 演示时间数据                              |
| `自定义 (屠夫之桥)`                             | `mocks/match-detail.ts` | 队列数据                                  |
| `v2.4.0-release`                                | `mocks/settings.ts`     | 演示版本值                                |
| `ARAM: Mayhem`、`Mayhem Assistant v2.4`         | `AppHeader.vue`         | 固定品牌/版本                             |
| `LOL战绩` / `随机分组` 服务默认参数             | `image.service.ts`      | 内部默认值；页面已传入 i18n 同文案        |
| `ScreenshotError` 中文消息                      | `image.service.ts`      | 内部诊断；页面使用 i18n Toast，不直接显示 |
| 测试断言中的中文                                | `*.test.ts`             | 测试数据                                  |
| 代码注释                                        | 多处                    | 非 UI                                     |

## 4. Pinia / Mock / Service 职责调整

- `HomeProfile` 只保留 `summonerName` 与稳定状态码 `roomPhase: 'inRoom'`、`gameMode: 'normal'`；删除 `copy`、`connectionStatusLabel`、`currentRuleLabel`、`homeView.ruleLabel`。
- `HomePage` 通过 `HOME_ROOM_PHASE_KEYS`、`HOME_GAME_MODE_KEYS`、`SCORE_RULE_NAME_KEYS` 映射显示。
- `HISTORY_FILTERS` 变为 `HistoryFilter[]`；`MATCH_MODE_LABELS` / `MATCH_RESULT_LABELS` 删除，组件通过 `MATCH_MODE_KEYS` / `MATCH_RESULT_KEYS` 显示。
- `SettlementStat.label` 删除，保留 `key/value/percent/tone`；`RedPacketNotice` 只保留 entries；`MatchDetailFixture.teams` 删除，队伍标题由 `TEAM_TITLE_KEYS` 映射。
- `SCORE_RULE_OPTIONS` 只保留 key/icon；`SETTINGS_OPTIONS` 只保留 SettingKey。
- `useTeamShuffle` 不再返回中文 `statusText`，改为 `countdown`；TeamDrawer 用 `team.shuffling` / `team.revealing` / `team.retry` 计算按钮文案。
- `image.service.ts` 行为不变；页面负责 `t('toast.*')` 与文件前缀，Service 继续返回 `copied/downloaded` 或抛出结构化错误。

## 5. 测试与构建结果

| 命令                  | 结果                                                |
| --------------------- | --------------------------------------------------- |
| `pnpm typecheck`      | 通过                                                |
| `pnpm lint`           | 通过                                                |
| `pnpm format:check`   | 通过                                                |
| `pnpm test`           | **13 文件 / 70 测试通过**                           |
| `pnpm build`          | 通过，**96 模块**                                   |
| `pnpm check`          | 通过                                                |
| `pnpm check:baseline` | 通过，原始 HTML SHA-256 未变化                      |
| `pnpm audit`          | 0 漏洞（Vitest 4.1.12 + minimatch 11.0.3 override） |
| `pnpm audit --prod`   | 0 漏洞                                              |

新增测试：`src/i18n/i18n.test.ts`（唯一 locale、所有叶子 key、插值与空格）。

## 6. 视觉与 PNG 回归

- [stage8.2 证据](verification/stage8.2/README.md)。
- 9 个状态 × 5 尺寸；静态状态与阶段八 Vue 基线逐像素 **0 差异**。
- 随机分组完成态仅因随机玩家排列不同；标签、时间、尺寸一致。
- 分组/全局 PNG 与阶段八样例 **SHA-256 和字节完全一致**：896×1894、896×1696。
- 随机分组 PNG 880×570，A/B 标签、北京时间、8 人内容一致；玩家排列随机。
- 剪贴板「截图已复制到剪贴板」，读回 `image/png` 324,272 bytes；下载降级正常。

## 7. 未解决/保留项

- 微信/QQ 外部应用粘贴、真机安全区仍未人工验收。
- 开发依赖安全已处理，审计 0。
- Service 内部中文错误文案保留为诊断信息；不直接面向 UI。
- 队列名称、相对时间、版本号、玩家昵称属于数据，保留在 Mock。
