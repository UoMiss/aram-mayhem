# ARAM Mayhem｜好友自定义房间随机组队优化实施方案

> **文档版本**：v1.1  
> **编制日期**：2026-11-07  
> **适用仓库**：[UoMiss/aram-mayhem](https://github.com/UoMiss/aram-mayhem)（`main` 分支，基于源码静态审查）  
> **适用场景**：英雄联盟好友自定义房间，3v3 / 4v4 / 5v5。  
> **实施状态**：本地实现及自动化验证已完成；国服 Windows 客户端实测仍待验收。

## 本次落地说明（2026-11-07）

- 正式入口严格限制为自定义房间、完整名单、6/8/10 位参与者；普通组队与选人名单仅可查看，浏览器演示独立标注。关闭抽屉即清空结果。
- 新增 `completeness`、`evidence`、`issue`、`unresolvedCount`、`eligibleCount` 及 `context` 契约。缺失字段、非法枚举、重复 ID、计数不一致或完整名单缺少上下文时，IPC 校验拒绝。
- 两支参赛队伍必须完整可读；身份记录中的有效 PUUID 与正数 summonerId 仅通过明确同条记录建立别名。真人资格需有同一身份的 `isBot: false` 证据；机器人和观战者明确排除。缺少证据、队伍重复槽位或成员信息冲突均不放行；只有 members 时维持待确认。
- 名单查询结束再次读取房间及成员集合，并复核账号和客户端实例。原生 Gameflow 在同一个锁内提供快照及其账号归属，命令前后核对账号、会话、连接世代和房间标识；缺少可绑定的房间上下文不会获得抽签资格。Gameflow 账号归属仅保存在原生内存，不进入 Gameflow IPC 或日志。
- 房间标识统一读取有效 `lobbyId`，缺失时读取客户端给出的 `multiUserChatId` / `partyId`，同时绑定原生会话和连接世代。无法观测到的房间生命周期变化不能由软件绝对证明；本实现保证拒绝已检测到的变化及缺失证据，不承诺与远端客户端形成原子事务。
- 抽签使用系统加密随机源和拒绝采样，失败时不回退 `Math.random`。最终分组只计算一次，3 秒动画仅控制展示。同名玩家依 ID 区分，昵称补全按冻结 ID 更新显示。仅红蓝换边保留建议；参赛成员或资格变化使结果失效。
- 复制前重新读取名单，图片生成后、写剪贴板前以及降级下载前再次验证。失效时阻止后续交付；已经完成的系统剪贴板操作无法撤销。复用截图服务增加可选交付校验，不改变结算截图的默认行为。
- 按后续界面要求，标题改为「自定义随机分队」，移除重复说明及确认文案；人数合并为「参与玩家 · N 人」，结果顶部显示「游戏类型 · NvN · 地图」，两侧标注「蓝色方 / 红色方」。随机时间保持原格式，按钮统一为「开始分队 / 重新分队」。结果仍仅在应用内生成，不会写入客户端队伍；截图不含内部身份或账号标识。
- 回归覆盖名单漏识别、角色冲突、身份别名、换房、账号与世代绑定、名称更新、关闭重开、迟到响应、截图交付失效和固定种子概率测试。浏览器使用模拟 IPC，不能代替下文的 Windows 国服房间验收。

以下保留原始设计和实机验收清单；第 3 节描述的是改造前实现。

## 1. 执行摘要

**建议保留现有架构，定向加强名单可信度、严格均分及结果生命周期。** 现有 Fisher–Yates 洗牌、抽签前刷新、账号校验、机器人/观战者过滤、重连与竞态防护是良好的基础，无须引入段位配平、复杂算法或写入客户端队伍的能力。

正式抽签仅适用于：**自定义房间 + 已确认完整的真人参与名单 + 恰好 6、8 或 10 名有效玩家**。产生的结果是应用内**分队建议**，不是客户端实际红蓝阵营变化。

| 优先级 | 改造项                              | 业务收益                                     |
| ------ | ----------------------------------- | -------------------------------------------- |
| P0     | 严格限定 6 / 8 / 10 人、仅 `custom` | 不再产生 2v3、4v5 等不符合目标玩法的正式结果 |
| P0     | 名单完整性、身份/房间校验           | 防止“只识别到 8 人的 10 人房间”被误判为 4v4  |
| P0     | 抽签前二次校验与失效机制            | 防止房间换人后继续传播过期分组               |
| P1     | 一次确定最终结果；动画仅为展示      | 简化状态机、便于复现和检查                   |
| P1     | 文案改为“建议蓝队 / 建议红队”       | 避免误认为已修改官方客户端队伍               |
| P2     | 昵称变更不重抽、关闭抽屉策略统一    | 降低无谓重抽、改善使用体验                   |

## 2. 范围、目标及非目标

### 2.1 功能范围

|         可参与人数 | 正式玩法 | 组队结果             | 判定       |
| -----------------: | -------- | -------------------- | ---------- |
|                  6 | 3v3      | A 组 3 人、B 组 3 人 | 允许       |
|                  8 | 4v4      | A 组 4 人、B 组 4 人 | 允许       |
|                 10 | 5v5      | A 组 5 人、B 组 5 人 | 允许       |
| 其他人数（含奇数） | 不支持   | 不产生正式结果       | 禁止并提示 |

**必要前提**：已连接真实 LCU；处于自定义房间；名单来源可确认；所有计入抽签的玩家具有稳定、唯一的身份标识；不存在尚未核实的参赛槽位。浏览器 Mock 仅用于演示与测试，不能标注为真实房间数据。

### 2.2 非目标

- 不自动调整英雄联盟客户端房间内的蓝队、红队；不通过 LCU 发起改变队伍的请求。
- 不在普通匹配、好友组队大厅或选英雄阶段生成“正式自定义房间”分队结果。
- 不按段位、隐藏分、历史战绩或英雄熟练度做所谓“平衡分队”；此功能保持**纯随机**。
- 不反查选英雄阶段刻意隐藏的玩家身份；不将未知槽位猜作具体玩家。
- 不保证客户端内部 LCU 接口跨版本不变。国服实机响应需要额外验证。

## 3. 当前实现与审查结果

### 3.1 核心文件

| 文件                                                                                                                  | 当前职责                                        | 审查结论                                               |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| [`teamRandomizer.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/teamRandomizer.ts)           | Fisher–Yates 洗牌、`splitTeams`、北京时间格式化 | 算法正确；目前允许任意人数且奇数时 A 组多 1 人         |
| [`useTeamShuffle.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/useTeamShuffle.ts)           | 3 秒动画、50ms 重新洗牌、计时与重置             | 已冻结抽签名单；建议只计算一次真实结果                 |
| [`useTeamParticipants.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/useTeamParticipants.ts) | 打开抽屉时读取名册、每 5 秒刷新、指纹比对       | 基础竞态处理合理；指纹含昵称，易触发不必要重置         |
| [`TeamDrawer.vue`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/components/TeamDrawer.vue)      | 抽签前刷新、启用条件、结果展示与截图            | 仅要求至少 2 人，并允许 `party`/`champ_select`；需收紧 |
| [`participants.rs`](https://github.com/UoMiss/aram-mayhem/blob/main/src-tauri/src/lcu/participants.rs)                | 自定义房间/组队/选人名单收集，身份校验          | 已过滤明确标记的机器人、观战者并去重；需证明名单完整   |
| `participants.ts`、`participants-contract.ts`                                                                         | Rust/TypeScript 的名单契约                      | 应增加完整性与来源标记，并同步校验                     |
| `zh-CN.ts`                                                                                                            | 抽签说明与结果名称                              | “A组（蓝队）”容易暗示官方队伍已经变更                  |

### 3.2 已有合理保护：应原样保留

1. `shufflePlayers()` 使用 Fisher–Yates；复制输入数组后操作，不改变原始名单。
2. `splitTeams()` 对偶数人数可以严格均分，玩家不会自然丢失或重复。
3. `TeamDrawer.startRandomize()` 在真正开始前调用 `roster.refresh()`，并比较抽签前后的指纹。
4. Rust `load_participants()` 查询前后均核验账号身份；`collect_players()` 根据身份 ID 去重。
5. 选英雄阶段不主动补全隐藏姓名；真实运行时不会用浏览器模拟玩家替代 LCU 数据。
6. 测试已覆盖 8 人、10 人、奇数、定时器清理、名单变化、断线及关闭后迟到响应。

### 3.3 需要修正的边界

**边界 A：`players.length >= 2` 过宽。** 对正式 3v3/4v4/5v5，应只允许 6、8、10 人。

**边界 B：识别人数不等于房间有效人数。** `participants.rs` 在部分字段不可用时可能跳过玩家；如果实际 10 人但仅识别 8 个稳定 ID，仅看数组长度会误判为可抽 4v4。

**边界 C：候选名单来源过宽。** 现有 `TeamDrawer.vue` 允许 `custom`、`party`、`champ_select`，但后二者不是本需求的正式自定义房间。

**边界 D：动画每 50ms 更新真实分组。** 无需多次采样随机结果，且不利于复现。应一次确定最终结果，动画与业务结果解耦。

**边界 E：名称变化影响身份指纹。** `useTeamParticipants.ts` 的指纹包括完整 `{id,name}`，昵称由未知变为已知也会触发结果清除。

**边界 F：关闭抽屉的行为需定义。** 当前注释称抽屉关闭不销毁洗牌状态，但成员采集的 `active` 关闭会清空 `fingerprint`，导致结果可能被观察器重置。最终行为应以明确的产品规则为准。

## 4. 目标业务规则（不可违反的约束）

**R-01**：仅当 `status === 'custom'` 且有效真人数量属于 `{6,8,10}` 时允许正式抽签。

**R-02**：`rosterCompleteness === 'complete'` 是抽签前置条件；`partial`、`unknown` 均禁止正式抽签。

**R-03**：有效玩家必须拥有非空且唯一的规范化身份 `id`；姓名允许暂不可用，但 UI 必须明确标注“名称暂不可用”，不能把占位名视为玩家身份。

**R-04**：机器人、观战者和空槽位不得计入真人参赛人数。对于角色身份无法判断的槽位应保留不确定状态，而不是默认为真人或直接忽略。

**R-05**：抽签结果必须完整覆盖冻结名单、无重复、人数严格相等；不支持人数时抛出业务错误并禁止界面输出结果。

**R-06**：每次正式抽签需在动作开始前重新读取有效名单，并核验 `accountKey`、房间身份、完整性和参与者身份集合。数据变化则要求用户重新确认，而不是继续抽签。

**R-07**：抽签只生成**建议 A/B 分组**；不自动修改官方客户端房间分队，不声称已生效。

**R-08**：房间变更、账号变更、LCU 断开、参与者集合变更或完整性下降时，已有结果必须失效；单纯姓名从未知变为已知不得改变成员归属。

**R-09**：游戏客户端数据不可用时不回退到浏览器 Mock 生成“真实分组”。

## 5. 目标数据模型与采集契约

建议对现有 `ParticipantSnapshot` **增加字段而非直接替换原类型**，确保其他调用方可以渐进升级：

```ts
// src/types/participants.ts
export type RosterCompleteness = 'complete' | 'partial' | 'unknown'
export type RosterEvidence = 'custom_teams' | 'members' | 'none'

export interface ParticipantSnapshot {
  accountKey: string
  lobbyKey: string | null
  status: 'custom' | 'party' | 'champ_select' | 'not_custom' | 'no_lobby'
  players: LobbyParticipant[]
  updatedAt: number
  completeness: RosterCompleteness
  evidence: RosterEvidence
  eligibleCount: number
}
```

### 5.1 名单完整性判定（保守策略）

- 先读取自定义房间中的 `gameConfig.isCustom`、`customTeam100`、`customTeam200`、`members` 及相关公开身份标志；实际字段的存在性须以国服 LCU 响应为准。
- 只使用明确属于两支参赛队伍的真人槽位。`isBot === true`、`isSpectator === true` 的成员排除。无法判定是否为参赛者时，**不要宣称名单完整**。
- 两支自定义队伍名单可读、每个参赛槽位都有稳定身份、没有未解析的候选成员，且房间其他可用成员数据不与之冲突时，才允许 `complete`。
- 自定义队伍结构缺失而只拿到 `members` 时，默认 `unknown`。除非国服实机验证能够证明该结构涵盖全部有效参赛者，否则不能仅凭“识别出 6/8/10 人”升级成 `complete`。
- 返回真实姓名的失败不必影响完整性：如果身份 ID 已知且经确认属于参赛者，`name = null` 是**显示信息缺失**而不是人数不完整。
- `eligibleCount` 必须等于最终 `players.length`，但这只是必要条件，**不是充分条件**。

> **务实提醒**：LCU 未必提供一个可信的“全部参赛真人已齐”布尔值。若无法从实际响应严格证明完整性，宁可停用正式抽签并提示“名单待确认”，不要静默放行。可在后续版本加入由房主手动核对的显式确认流程，但不能把手动确认伪装为官方数据已验证。

### 5.2 规范化身份与房间绑定

- `id` 优先使用有效 PUUID；老数据使用 `summoner-{id}` 时，应避免同一玩家因 ID 形式不同被计算两次。只有在来源明确对应同一身份时合并，不能按昵称合并。
- 房间身份使用 `accountKey + lobbyKey + sessionKey（可用时）` 的组合，必要时还应将连接世代加入上下文，防止相同好友新建房间继承旧结果。
- 当 `lobbyKey` 缺失或不可靠时，不能仅以相同玩家 ID 集合认定是同一房间。
- Rust 的契约变更必须同步 `src/shared/ipc/participants-contract.ts`，拒绝非法枚举、重复 ID、超限数组及不一致计数。

## 6. 分阶段文件级实施方案

### PR-01｜严格限定人数与房间类型（P0）

**目标**：保证正式结果只可能为 3v3、4v4、5v5。

涉及：`src/features/tools/teamRandomizer.ts`、`src/features/tools/components/TeamDrawer.vue`、`src/features/tools/teamRandomizer.test.ts`、`src/i18n/locales/zh-CN.ts`。

1. 新增 `SUPPORTED_TEAM_COUNTS = [6,8,10] as const` 及 `isSupportedTeamCount()` 纯函数。
2. 在核心 `splitCustomTeams()` 中再次验证人数、唯一玩家 ID，不能只在按钮 `disabled` 层做校验。
3. `TeamDrawer.canStart` 改为 `status === 'custom'`、人数合法、名单完整、无异常、真实客户端连接、非抽签/截图状态；保留单独的浏览器演示分支。
4. 更新人数不足/过多/非法/名单待确认的中文提示，明确“仅支持 3v3、4v4、5v5”。
5. 现有 `splitTeams()` 如果仍用于 Mock 或基础算法测试，可以保留为通用纯函数；正式业务入口只使用严格验证版本。

```ts
// src/features/tools/teamRandomizer.ts（建议新增正式业务入口）
export const SUPPORTED_TEAM_COUNTS = [6, 8, 10] as const

export function isSupportedTeamCount(n: number): boolean {
  return SUPPORTED_TEAM_COUNTS.includes(n as 6 | 8 | 10)
}

export function splitCustomTeams(
  players: readonly TeamPlayer[],
  random: () => number = Math.random,
): TeamSplit {
  if (!isSupportedTeamCount(players.length)) {
    throw new Error('unsupported_team_size')
  }
  if (players.some((p) => !p.id || !p.id.trim())) {
    throw new Error('invalid_player_id')
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('duplicate_player_id')
  }
  const shuffled = shufflePlayers(players, random)
  const half = shuffled.length / 2
  return { groupA: shuffled.slice(0, half), groupB: shuffled.slice(half) }
}
```

**完成条件**：在业务入口中，6→3+3，8→4+4，10→5+5；其他人数不返回分组。现有浏览器演示须同步适配新的正式入口或明确保留通用演示行为。

### PR-02｜名单完整性与数据契约（P0）

涉及：`src-tauri/src/lcu/participants.rs`、`participants.ts`、`participants-contract.ts`、`tests/fixtures/participants-contract.ts`、`src/features/tools/useTeamParticipants.ts`。

1. Rust 返回 `completeness`、`evidence`、`eligibleCount`，并明确 `complete` 的证据要求。
2. 修改 `parse_participants()` / `collect_players()`：在过滤已知机器人与观战者时同时跟踪未知/无稳定 ID 的**潜在参赛槽位**，不能简单跳过后仍声称完整。
3. 在普通 `party` 和 `champ_select` 状态固定不允许正式抽签；它们可保留为只读预览资料。
4. 在前端 IPC 校验中验证枚举、`eligibleCount === players.length`、ID 唯一及状态语义。
5. 采集失败、账号变化、客户端断线时清空可用于正式抽签的有效资格。
6. 保留原有 LCU 请求前后游戏阶段/账号检查，不增加隐藏身份探测。

**完成条件**：实际 10 人、只识别到 8 个有效 ID 时，`completeness !== 'complete'`，正式抽签按钮禁用。

### PR-03｜抽签的原子性与结果失效（P0 / P1）

涉及：`src/features/tools/useTeamParticipants.ts`、`src/features/tools/useTeamShuffle.ts`、`src/features/tools/components/TeamDrawer.vue`、`src/types/tools.ts`。

建议统一一个**抽签上下文指纹**，仅包含：账号、房间/会话标识、完整性、稳定 ID 的有序集合；昵称作为另一份可更新的显示映射。

```ts
// 身份指纹：不包含玩家昵称
const identityFingerprint = JSON.stringify({
  accountKey: snapshot.accountKey,
  lobbyKey: snapshot.lobbyKey,
  sessionKey: currentSessionKey ?? null,
  completeness: snapshot.completeness,
  ids: [...snapshot.players].map((p) => p.id).sort(),
})
```

**正式抽签状态机**：

```text
idle
  ↓ 点击开始
preflight（重新读取当前自定义房间、完整性与身份指纹）
  ├─ 不合法／变化 → blocked（显示原因，不保留旧结果）
  └─ 合法且一致 → frozen（冻结玩家 ID + 立即计算最终分组）
                         ↓
                      animating（仅视觉动画）
                         ↓
                      ready（展示最终建议）
  任一状态发现房间、账号、ID 集合变化或断线 → invalidated
```

实施要点：

- 继续保留现有 `startGeneration` / `copyGeneration` 和对迟到请求的忽略机制。
- `preflight` 开始后，再次确认抽屉仍打开、连接仍有效、当前房间上下文未变化。
- 抽签结果在动画前**仅计算一次**；50ms 定时器不得覆盖固定结果。动画显示内容应被明确视为临时预览。
- `ready` 状态复制截图前复核结果的有效性；名单失效时禁用复制。
- 仅昵称补全，不使 `ready` 状态失效；可按已冻结 ID 顺序更新名字。
- 对同房间关闭/重开抽屉，推荐**首版显式清除结果**，保持安全且实现简单。若以后决定保留，必须在重开时完成同样的前置核验；同时修正现有注释与实际行为不一致的问题。

**完成条件**：任一房间身份或参与者集合变化时旧结果不能显示为有效，更不能复制成正式分组图片。

### PR-04｜文案、截图与用户体验（P1）

涉及：`src/features/tools/components/TeamDrawer.vue`、`src/i18n/locales/zh-CN.ts`、现有截图服务及交互测试。

- 标题：`自定义房间随机分队`。
- 组名：`A 组（建议蓝队）`、`B 组（建议红队）`。
- 说明：`仅生成分队建议，不会自动更改英雄联盟客户端的队伍。`。
- 成功结果：显示 `3v3 / 4v4 / 5v5`、参与总人数、北京时间和“名单已确认”状态；不在截图内暴露 PUUID、账号密钥或 LCU 凭证。
- 错误提示明确区分：非自定义房间、人数不满足、名单不完整、房间变化、连接断开、读取失败。
- 当名单无法确认完整时，清晰展示“仅已识别玩家 N 人”而不是“房间共有 N 人”。
- `canCopy` 同时检查 `hasResult` 与结果当前有效性，保持按钮状态与点击行为一致。

### PR-05｜回归测试与 Windows 国服联调（P0）

涉及：既有 Vitest / Rust 测试及 `tests/fixtures/participants-contract.ts`。不建议第一版引入外部测试平台。

执行顺序：静态类型/格式/构建检查 → 纯函数测试 → Rust 名册解析测试 → Vue 交互及竞态测试 → 国服真实自定义房间手工验收。

## 7. 测试方案

### 7.1 纯函数测试：`teamRandomizer.test.ts`

| 编号 | 输入 / 操作                    | 预期                         |
| ---- | ------------------------------ | ---------------------------- |
| A-01 | 6 名不同 ID 玩家               | 3+3，恰好覆盖全部 6 人       |
| A-02 | 8 名不同 ID 玩家               | 4+4，恰好覆盖全部 8 人       |
| A-03 | 10 名不同 ID 玩家              | 5+5，恰好覆盖全部 10 人      |
| A-04 | 0、1、2、4、5、7、9、11、12 人 | 正式入口拒绝，不产出结果     |
| A-05 | ID 重复 / ID 为空              | 正式入口拒绝                 |
| A-06 | 连续不同随机种子               | 人数守恒、无重复、分配有变化 |
| A-07 | 同一种子及名单                 | 可复现，输入数组不变         |

**公平性验证**：对于 6 人，验证一名指定玩家与其他指定玩家同队的经验频率接近 `(3-1)/(6-1)=2/5`；8 人为 `3/7`，10 人为 `4/9`。这是概率性质测试，应采用足够样本与宽容阈值，不把随机波动误判为失败。

### 7.2 Rust 名单测试：`participants.rs`

| 编号 | 输入 / 操作                             | 预期                                   |
| ---- | --------------------------------------- | -------------------------------------- |
| B-01 | 6、8、10 名真人，双方队伍数组完整       | `complete`，人数准确                   |
| B-02 | 10 名实际参赛者但 2 个潜在槽位 ID 缺失  | `partial` / `unknown`，禁止抽签        |
| B-03 | 混有机器人、观战者                      | 仅明确真人参赛者进入名单               |
| B-04 | 只有 `members`，缺少可靠队伍/完整性证据 | 不轻率标记为 `complete`                |
| B-05 | 同一玩家不同来源重复                    | 能确认相同身份时去重，不按同名强行合并 |
| B-06 | 空昵称但身份完整                        | 保留此玩家，`name = null`              |
| B-07 | 查询过程中账号改变或阶段切换            | 拒绝本次快照，不泄漏旧状态             |
| B-08 | 数据异常、超长、结构缺失                | 可控失败，不输出伪造人数               |

### 7.3 Vue 交互测试：`TeamDrawer.api.test.ts` 与 `useTeamShuffle.test.ts`

| 编号 | 场景                         | 预期                               |
| ---- | ---------------------------- | ---------------------------------- |
| C-01 | 有效 6/8/10 人自定义房间     | 允许点击并完成等量分组             |
| C-02 | 普通 `party`、`champ_select` | 禁止正式抽签                       |
| C-03 | `unknown` / `partial` 名单   | 禁止正式抽签，提示原因             |
| C-04 | 抽签前刷新发现玩家或房间变化 | 拒绝抽签并要求重新确认             |
| C-05 | 抽签过程中玩家集合变化       | 取消动画，旧结果失效               |
| C-06 | 只有玩家昵称更新             | 不重抽；已确定的分队成员 ID 不变   |
| C-07 | 同名单但新房间 / 新会话      | 旧结果失效                         |
| C-08 | 断线、关闭抽屉、迟到响应     | 不复活过期结果、定时器清理         |
| C-09 | 点击复制但结果无效           | 阻止截图导出                       |
| C-10 | 浏览器演示模式               | 明确 Mock 数据，不冒充客户端实名单 |

### 7.4 Windows 国服实机验收

- [ ] 创建 3v3（6 真人）自定义房间，实测分组为 3+3。
- [ ] 创建 4v4（8 真人）自定义房间，实测分组为 4+4。
- [ ] 创建 5v5（10 真人）自定义房间，实测分组为 5+5。
- [ ] 房间中混有机器人 / 观战者时，人数与可抽资格正确。
- [ ] 真人入房、离房及跨队移动时，名单和旧结果刷新/失效正确。
- [ ] 玩家昵称迟到或变化时，结果不会无故重抽。
- [ ] 同样好友解散并重建房间时，旧结果不会被误用。
- [ ] 客户端断开、重连及切换账号时，结果安全清理。
- [ ] 复制截图能体现“建议分队”，并且不包含密钥、PUUID 等内部字段。
- [ ] 本工具运行期间官方客户端队伍**没有**被应用自动修改。

> 实机测试时只记录**必要的脱敏结构**（字段存在与否、槽位数量、状态码），不要提交包含真实玩家身份或 LCU 认证信息的原始 JSON 到公开仓库。

## 8. 推荐提交顺序与验收门槛

| 顺序 | 分支 / 提交主题                | 合并前要求                                      |
| ---: | ------------------------------ | ----------------------------------------------- |
|    1 | `fix/team-custom-only`         | 6/8/10 人限制 + 自定义房间限制 + 算法测试       |
|    2 | `fix/team-roster-completeness` | Rust 完整性判断与 TS 契约一致；不完整名单不可抽 |
|    3 | `fix/team-draw-lifecycle`      | 抽签原子性、结果失效及竞态测试通过              |
|    4 | `fix/team-draw-copy`           | 文案、截图有效性与交互测试通过                  |
|    5 | `test/team-cn-lcu-regression`  | Windows 国服 3v3/4v4/5v5 实机验收记录           |

### 本地检查命令

```bash
pnpm install --frozen-lockfile
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

**发布完成定义（Definition of Done）**：

1. 正式抽签只支持已确认完整的自定义房间 6、8、10 位真人。
2. 每名参与者只出现一次，两组人数严格相等。
3. 相同房间仅因昵称改变时不改变已确认的分组结果。
4. 房间、账号、名单身份或完整性改变后，旧结果无法复制或误报有效。
5. UI 和截图明确标注“分队建议”，不宣称修改官方客户端。
6. 自动化测试与 Windows 国服自定义房间验收通过。

## 9. 风险、取舍与后续选项

- **最大风险不是随机算法，而是名册完整性。** 如果客户端无法提供可靠的完整性证据，产品应提示待确认，不能让“恰好识别到 8 人”冒充真实 4v4。
- **保守策略会降低可用率。** 若国服 LCU 始终无法证明完整，可以在第二阶段引入“房主人工核对名单并确认”的独立模式，明确标注为人工确认结果，不与自动确认混用。
- **纯随机不保证两队实力相近。** 同一组好友实力差异较大时，可能有明显强弱队，但这不代表抽签算法不公平。若以后增加“实力平衡”，应作为另一种明确命名的玩法。
- **官方客户端操作边界**：本方案只读玩家及房间信息，抽签在本地完成，不执行自动转队。
- **接口版本风险**：LCU 属于客户端内部接口；所有字段路径和完整性证据须以目标国服客户端实测为准，不能把社区接口结构等同于 Riot 长期稳定的第三方 API 合同。

## 10. 相关代码链接

- [项目仓库](https://github.com/UoMiss/aram-mayhem)
- [随机算法 `teamRandomizer.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/teamRandomizer.ts)
- [抽签生命周期 `useTeamShuffle.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/useTeamShuffle.ts)
- [成员刷新 `useTeamParticipants.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/useTeamParticipants.ts)
- [分组抽屉 `TeamDrawer.vue`](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/components/TeamDrawer.vue)
- [Rust 名单解析 `participants.rs`](https://github.com/UoMiss/aram-mayhem/blob/main/src-tauri/src/lcu/participants.rs)
- [Rust Tauri 入口 `commands/participants.rs`](https://github.com/UoMiss/aram-mayhem/blob/main/src-tauri/src/commands/participants.rs)
- [前端 IPC 校验 `participants-contract.ts`](https://github.com/UoMiss/aram-mayhem/blob/main/src/shared/ipc/participants-contract.ts)
- [抽签算法测试](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/teamRandomizer.test.ts)
- [抽屉 API 测试](https://github.com/UoMiss/aram-mayhem/blob/main/src/features/tools/components/TeamDrawer.api.test.ts)

---

**建议将本文件保存为：** `docs/custom-lobby-team-randomizer-plan.md`。  
**说明：** 本地落地状态见文首说明；国服实机验证仍未完成。
