# ARAM Mayhem｜项目审查与上线验收报告

> 审查日期：2026-11-07（Asia/Shanghai）  
> 执行标准：`docs/ARAM_Mayhem_AI_项目审查与上线验收执行标准.md`，版本 1.0.0  
> 文档性质：本次已完成审查的结果归档；生成本文不代表重新执行测试或完成修复。  
> 发布判定：**NO_GO**。  
> 代码位置均指审查时工作区快照 W，不能直接等同于已提交 HEAD 的对应实现。

## 9.1 执行摘要

| 项目                                | 审查记录                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库 / 分支                         | <https://github.com/UoMiss/aram-mayhem> / `main`                                                                                                                          |
| HEAD SHA                            | `a20e02f279e21d3fc7b1cf55e5e4269bcd2b38bf`                                                                                                                                |
| HEAD 提交时间                       | 2026-11-07 07:06:49 +08:00                                                                                                                                                |
| HEAD 标题                           | Release ARAM Mayhem 0.1.1                                                                                                                                                 |
| 产品版本                            | `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 均为 `0.1.1`                                                                                          |
| 实际审查对象                        | W = 上述 HEAD + 审查时未提交工作区内容；85 个已跟踪修改、28 个未跟踪条目                                                                                                  |
| 审查范围                            | 架构与 IPC、LCU、本地账号与会话、模式上下文、3v3/4v4/5v5 随机分队、战绩与结算、规则锁定与幸运数字、本地存储、缓存边界、截图、设置、在线更新、CI、Windows 发行与第三方政策 |
| 实际证据                            | E1 本地执行及 GitHub 历史 CI 日志；E2 实际源码；E3 官方文档。无当次 Windows / 国服 LCU 实测                                                                               |
| 环境                                | macOS / Darwin 27 / arm64；Node 22.23.4；pnpm 10.34.9；Rust 1.99.1                                                                                                        |
| Windows / WebView2 / 国服客户端版本 | 未取得；对应实机验收为 `NEEDS_WINDOWS_LCU`，未执行的 Windows 安装测试为 `NOT_RUN`                                                                                         |
| 严重度数量                          | **S0：0；S1：1；S2：7；S3：2；S4：0**                                                                                                                                     |
| 问题类别数量                        | **BUG：6；GAP：3；COMPLIANCE_UNVERIFIED：1**                                                                                                                              |
| 当前发布判定                        | **NO_GO**：存在已复现 S1，且关键验收失败；证据缺口同时存在                                                                                                                |

最重要的三个问题：

1. **F-001 / S1**：账号失效后，已显示的旧账号结算仍保留，破坏账号数据隔离。
2. **F-002 / S2**：对局中断连会清空阶段，更新安装保护随之解除。
3. **F-003 / S2**：赛后返回缺失伤害的成功快照后，不进入有限重试，也缺少对应手动恢复入口。

其他发布阻断或缺口包括：截图离页取消失效、`pnpm check` 格式门禁失败、当前工作区尚无可溯源的完整 Windows 发布验收、国服当前客户端实测缺失，以及 Riot 登记、功能和资产合规材料未核实。不能将旧版本“实机正常”或旧 HEAD 的 CI 通过视为当前 W 已通过。

### 审查边界与只读证明

- 审查未修改项目源码、配置或凭据，未提交代码、创建 PR、触发发布或调用真实游戏客户端写接口。
- 自动化检查及新增回归测试在 `/private/tmp/aram-audit-20261107/source` 副本执行；新增审查测试未进入项目。
- 2026-11-07 14:11:15 +08:00 核验原工作区清单内 408 个文件内容未变、HEAD 未变；记录见 `readonly-verification.json`。
- 基线清单：`/private/tmp/aram-audit-20261107/manifest-before.json`。
- 清单 SHA-256：`34a6616a8a4255cc44f5161c7c11c94a2bc5f19d656fc60844e01a931abec8b7`。
- 本报告是审查完成后应用户要求新增的文档，不包含在上述只读核验时点中。
- 证据目录为本机临时目录，可能被系统清理；正式验收时应由负责人将脱敏后的证据归档到受控位置。

### 已确认的实现与边界

- LCU 凭据保留在 Rust；专用本地客户端连接经过校验的 loopback 端点，限制代理和重定向。TLS 证书例外限定在 LCU 本地连接，不能据此认定所有外网 HTTPS 都跳过校验。
- **默认只读存在明确例外**：用户启用自动接受对局后，会调用 `POST /lol-matchmaking/v1/ready-check/accept`。开关默认关闭；该功能是否取得适当外部批准，见 F-009。
- 正式随机分队限制经确认的自定义房间 6/8/10 名真人，完整性未知时拒绝正式抽签；正式算法采用安全随机源、拒绝采样与 Fisher–Yates，无隐藏实力配平。
- 结算使用完整整数伤害；纯伤害降序，尾数从个位向高位比较，幸运数字先比较个位到幸运数字的距离，再以个位较大者优先，再比较高位。完整相同保留并列；红包末位边界包含所有并列者。
- 规则和幸运数字按账号与 gameId 隔离并采用不可覆盖写入。幸运数字赛后一次生成并保存；本地测试不等于已验证实际断电、Windows 多用户及重装恢复。
- 没有实现清缓存功能，DATA-02 / S-06 为 `N/A`；不能把未实现功能直接标成删除数据 BUG。
- Data Dragon 静态资源核对为 `16.22.1`。中文数据中 Annie 的 `name` 为“黑暗之女”、`title` 为“安妮”，项目映射符合实际中文显示目的，未将其判为字段颠倒 BUG。
- 在线更新已有版本、来源与签名约束；当前已发布 v0.1.1 资产不能证明这些未提交更新代码已经发布或验收。

## 9.2 条目矩阵

**证据解释：**E1 为实际执行；E2 为直接源码；E3 为外部规范；E4 仅为推断。下表所有 `PASS` 只覆盖明确列出的本地证据，不包含未执行的国服实机。路径相对仓库根目录；行号属于 W 的审查时快照。

| ID      | 结果状态 | 证据等级 | 当前 W 文件 / 命令日志                                                                     | 判定依据                                                              | 缺口、影响与建议                                                        |
| ------- | -------- | -------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ARC-01  | PARTIAL  | E1/E2    | `src-tauri/src/lcu/client.rs:39`；`src-tauri/src/commands/app.rs:31`；前端与 Rust 测试日志 | 敏感 IO 在 Rust，真实与模拟适配器分离；健康检查仍硬编码 simulated     | F-005：修正诊断语义，避免错误状态成为后续判断依据                       |
| ARC-02  | PASS     | E1/E2    | `src/shared/ipc/`、`src/types/`、Rust DTO；`fresh-typecheck.log`、`fresh-test.log`         | DTO、运行时 guard 和类型检查通过；伤害等整数按字符串跨 IPC            | 仅证明当前测试覆盖的契约；客户端新增字段仍需国服采样                    |
| LCU-01  | PARTIAL  | E1/E2    | `src-tauri/src/lcu/discovery.rs:225`；`src-tauri/src/lcu/client.rs:39`                     | 本地进程、PID、凭据、loopback 和错误分类有保护                        | 国服发现和权限实测 `NEEDS_WINDOWS_LCU`；补多客户端、登录/登出与权限场景 |
| LCU-02  | PASS     | E2/E3    | `src-tauri/src/lcu/client.rs:39`、`:126`；`gameflow_events.rs:109`                         | TLS 例外限定 LCU，本地地址与外网更新边界明确                          | 不代表完全只读或外部合规通过；自动接受 POST 见 F-009                    |
| LCU-03  | FAIL     | E1/E2    | `src/composables/useMatchLifecycle.ts:161`；`src/stores/connection.ts:20`；账号回归日志    | 原生账号失效后，前端已显示结算未清除                                  | F-001；统一账号代际和下游失效；更新安全状态另见 F-002                   |
| LCU-04  | PARTIAL  | E1/E2    | `src-tauri/src/lcu/gameflow_monitor.rs`、`lobby.rs`；`src/stores/home.ts`；`ddragon.json`  | 模式上下文、未知字段退化、元数据来源和缓存边界有实现                  | 当前国服字段与中文名称 `NEEDS_WINDOWS_LCU`，不得按社区文档保证稳定      |
| TEAM-01 | PASS     | E1/E2    | `src-tauri/src/lcu/roster_integrity.rs:74`；`src/features/tools/components/TeamDrawer.vue` | 自定义房间、完整真人名单、6/8/10 人均受限制                           | 真实 3v3/4v4/5v5 接口证据仍需 Windows 补齐                              |
| TEAM-02 | PASS     | E1/E2    | `src-tauri/src/commands/participants.rs:17`；`src-tauri/src/lcu/participants.rs`；相关测试 | 机器人/观战者排除、身份去重、完整性与预抽刷新有验证                   | 需实测国服真实房间响应，尤其槽位数与可识别 ID 不一致                    |
| TEAM-03 | PASS     | E1/E2    | `src/features/tools/teamRandomizer.ts:8`；`team-seeds.log`                                 | 安全随机与 Fisher–Yates；256 种种子 × 3 种人数共 768 次不变量检查通过 | 有限统计不证明数学上的绝对公平；保持均匀分组设计                        |
| TEAM-04 | PASS     | E1/E2    | `TeamDrawer.vue`、`useTeamShuffle.ts`；交互测试                                            | 防重复、关闭清理、身份指纹失效、昵称更新和导出复核有实现              | 真机断线、账号切换和复制需复验                                          |
| TEAM-05 | PARTIAL  | E2       | `src/features/tools/components/TeamDrawer.vue:332`、`:413`                                 | 未写官方队伍；截图含类型、地图与时间                                  | F-007：截图缺来源及“本地分队建议”标识                                   |
| HIST-01 | FAIL     | E1/E2    | `src/features/history/HistoryPage.vue:53`；`src/composables/useMatchLifecycle.ts:161`      | gameId 字符串、20 条限制及去重排序有实现；账号失效链不闭合            | F-001：按账号会话取消请求并清理可见数据                                 |
| SET-01  | PARTIAL  | E1/E2    | `src-tauri/src/lcu/settlement.rs`；`src/shared/ipc/settlement-contract.ts`；账号回归日志   | 排名、好友集合及精度逻辑有测试；可见旧账号结算仍残留                  | F-001 阻止账号隔离验收通过                                              |
| SET-02  | PARTIAL  | E1/E2    | `src-tauri/src/commands/match_rules.rs:109`；`rust-test.log`                               | 不可覆盖、同账号同局复用、幸运数字一次保存有测试                      | 真进程重启、断电与 Windows 存储恢复仍未完成                             |
| SET-03  | FAIL     | E1/E2    | `src-tauri/src/lcu/settlement.rs:257`、`:406`；`MatchDetailPage.vue:57`                    | missing_damage 成功快照不触发页面重试；404/204 未形成完整未就绪语义   | F-003：统一 pending 状态、有限重试和手动恢复                            |
| DATA-01 | PARTIAL  | E1/E2    | `src-tauri/src/commands/match_rules.rs:80`、`:109`；本地存储测试                           | 临时文件、同步和不可覆盖写入有保护                                    | F-008：损坏恢复、升级兼容、多用户与备份验收不足                         |
| DATA-02 | N/A      | E2       | 设置与原生命令全量检索                                                                     | 未提供清缓存/批量删除能力                                             | 无删除功能不等于自动产生 BUG；未来加入时另做白名单删除审查              |
| SEC-01  | PASS     | E1/E2    | `src-tauri/capabilities/`、`src-tauri/src/commands/`；guard 测试                           | 主窗口限制、输入校验、固定更新来源、凭据脱敏                          | 本地测试范围内通过；完整依赖许可证与 cargo audit 见证据缺口             |
| SEC-02  | FAIL     | E1/E2    | `MatchDetailPage.vue:167`、`:184`；`src/services/image.service.ts:137`                     | 未发现未经同意云上传；离页截图仍交付、账号旧数据可见                  | F-001/F-004：账号隔离及交付前取消检查                                   |
| UX-01   | PARTIAL  | E1/E2    | 主要 Vue 页面、i18n、交互测试                                                              | loading/empty/error/offline 等基本状态与部分键盘行为有测试            | F-003/F-007/F-010；完整读屏与减少动画人工验收 `NOT_RUN`                 |
| OPS-01  | FAIL     | E1/E2    | `package.json:18`；`fresh-check.log`；本节测试记录                                         | 类型、lint、274 前端测试、129 Rust 测试和构建通过；格式门禁失败       | F-006；新增审查回归亦有 4 项失败，不能仅以原有测试通过结案              |
| OPS-02  | FAIL     | E1/E2    | `src-tauri/src/commands/updates.rs:125`；`.github/workflows/windows-release.yml:148`       | 对局断连解除安装保护；旧 HEAD CI 仅覆盖旧代码                         | F-002/F-008；当前 W 安装、退出、升级和卸载无验收报告                    |
| GOV-01  | PARTIAL  | E2/E3    | `README.md:37`、`:39`；`src/features/settings/SettingsPage.vue:71`                         | README 有免责声明；未取得门户登记与授权材料，客户端未呈现免责声明     | F-009/F-010；需产品/合规负责人补材料与显著入口                          |
| GOV-02  | PARTIAL  | E1/E2    | 工作区基线、`github-release.json`、README 与发布工作流                                     | 已发布 v0.1.1 可查，但 W 与其不同且版本号相同                         | F-008：冻结唯一提交/版本，建立工件、变更、回滚与负责人关联              |

### 数据流与接口边界记录

```text
本地进程 / lockfile 校验
  → 专用 loopback HTTPS / WebSocket
  → Rust 读取、账号/会话一致性校验、DTO
  → Tauri command / event
  → TypeScript runtime guard → Pinia → Vue

房间完整性 → 当前账号/房间预抽刷新 → 安全随机分队 → 本地建议 → 导出前复核
赛后详情 → 当前账号与好友/自定义参与集合 → 锁定规则 → 幸运数字持久化 → 排名/红包名单
```

| 实际 LCU 路径                                                               | 方法 / 阶段               | 主要用途及字段范围                   | 失败与边界                                                |
| --------------------------------------------------------------------------- | ------------------------- | ------------------------------------ | --------------------------------------------------------- |
| `/riotclient/region-locale`                                                 | GET / 连接探测            | 区域、语言、客户端可达性             | 可达不等于账号仍有效；F-001 相关                          |
| `/lol-summoner/v1/current-summoner`                                         | GET / 账号确认            | puuid、summonerId、昵称              | 建立账号范围；账号变化必须取消旧请求                      |
| `/lol-gameflow/v1/gameflow-phase`                                           | GET / 全阶段              | 当前阶段                             | 未知值退化；断线清空 UI 阶段不能同时解除更新保护          |
| `/lol-gameflow/v1/session`                                                  | GET / 对局生命周期        | gameId、队列、模式、地图与会话上下文 | 不跨局复用；未知字段不猜测                                |
| `/lol-lobby/v2/lobby`                                                       | GET / 大厅                | 自定义房间、双方队伍、成员身份       | 正式抽签需要完整性证明                                    |
| `/lol-lobby/v2/lobby/members`                                               | GET / 大厅回退            | 成员列表                             | 单独回退名单不等于双方完整自定义名单                      |
| `/lol-champ-select/v1/session`                                              | GET / 选人                | 当前可见会话及玩家信息               | 不用于解锁隐藏身份，不冒充正式自定义大厅                  |
| `/lol-summoner/v1/summoners/{id}`                                           | GET / 名称补全            | 已知身份的公开昵称                   | 不改变正式分队身份集合                                    |
| `/lol-summoner/v2/summoners/puuid/{id}`                                     | GET / 大厅名称补全        | 已知 puuid 的昵称                    | 仅已知大厅身份，非隐藏身份探测                            |
| `/lol-match-history/v1/products/lol/{puuid}/matches?begIndex=0&endIndex=19` | GET / 战绩                | 当前账号最多 20 条比赛摘要           | 账号前后校验、gameId 字符串、排序去重                     |
| `/lol-match-history/v1/games/{id}`                                          | GET / 详情与结算          | 参与者、阵营、胜负、精确伤害、时长   | 当前未完整区分赛后 404/204 与永久错误，见 F-003           |
| `/lol-chat/v1/friends`                                                      | GET / 好友范围            | 好友身份集合                         | 缺失集合不能伪造好友排行                                  |
| `/lol-game-data/assets/v1/champion-summary.json`                            | GET / 元数据              | 英雄 ID 与显示信息                   | 本地资源与可信元数据回退                                  |
| `/lol-game-queues/v1/queues/{id}`                                           | GET / 元数据              | 队列名称与类型                       | 未知值保持未知；缓存按范围与 TTL 管理                     |
| `/lol-maps/v1/map/{id}`                                                     | GET / 元数据              | 地图 ID 与名称                       | 不按 ARAM 字样猜地图                                      |
| `/lol-matchmaking/v1/ready-check`                                           | GET / ReadyCheck          | 玩家接受状态                         | 与账号、阶段及控制令牌关联                                |
| `/lol-matchmaking/v1/ready-check/accept`                                    | POST / 明确启用自动接受后 | 接受对局                             | 默认关闭；唯一明确列出的 LCU 写操作，外部政策适用性待核实 |
| WebSocket 订阅（含 `/lol-login/v1/session`）                                | 本地事件 / 全阶段         | 唤醒刷新与账号/会话变化              | 不直接将未经校验的原始事件交付页面                        |

共同边界：本地认证信息不进入 Vue；可选 GET 对 404/204 返回空值，普通 GET 的认证、超时、连接错误有分类，但比赛详情未就绪链路仍有 F-003。以上来自实现，不是 Riot 对接口可用性的保证；所有当前国服字段验证为 `NEEDS_WINDOWS_LCU`。

## 9.3 逐项发现

### F-001｜账号失效后保留已显示的旧账号结算

- **类别 / 严重度 / 条目**：BUG / **S1** / LCU-03、HIST-01、SET-01、SEC-02。
- **证据等级**：E1/E2。
- **代码定位**：`src/composables/useMatchLifecycle.ts:161`；`src/features/match-detail/MatchDetailPage.vue:32`；`src/features/history/HistoryPage.vue:53`；`src/stores/connection.ts:20`；`src-tauri/src/lcu/gameflow_monitor.rs:350`。
- **当前行为**：原生层可检测账号变化并发布账号失效；前端生命周期处理只重置内部变量，未清理已显示结算。页面加载条件依赖 LCU 传输连接，传输仍可达时不等同于账号仍有效。
- **预期不变量**：任何账号失效或切换都应立即使旧账号可见数据、目标 gameId 和请求失效；晚到结果不得回填。
- **影响范围 / 触发条件**：已经打开 A 的结算，客户端账号失效或切换，而传输探测仍为已连接。
- **最小复现（已执行）**：挂载实际 Vue 页面与实际 `useMatchLifecycle`；加载 A 的结算；保持 LCU connected；将 gameflow 置为 `account_changed`、connected=false、phase/session=null。预期结算为空；实际完整 A 快照仍存在。
- **证据**：`account-invalidation-regression.log`，退出码 1；测试 `audit_account_invalidation_clears_already_displayed_settlement_even_with_transport_connected`。
- **建议修复**：在 `useMatchLifecycle.ts` 与 home/history/settlement stores 建立统一账号代际失效；同步清理页面目标、快照和请求代际；页面依赖有效账号会话，不仅依赖传输连接。保留按账号隔离的磁盘规则历史，不删除用户数据。
- **验收测试**：上述回归转绿；新增 A→B、旧请求晚到、账号退出但 LCU 可达、同客户端重新登录场景。Windows 国服在 A 结算页切换到 B，旧昵称/战绩/排名立即消失，B 数据加载后无 A 残留；当前为 `NEEDS_WINDOWS_LCU`。
- **信心 / 剩余未知**：高；真实国服事件时序与界面表现仍需实测。

### F-002｜对局中断连后解除更新安装保护

- **类别 / 严重度 / 条目**：BUG / S2 / LCU-03、OPS-02。
- **证据等级**：E1/E2。
- **代码定位**：`src-tauri/src/commands/updates.rs:125`、`:289`；`src-tauri/src/lcu/gameflow.rs:670`。
- **当前行为**：`disconnected()` 清空 phase/session 并设置 connected=false；`install_blocked()` 对 phase=None 返回 connected，因此变为 false。代码注释关于保留活动阶段的说法与实际路径不一致。
- **预期不变量**：不能仅因短暂无法读取客户端而认定对局已安全结束并允许安装重启。
- **影响范围 / 触发条件**：活动对局中 LCU 短暂断连，用户随后确认更新安装。
- **最小复现（已执行）**：实际 `GameflowMachine` 先 observe InProgress，再 disconnected；期望安装仍被阻止，实际返回允许。仅测试保护判定，未运行安装器。
- **证据**：`updater-disconnect-regression.log`，退出码 101；`audit_active_match_disconnect_must_keep_install_blocked`。
- **建议修复**：在 gameflow/updates 中引入独立的安装安全状态或最后可信活动场次；区分暂时不可达与确认退出/空闲。不要为了更新保护继续向 UI 展示过期阶段。
- **验收测试**：活动→断连仍阻止；确认结束/退出后按明确策略允许；旧事件不能解除保护；未连接且无活动历史应有合理更新路径。Windows 游戏中断连并尝试更新，应拒绝危险时机安装；`NEEDS_WINDOWS_LCU`。
- **信心 / 剩余未知**：高；真实安装流程造成的用户影响未实机执行。

### F-003｜赛后伤害未就绪时不重试

- **类别 / 严重度 / 条目**：BUG / S2 / SET-03、UX-01。
- **证据等级**：E1/E2。
- **代码定位**：`src-tauri/src/lcu/settlement.rs:257`、`:406`；`src/features/match-detail/MatchDetailPage.vue:57`、`:300`；`src-tauri/src/lcu/client.rs:118`。
- **当前行为**：缺失伤害返回成功快照 `ranking_status=missing_damage`。页面自动重试监听 errorCode，未覆盖该成功但未就绪状态；手动重试入口只覆盖 missing_friends。比赛详情使用普通 GET，未建立完整 404/204 pending 语义。
- **预期不变量**：赛后暂缺统计应明确未就绪、有限重试并允许手动恢复；不能伪造零伤害或无限轮询。
- **影响范围 / 触发条件**：赛后 API 已有比赛，但伤害统计稍后才完整。
- **最小复现（已执行）**：第一次返回 missing_damage，下一次准备返回完整数据；推进计时 10 秒，实际仍只有 1 次请求，未恢复。
- **证据**：`settlement-pending-regression.log`，退出码 1；`audit_missing_damage_after_game_retries_when_statistics_become_ready`。
- **建议修复**：从 Rust DTO、TS guard/store 到页面统一未就绪状态或稳定错误码；仅对当前赛后上下文做有上限的重试，提供手动入口；区分历史永久缺失，切换账号/比赛或离页取消。
- **验收测试**：缺数据→完整数据可自动恢复；404/204 按上下文分类；超时有上限；换账号不回填；永久缺失不伪造排名。国服结束到战绩统计就绪全程录屏，`NEEDS_WINDOWS_LCU`。
- **信心 / 剩余未知**：高；当前国服实际统计延迟分布未测。

### F-004｜离开结算页后截图仍写入剪贴板

- **类别 / 严重度 / 条目**：BUG / S2 / SEC-02、UX-01。
- **证据等级**：E1/E2。
- **代码定位**：`src/features/match-detail/MatchDetailPage.vue:167`、`:184`；`src/services/image.service.ts:137`。
- **当前行为**：离页会增加 copyGeneration，但结算截图只在 `captureAndDeliverScreenshot()` 已完成交付后检查代际。公共 helper 已支持 `beforeDeliver`，此处没有传入。
- **预期不变量**：截图生成期间离页、切换比赛或账号后，不得继续交付过期截图。
- **影响范围 / 触发条件**：较慢截图渲染期间离开结算页，或者账号/目标比赛变化。
- **最小复现（已执行）**：实际页面与实际截图 helper；仅模拟延迟 canvas 和 clipboard；点击截图后离页，再完成渲染。期望 clipboard.write 调用 0 次，实际 1 次。没有写入真实系统剪贴板。
- **证据**：`settlement-export-regression.log`，退出码 1；`audit_settlement_export_is_cancelled_if_page_changes_during_capture`。
- **建议修复**：结算页传入 `beforeDeliver`，校验页面、账号、比赛和 generation；覆盖剪贴板失败后的下载回退；复用现有服务能力。
- **验收测试**：离页/切号/换局后剪贴板和下载均为 0 次；正常页面仍仅交付一次；下载回退同样检查。Windows 实际截图与剪贴板验收 `NOT_RUN`。
- **信心 / 剩余未知**：高；WebView2 实际剪贴板权限和渲染耗时需实测。

### F-005｜原生健康检查错误声明 simulated=true

- **类别 / 严重度 / 条目**：BUG / S3 / ARC-01。
- **证据等级**：E2。
- **代码定位**：`src-tauri/src/commands/app.rs:31`、`:80`；`src/App.vue:100`。
- **当前行为**：原生健康检查硬编码 simulated=true，注释仍称仅 Mock、无 LCU；测试也断言该值。当前 App 只取 appVersion，未证明这会让正式页面回退到演示数据。
- **预期不变量**：健康检查对运行时与数据源的描述应符合实际定义。
- **影响范围 / 触发条件**：健康诊断、后续调用方依赖该字段时。
- **最小复现**：静态直接读取返回值与调用方；原生 Windows IPC 调用 `NOT_RUN`。
- **建议修复**：修正 `commands/app.rs`、对应 DTO/guard 与测试；如字段混淆“运行环境”和“当前数据源”，拆分或明确语义。
- **验收测试**：原生健康检查值符合正式环境；浏览器演示仍独立；不得改变真实 LCU 连接判定。Windows 实际命令返回复核 `NOT_RUN`。
- **信心 / 剩余未知**：高；当前用户可见影响有限。

### F-006｜工作区格式检查门禁失败

- **类别 / 严重度 / 条目**：BUG / S2 / OPS-01。
- **证据等级**：E1/E2。
- **代码定位**：`docs/ARAM_Mayhem_AI_项目审查与上线验收执行标准.md:1`；`package.json:18`。
- **当前行为**：`pnpm check` 因审查标准文档的 Prettier 格式不符合项目配置而退出 1；该文件在审查时未跟踪，因此这是 W 的问题，不能称为已提交 HEAD 的 CI 失败。
- **预期不变量**：拟交付工作区应通过既有格式门禁。
- **最小复现（已执行）**：冻结锁文件安装后运行 `pnpm check`；期望退出 0；实际退出 1，仅该文档被报告格式问题。
- **证据**：`fresh-check.log`；安装前检查也得到同类结果。
- **建议修复**：仅格式化该 Markdown，保持标准条目、编号和含义不变；不要通过忽略文件或放宽门禁掩盖。
- **验收测试**：`pnpm check` 完整执行并退出 0；标准内容与编号复核一致。该项不依赖国服实测。
- **信心 / 剩余未知**：高；本报告新增后也应按同一格式规范检查。

### F-007｜分队截图缺少来源与本地建议说明

- **类别 / 严重度 / 条目**：GAP / S3 / TEAM-05；属于本次审查标准明确提出的验收差距。
- **证据等级**：E2。
- **代码定位**：`src/features/tools/components/TeamDrawer.vue:332`、`:413`。
- **当前行为**：截图结果有游戏类型、人数/地图、时间；正式结果缺应用来源和“本地分队建议”。未发现写入官方队伍的实现。
- **预期不变量**：离开应用上下文的截图仍能辨认来源与建议性质。
- **影响范围 / 触发条件**：分队结果被分享给未操作本应用的人。
- **最小复现**：静态检查截图节点的文本构成；本次重新导出图片 `NOT_RUN`。此前用户要求精简文案，因此分类为新标准下的 GAP，不追溯为既有承诺 BUG。
- **建议修复**：在截图区域加入简短“ARAM Mayhem · 本地分队建议”，保留现有蓝色方/红色方和时间，不恢复冗长说明。
- **验收测试**：新增 `team_capture_contains_source_and_local_suggestion`；截图内含来源、性质、模式、时间；小窗口不溢出。Windows 实际导出 `NOT_RUN`。
- **信心 / 剩余未知**：高；最终紧凑布局由产品确认。

### F-008｜当前发行溯源及升级、恢复验收未闭合

- **类别 / 严重度 / 条目**：GAP / S2 / DATA-01、OPS-02、GOV-02；属于正式上线要求。
- **证据等级**：E1/E2。
- **代码定位**：`.github/workflows/windows-release.yml:148`；`src-tauri/src/commands/match_rules.rs:80`；`README.md:24`。
- **当前行为**：CI 冒烟为静默安装、运行约 8 秒、finally 强制结束进程；没有证明正常托盘退出、实际在线升级与卸载。W 大量变更仍沿用 0.1.1；已发布 v0.1.1 仅安装包和校验文件，不能证明新 Updater 已发行。损坏规则文件返回通用不可用错误，尚无完整恢复材料。
- **预期不变量**：提交、版本、工件与报告一一对应；升级不重抽幸运数字、不覆盖规则；损坏文件有保护和可执行恢复方案。
- **影响范围 / 触发条件**：正式分发当前 W，用户从旧安装升级、重装、切换 Windows 用户或遇到记录损坏时。
- **最小复现 / 证据**：读取当次 GitHub API、运行日志与源码验证覆盖范围；实际 Windows 升级、多用户、故障恢复 `NOT_RUN`。未断言当前必然安装失败或已经丢失数据。
- **建议修复**：冻结新的唯一提交/版本；发布工件记录源 SHA、版本、校验值、签名策略；补发布验收和备份/恢复文档，在 `match_rules.rs` 增加可区分的损坏反馈及受控恢复设计，禁止静默重新抽取幸运数字。
- **验收测试**：同一候选构建完成安装、启动、正常退出、在线升级、卸载/重装、旧记录可读、损坏提示和备份恢复；安装包与更新资产可溯源；不同 Windows 用户数据隔离。
- **信心 / 剩余未知**：高（证据缺口）；未运行场景的实际成功率未知。

### F-009｜Riot 登记、功能及资产授权待核实

- **类别 / 严重度 / 条目**：COMPLIANCE_UNVERIFIED / S2 / GOV-01、LCU-02；关键合规门禁未通过，不能仅以 S2 接受绕过。
- **证据等级**：E2/E3。
- **代码定位**：`src-tauri/src/lcu/client.rs:126`；`src/features/match-detail/settlement-presentation.ts:41`；`README.md:37`。
- **外部依据**：Riot General Policies、League Client API 官方说明、第三方应用与游戏完整性说明；见 9.5 官方资料表，访问日期 2026-11-07。
- **当前行为**：仓库含默认关闭的自动接受对局 POST、红包名单与 Riot 相关素材；无法从源码确认开发者门户登记、功能批准和资产许可。
- **预期不变量**：公开发行应有适用政策审查与登记记录；不能将本地运行或用户授权开发等同于 Riot 批准。
- **影响范围 / 触发条件**：面向用户正式分发、启用自动接受、素材对外使用、红包功能的实际经营方式。
- **最小复现 / 核实状态**：代码和政策已查；门户、授权与实际资金用途无法核实。没有依据直接认定自动接受违法、作弊或红包功能必然属于赌博。
- **建议修复**：在 `docs/` 建立产品登记、LCU 端点用途、写操作批准范围、素材来源/许可及红包功能用途记录；由产品/合规负责人核实，并按结果决定是否收缩功能。不得为了通过审查虚构批准。
- **验收测试**：负责人提供可追溯登记/审查材料及资产清单；批准范围与实际 UI、默认值及接口匹配；Windows 验证只执行预定端点。法律/政策结论需有权人员确认。
- **信心 / 剩余未知**：高（材料不可证实）；适用性与批准结论未知。

### F-010｜免责声明仅在 README，客户端缺少可见入口

- **类别 / 严重度 / 条目**：GAP / S2 / GOV-01；属于正式上线要求。
- **证据等级**：E2/E3。
- **代码定位**：`README.md:39`；`src/features/settings/SettingsPage.vue:71`；UI/i18n 文本检索。
- **外部依据**：Riot General Policies 关于可见免责声明的要求，访问日期 2026-11-07。
- **当前行为**：README 包含 Riot 免责声明；客户端设置和其他 UI 未提供对应内容。未连接用户也应能够找到必要的产品法律说明。
- **预期不变量**：用户无需访问源码仓库即可在产品内查看免责声明与资产说明。
- **影响范围 / 触发条件**：安装使用、未连接客户端以及独立分发安装包场景。
- **最小复现**：静态检查 README、SettingsPage、应用壳和 i18n；Windows 导航可见性 `NOT_RUN`。此为实现差距，不代替法律违规认定。
- **建议修复**：在设置/关于中加入简洁入口与完整内容，同步 i18n；未连接页亦可访问；与 F-009 资产记录保持一致。
- **验收测试**：连接/未连接两种状态都可键盘到达；完整免责声明可读，链接目标受限；Windows 布局与无障碍实测 `NOT_RUN`。
- **信心 / 剩余未知**：高；最终文案和展示充分性需产品/合规确认。

## 9.4 按 PR 分组的修复计划

以下是建议计划，**本次审查没有执行修复或创建 PR**。测试名中未在 9.5 记录执行的均为待新增/待执行。

### PR-A｜P0：统一账号失效与可见数据清理（F-001）

- **目标**：消除跨账号可见结算与旧请求回填。
- **文件清单**：`src/composables/useMatchLifecycle.ts`；`src/stores/connection.ts`、`home.ts`、`history.ts`、`settlement.ts`；`HistoryPage.vue`、`MatchDetailPage.vue`；对应测试。
- **数据契约变化**：优先使用已有账号失效事件；明确统一 account epoch 语义，必要时同步 Rust DTO/TS guard，不以连接状态代替账号状态。
- **单元测试**：移植 F-001 失败用例；补 A→B、账号失效但传输连接、晚到请求、同局不同账号隔离。
- **Windows 实测**：真实登录/登出、同客户端切号、停留结算页切号；旧账号内容立即消失。
- **回滚方式**：回退本 PR 提交；不得回滚或删除用户规则记录；若恢复 S1 行为，停止候选发行。
- **DoD**：回归转绿、原有测试不退化，国服账号隔离报告通过，S1 关闭。

### PR-B｜P1：更新安装安全状态独立于连接状态（F-002）

- **目标**：短暂失联不能解除活动对局更新保护。
- **文件清单**：`src-tauri/src/lcu/gameflow.rs`；`src-tauri/src/commands/updates.rs`；必要的状态 DTO 与前端更新提示测试。
- **数据契约变化**：定义可信的 install-safety 状态及解除条件；前端仅显示原生判定结果，不自行绕过。
- **单元测试**：活动→断连、重连、确认结束、未知阶段、从未连接、旧事件竞争。
- **Windows 实测**：对局中断连尝试安装被拒绝；确认安全后正常更新。
- **回滚方式**：回退实现并临时阻止有风险的安装路径；不把旧版本保护缺陷当作可接受回退。
- **DoD**：F-002 回归转绿，安装安全条件和当次升级报告一致。

### PR-C｜P1：赛后未就绪与截图交付取消（F-003、F-004）

- **目标**：赛后数据可恢复，过期截图不交付。
- **文件清单**：`src-tauri/src/lcu/settlement.rs`；`src/shared/ipc/settlement-contract.ts`；结算类型/store；`MatchDetailPage.vue`；`src/services/image.service.ts` 及测试。
- **数据契约变化**：增加或统一 pending/缺失状态含义；保留完整整数伤害，不将未知写成 0；导出增加调用方有效性检查。
- **单元测试**：F-003/F-004；404/204、缺伤害→完整、有限重试、手动恢复、离页/切号/换局、剪贴板失败下载回退。
- **Windows 实测**：实际赛后延迟与截图导出，确认恢复、取消与正常路径。
- **回滚方式**：回退相关提交；必要时暂停有缺陷的导出入口；不修改磁盘既有规则。
- **DoD**：回归通过，无无限请求，无过期交付，完整与缺失状态均可解释。

### PR-D｜P1：格式门禁与发布验收闭环（F-006、F-008）

- **目标**：唯一版本/提交对应唯一工件，正式升级和数据恢复可验收。
- **文件清单**：审查标准 Markdown；`.github/workflows/windows-release.yml`；版本文件；`README.md`；发布/恢复文档；必要的 `commands/match_rules.rs` 损坏反馈及测试。
- **数据契约变化**：不无故迁移存储；如新增恢复错误码须同步 DTO/guard；明确旧记录读取兼容。
- **单元测试**：`pnpm check`；版本一致性、更新工件、损坏记录保护、旧格式兼容、不可覆盖写入。
- **Windows 实测**：当前候选安装、启动、正常托盘退出、升级、卸载/重装、多用户、备份恢复与 WebView2 依赖。
- **回滚方式**：发布前准备上一可用工件与校验值；记录降级限制；升级前备份应用自有不可恢复记录，不删除整目录。
- **DoD**：全部适用自动化通过，工件/签名/校验可溯源，Windows 报告和负责人齐全。

### PR-E｜P1：合规材料与产品内说明（F-009、F-010）

- **目标**：确认功能与资产范围，并在客户端提供可见说明。
- **文件清单**：`docs/` 合规与素材清单；`README.md`；`SettingsPage.vue`；未连接入口/应用壳；i18n；涉及范围收缩时的自动接受命令和设置。
- **数据契约变化**：通常无 IPC 变更；若政策核实要求禁用能力，前后端默认值、命令许可和提示必须一致。
- **单元测试**：法律入口可访问、链接白名单、默认自动接受关闭；按批准范围检查端点使用。
- **Windows 实测**：连接与未连接状态下说明可见、键盘可达，实际功能符合批准范围。
- **回滚方式**：不移除必要免责声明；未获确认的能力从发布范围撤回，并同步说明。
- **DoD**：产品/合规负责人提交可追溯核实记录并批准；不能以 AI 文本替代外部批准。

### PR-F｜P2：健康信息与分队截图语义（F-005、F-007）

- **目标**：健康信息真实，分享结果语义完整且保持简洁。
- **文件清单**：`src-tauri/src/commands/app.rs`；健康 DTO/guard/test；`TeamDrawer.vue`；i18n 与交互测试。
- **数据契约变化**：明确 simulated 定义，必要时拆分运行环境和数据源。
- **单元测试**：正式/演示健康语义；截图来源、时间、分队类型与本地建议标识。
- **Windows 实测**：实际健康命令、紧凑窗口和截图内容。
- **回滚方式**：按提交回退 UI/字段变化，保持契约同步；不影响抽签算法。
- **DoD**：诊断准确、导出说明完整、布局无回归。

## 9.5 测试执行记录

### 执行环境、证据与命令

所有本地时间为 **2026-11-07 +08:00**；日志根目录：`/private/tmp/aram-audit-20261107/logs/`。表中日志名相对该目录。完整 27 项命令记录、起止时间和退出码见 `execution-index.json`。主测试在工作区副本执行；四项回归测试和种子测试只加入临时副本。

| 命令 / 测试项                                                                                                                               | 环境                                  | 执行时间          | 退出码 | 结果              | 证据位置                              | 阻断原因 / 范围                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------- | ------ | ----------------- | ------------------------------------- | ------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                            | macOS arm64，临时副本及独立 store     | 14:03:40–14:03:45 | 0      | PASS              | `install-network.log`                 | 冻结锁文件安装成功                                      |
| `pnpm check`                                                                                                                                | 同上                                  | 14:04:39–14:04:45 | 1      | FAIL              | `fresh-check.log`                     | F-006，Prettier 文档格式                                |
| `pnpm test`                                                                                                                                 | 同上，项目既有测试                    | 14:04:45–14:04:55 | 0      | PASS              | `fresh-test.log`                      | 45 个测试文件，274 项测试；不包含随后新增的失败审查回归 |
| `pnpm typecheck`                                                                                                                            | 同上                                  | 14:04:55–14:05:03 | 0      | PASS              | `fresh-typecheck.log`                 | 类型检查通过                                            |
| `pnpm lint`                                                                                                                                 | 同上                                  | 14:05:03–14:05:05 | 0      | PASS              | `fresh-lint.log`                      | lint 通过                                               |
| `pnpm build`                                                                                                                                | 同上                                  | 14:05:05–14:05:10 | 0      | PASS              | `fresh-build.log`                     | 前端生产构建，不是 Windows 安装包                       |
| `pnpm audit`                                                                                                                                | 同上，网络可用                        | 14:03:45–14:03:46 | 0      | PASS              | `audit-network.log`                   | 当次未报告已知漏洞，不代表永久无漏洞                    |
| `pnpm audit --prod`                                                                                                                         | 同上，网络可用                        | 14:03:46          | 0      | PASS              | `audit-prod-network.log`              | 生产依赖当次扫描通过                                    |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`                                                                                 | macOS arm64，独立 Cargo/Rustup 环境   | 14:01:35–14:01:39 | 0      | PASS              | `rust-fmt.log`                        | Rust 格式通过                                           |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml`                                                                        | macOS arm64                           | 14:01:39–14:02:22 | 0      | PASS              | `rust-test.log`                       | 129 项；不是 Windows 原生测试                           |
| `cargo clippy --offline --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`                                         | macOS arm64                           | 14:02:22–14:02:46 | 0      | PASS              | `rust-clippy.log`                     | 可用 target 的检查通过                                  |
| `cargo xwin check --offline --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`                                  | macOS 交叉工具链                      | 14:06:11–14:06:28 | 0      | PASS              | `windows-cross-check-retry.log`       | Windows 目标编译检查，不运行 Windows 程序               |
| `pnpm exec vitest run src/features/match-detail/MatchDetailPage.interaction.test.ts -t audit_account_invalidation`                          | 临时副本，真实组件/生命周期，模拟 IPC | 14:10:04–14:10:06 | 1      | FAIL              | `account-invalidation-regression.log` | F-001                                                   |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml audit_active_match_disconnect_must_keep_install_blocked -- --nocapture` | 临时副本，实际状态机                  | 14:03:07–14:03:11 | 101    | FAIL              | `updater-disconnect-regression.log`   | F-002                                                   |
| `pnpm exec vitest run src/features/match-detail/MatchDetailPage.interaction.test.ts -t audit_missing_damage`                                | 临时副本，模拟延迟统计                | 14:05:09–14:05:11 | 1      | FAIL              | `settlement-pending-regression.log`   | F-003                                                   |
| `pnpm exec vitest run src/features/match-detail/MatchDetailPage.interaction.test.ts -t audit_settlement_export`                             | 临时副本，模拟 canvas/clipboard       | 14:07:44–14:07:45 | 1      | FAIL              | `settlement-export-regression.log`    | F-004，无真实剪贴板写入                                 |
| `pnpm exec vitest run src/features/tools/teamRandomizer.audit.test.ts`                                                                      | 临时副本                              | 14:08:54–14:08:55 | 0      | PASS              | `team-seeds.log`                      | 256 种种子 × 6/8/10 人 = 768 次不变量验证               |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc`                                                  | 当前 W 的 Windows 原生执行            | 未执行            | —      | NOT_RUN           | —                                     | macOS 不能运行目标 exe                                  |
| `cargo audit`                                                                                                                               | 当前 W                                | 未执行            | —      | NOT_RUN           | —                                     | 本次无执行结果                                          |
| 完整依赖许可证清单与批准                                                                                                                    | 当前 W                                | 未执行            | —      | NOT_RUN           | —                                     | 无完整核实报告                                          |
| 当前 W 的 NSIS 重建、发行签名与工件验证                                                                                                     | Windows / 当前候选                    | 未执行            | —      | NOT_RUN           | —                                     | 本次只读审查未构建发行包；既有工件不等于本次验证        |
| 当前 W 安装、正常退出、升级、卸载/重装、多用户、损坏恢复                                                                                    | Windows / 当前候选                    | 未执行            | —      | NOT_RUN           | —                                     | 缺当前版本真实运行环境和报告                            |
| 当前国服客户端接口与核心流程                                                                                                                | Windows / 国服 LCU                    | 未执行            | —      | NEEDS_WINDOWS_LCU | —                                     | 无真实客户端及版本记录                                  |
| 完整读屏、低动态偏好与原生截图人工验收                                                                                                      | WebView2                              | 未执行            | —      | NOT_RUN           | —                                     | 已有部分键盘/定时器测试不能代替完整验收                 |

执行异常另行保留，不误归类为产品 BUG：初次安装存在非交互环境限制；初次 audit 因网络失败；首次 Windows 交叉检查因工具路径缺少 `llvm-lib` 失败，修正环境后通过。曾误用 `node --test scripts/updater-artifacts.test.mjs`，该文件属于 Vitest，退出 1 是运行器错误；其正确运行结果已包含在 `pnpm test` 中。默认 Rustup 路径写权限问题通过独立临时工具环境解决。详细过程见完整命令索引及对应日志。

### 补充检查证据

- 关键字扫描记录在 `keyword-scan.json`：TODO/FIXME 0；unwrap/expect/panic 219（多为测试）；TLS 例外 2（本地 HTTP/WS）；Math.random 3（旧测试/演示辅助，正式分队使用安全随机）；setInterval 3；localStorage 15；remove 命中 1（测试清理）；invoke 90；身份/模式类命中 286。**命中数量不等于漏洞数量**。
- 原有随机测试包含 36,000 次抽样的队友频率检查，阈值 0.03，使用固定伪随机序列；新增 768 次验证用于人数守恒、无重复及均分，不宣称证明绝对公平。
- 三个 Vue 审查用例补丁：`settlement-audit-tests.patch`；Rust 安装保护用例：`updater-disconnect-test.rs`。均为临时证据，不是项目修改。
- 元数据核对：`ddragon.json`；读取时间约 14:05:17，版本 `16.22.1`。
- 原工作区不变核验：`readonly-verification.json`。

### GitHub CI 与已发布工件：仅属于 HEAD

本次重新读取 GitHub 记录，不继承“以前成功”的口头结论，但这些记录仍只证明对应 SHA 的旧代码：

- [Windows 工作流 42309758266](https://github.com/UoMiss/aram-mayhem/actions/runs/42309758266)：对应 HEAD `a20e02f…`，workflow_dispatch，success；创建时间 `2026-11-06T23:07:52Z`。
- [Push 校验 42309729301](https://github.com/UoMiss/aram-mayhem/actions/runs/42309729301)：同一 HEAD，success。
- 该 HEAD 日志中的前端为 **38 个文件 / 180 项测试**，Rust 为 **88 项测试**，并有 NSIS 静默安装和约 8 秒启动冒烟。不得替代 W 的 274/129 项测试或正常退出/升级验收。
- [v0.1.1 Release](https://github.com/UoMiss/aram-mayhem/releases/tag/v0.1.1)：发布时间 `2026-11-06T23:27:52Z`；只有安装 EXE 和 `windows-installer.sha256` 两个资产。
- EXE 大小 16,542,231 字节；GitHub 返回 SHA-256 为 `56aa3882c3b47a7a5b0f54bb1c3bbcbf992d00d517191ff857eff9c1ea30941d`。
- 未将该 Release 缺少新 Updater 资产判为旧版发布 BUG；准确结论是：它不能证明 W 中新 Updater 已经发行。
- 证据：`github-head-jobs.json`、`github-head-windows.log`、`github-release.json`。未触发任何新工作流或上传资产。

### 强制业务验收：模拟与真实证据分列

| 用例                              | 本地结果 | 实际依据 / 局限                                         | Windows / 国服结果                |
| --------------------------------- | -------- | ------------------------------------------------------- | --------------------------------- |
| T-01 自定义 6 人 3v3              | PASS     | 完整性、人数、均分、唯一性测试                          | NEEDS_WINDOWS_LCU                 |
| T-02 自定义 8 人 4v4              | PASS     | 同上                                                    | NEEDS_WINDOWS_LCU                 |
| T-03 自定义 10 人 5v5             | PASS     | 同上                                                    | NEEDS_WINDOWS_LCU                 |
| T-04 非法人数禁止正式抽签         | PASS     | 边界人数拒绝逻辑与测试                                  | NEEDS_WINDOWS_LCU                 |
| T-05 10 槽位仅识别 8 ID           | PASS     | 完整性不足拒绝，不能降格冒充完整 4v4                    | NEEDS_WINDOWS_LCU                 |
| T-06 机器人/观战者/重复/空槽      | PASS     | 身份合并及失败关闭测试                                  | NEEDS_WINDOWS_LCU                 |
| T-07 选人/普通队伍不冒充正式分队  | PASS     | source/custom/阶段限制                                  | NEEDS_WINDOWS_LCU                 |
| T-08 玩家、房间、账号、断线变化   | PASS     | 工具自身失效与导出复核；不代表结算账号失效通过          | NEEDS_WINDOWS_LCU                 |
| T-09 仅昵称变化                   | PASS     | ID 指纹稳定，显示补全不重抽                             | NEEDS_WINDOWS_LCU                 |
| T-10 连点、关闭、卸载、低动态偏好 | PARTIAL  | 防重复及定时器测试有证据；完整低动态/无障碍人工验收未做 | NOT_RUN                           |
| T-11 100+ 种子及边界              | PASS     | 新增 256 种子 × 3 种人数，768 次；统计局限已说明        | NEEDS_WINDOWS_LCU（真实名单链路） |
| L-01 未安装/启动/登录             | PARTIAL  | 源码与模拟错误态；健康字段有 F-005                      | NEEDS_WINDOWS_LCU                 |
| L-02 生命周期与重复事件           | PASS     | 原生状态机与上下文测试                                  | NEEDS_WINDOWS_LCU                 |
| L-03 断线、重启、切号             | FAIL     | F-001 已显示结算残留                                    | NEEDS_WINDOWS_LCU                 |
| L-04 未知队列/模式/地图           | PASS     | 未知值及可信元数据回退测试                              | NEEDS_WINDOWS_LCU                 |
| L-05 404/204/超时/未授权/变形     | PARTIAL  | 基础分类有测试；详情未就绪路径 F-003 不完整             | NEEDS_WINDOWS_LCU                 |
| L-06 当前国服客户端               | NOT_RUN  | 无客户端版本、字段采样与录像                            | NEEDS_WINDOWS_LCU                 |
| S-01 三种排序与并列               | PASS     | 精确整数、尾数/距离、同分与红包边界测试                 | NEEDS_WINDOWS_LCU（实际字段输入） |
| S-02 赛后未就绪                   | FAIL     | F-003 missing_damage 不恢复                             | NEEDS_WINDOWS_LCU                 |
| S-03 重复打开与应用重启           | PARTIAL  | 持久记录重复读取与不可覆盖有测试；未做真实进程重启验收  | NOT_RUN（真实重启）               |
| S-04 错误 gameId/换账号/恶意 IPC  | FAIL     | 输入校验有测试，但账号隔离 F-001 失败                   | NEEDS_WINDOWS_LCU                 |
| S-05 Windows 多用户/升级/重装     | NOT_RUN  | 无当次候选验收记录                                      | NOT_RUN                           |
| S-06 缓存管理                     | N/A      | 没有该功能，无清理动作可验收                            | N/A                               |
| S-07 当前 NSIS/首次运行/托盘退出  | NOT_RUN  | 旧 HEAD 冒烟另列，不能替代 W                            | NOT_RUN                           |

### 官方资料与适用边界

以下资料在审查时访问，日期均为 **2026-11-07**。政策证据证明要求存在，不能证明本产品已获批准。

| 资料                                                                                            | 版本 / 日期              | 本次用途与限制                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| [ISO/IEC 25010](https://www.iso.org/standard/78176.html)                                        | 2023 / 第 2 版           | 产品质量模型参考，仅核对官方元信息，不宣称认证                                  |
| [OWASP ASVS](https://asvs.owasp.org/)                                                           | 5.0.0，2025-05-30        | 适用的安全控制参考，不宣称完整 ASVS 验证                                        |
| [Tauri Capabilities](https://tauri.app/security/capabilities/)                                  | Tauri 2 文档             | 最小窗口/命令权限审查依据                                                       |
| [Tauri WebView API](https://tauri.app/reference/javascript/api/namespacewebview/)               | 当前在线文档             | clearAllBrowsingData 包含 localStorage 等，不应视为安全缓存清理；本项目无该功能 |
| [Riot League Client API](https://developer.riotgames.com/docs/lol#league-client-api)            | 当前在线文档             | 本地 LCU 不受第三方支持，不保证文档、可用性和变更通知；需遵守登记要求           |
| [Riot General Policies](https://developer.riotgames.com/policies/general)                       | 页面标注 2025-05-29 更新 | 产品登记、可见免责声明、素材/游戏完整性及赌博限制；实际适用由负责人核实         |
| [Riot 第三方应用说明](https://support.riotgames.com/en-us/riot/events/third-party-applications) | 页面日期 2025-02-10      | 游戏完整性和代替玩家操作的限制；不能凭代码直接替代产品审查决定                  |
| [Microsoft WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/)                | 当前在线文档             | Windows 运行时验证参考；没有因此推定实际机器版本                                |

## 9.6 风险接受与上线签署

### 七项发布门禁

| 门禁                             | 状态              | 结论与阻断项                                           |
| -------------------------------- | ----------------- | ------------------------------------------------------ |
| 1. SHA、版本与工件可溯源         | PARTIAL           | 已锁定 W，但 W 不是唯一已提交发行版本；F-008           |
| 2. 无 S0/S1；S2 有书面接受       | FAIL              | F-001 / S1 未关闭；S2 未提供负责人、期限和签字         |
| 3. 核心流程有实际范围内证据      | FAIL              | 账号隔离与赛后恢复失败，真实国服证据不足               |
| 4. 自动化及当次 Windows 路径通过 | FAIL              | F-006；审查回归失败；当前 Windows 安装/升级/退出未验收 |
| 5. 当前国服核心实测通过          | NEEDS_WINDOWS_LCU | 无当前客户端版本、机器信息、流程录像与日志             |
| 6. 关键登记、免责声明与资产核实  | PARTIAL           | F-009/F-010；不能默认批准                              |
| 7. 备份、回滚与不可恢复记录保护  | PARTIAL           | 原子不可覆盖写入有证据；升级/损坏恢复验收未闭合，F-008 |

**最终判定：NO_GO。** 已确认 S1 与关键失败足以阻断发布，因此不采用仅表示缺少证据的 `INSUFFICIENT_EVIDENCE` 作为最终判定。即使修复已确认 BUG，仍不能跳过国服核心实测和关键合规核实。`CONDITIONAL_GO` 不能用于绕过这些门禁。

### 残余风险接受状态

| 问题                            | 当前接受状态           | 可接受条件                                                               |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| F-001 / S1                      | 不可接受为正式放行条件 | 修复并复测关闭                                                           |
| F-002、F-003、F-004、F-006 / S2 | 未提供书面接受         | 优先修复；如拟延期，须证明不损害核心门禁并明确负责人、期限、回退触发条件 |
| F-008 / S2                      | 发布证据尚未补齐       | 完成当前候选溯源、Windows 及恢复验收                                     |
| F-009 / S2                      | 外部状态待核实         | 关键合规核实不能由一般风险接受替代                                       |
| F-010 / S2                      | 未提供书面接受         | 产品内补说明并由产品/合规确认                                            |
| F-005、F-007 / S3               | 可评估延期，尚未签署   | 明确责任人及计划，且不影响其他门禁                                       |

| 角色       | 审查人 | 日期   | 签名/批准 | 备注                                       |
| ---------- | ------ | ------ | --------- | ------------------------------------------ |
| 代码审查   | 待填写 | 待填写 | 待填写    | AI 报告提供证据，不代替有权人员签署        |
| 测试负责人 | 待填写 | 待填写 | 待填写    | 需关联当前候选的自动化、Windows 与国服报告 |
| 合规/产品  | 待填写 | 待填写 | 待填写    | 需登记、功能与资产材料                     |
| 发布负责人 | 待填写 | 待填写 | 待填写    | 门禁关闭后决定发行                         |

## 9.7 证据不足和下一步

### 待补证据与责任角色

| 状态                  | 缺失内容                                                | 由谁补充                            | 最低交付物                                                                            |
| --------------------- | ------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| NEEDS_WINDOWS_LCU     | 当前国服发现、授权、账号、完整生命周期与未知字段        | Windows/LCU 测试负责人              | Windows、WebView2、LOL 版本；匿名账号标识；接口与脱敏字段样本；步骤、时间、结果与录像 |
| NEEDS_WINDOWS_LCU     | 自定义 3v3/4v4/5v5、成员变化、机器人/观战者与不完整名单 | Windows/LCU 测试负责人              | T-01 至 T-09、T-11 的真实名单与分队证据，不以模拟代替                                 |
| NEEDS_WINDOWS_LCU     | 结算、好友集合、赛后延迟、规则锁定、切号与导出          | Windows/LCU 测试负责人              | 修复后的 L-03、L-05、S-01 至 S-04 关键流程记录                                        |
| NOT_RUN               | 当前 W 的 Windows 原生 Rust 测试与完整安装包验证        | 构建/测试负责人                     | 唯一 SHA/版本的 CI 日志与工件校验                                                     |
| NOT_RUN               | 安装、正常托盘退出、在线升级、卸载/重装、WebView2 依赖  | Windows 发布测试负责人              | 当次候选安装包全流程验收报告及失败回退证据                                            |
| NOT_RUN               | 多 Windows 用户、实际进程重启、断电/损坏、旧记录恢复    | 存储模块负责人及 Windows 测试负责人 | 备份范围、恢复步骤、旧规则/幸运数字不被覆盖的故障注入结果                             |
| NOT_RUN               | cargo audit 和完整依赖许可证审查                        | 安全/构建负责人                     | 锁文件对应扫描输出、许可证清单、异常项处理记录                                        |
| NOT_RUN               | 完整读屏、减少动画、截图、免责声明入口人工验收          | 前端/无障碍测试负责人               | 键盘、读屏、低动态及 WebView2 实测记录                                                |
| COMPLIANCE_UNVERIFIED | 产品登记、自动接受适用性、素材许可及红包实际用途        | 产品/合规负责人                     | 可追溯登记与批准材料、素材来源及许可、功能边界决策                                    |
| NOT_RUN               | 修复后的回归与完整复验                                  | 各修复 PR 负责人、独立复验人        | 对应问题关闭证据及更新后的门禁表；本报告不能自行转为 PASS                             |

### 最小下一步

1. 先按 PR-A 修复 **F-001**，将临时失败用例转成项目回归，完成账号隔离复验。
2. 修复 **F-002/F-003/F-004** 和格式门禁；合规核实与 Windows 测试准备可同步推进。
3. 冻结新的唯一 SHA/版本，完整运行自动化并构建可溯源的 Windows 候选，补齐升级、备份与恢复说明。
4. 在真实国服客户端完成关键流程，取得产品/合规材料，按七项门禁重新判定并由负责人签署。

**本报告不授权自动修复、提交、发布或对游戏客户端进行写操作；这些动作需要后续任务明确范围。本次报告归档不改变 NO_GO 结论。**
