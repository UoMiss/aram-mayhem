# ARAM Mayhem｜AI 项目审查与正式上线验收执行标准

> **文档属性**：可复用的 AI 审查规程（Audit Standard / Review Playbook），**不是一次性审查结果**。  
> **标准版本**：1.0.0  
> **制定日期**：2026-11-07  
> **适用项目**：[UoMiss/aram-mayhem](https://github.com/UoMiss/aram-mayhem)  
> **当前产品定位**：Windows / Tauri 2 / Vue 3 / TypeScript / Rust 桌面助手；以本地只读 LCU、好友自定义房间 3v3/4v4/5v5 随机分队、游戏状态、历史战绩和结算为核心；默认离线、本地存储，不依赖云端。  
> **权威性声明**：本文件是项目自定义的工程审查制度，参考 ISO/IEC 25010:2023、OWASP ASVS 5.0.0、Riot、Tauri、Microsoft 的官方资料；**不是 ISO/OWASP 认证，也不宣称 LCU 是 Riot 官方承诺稳定的第三方 API**。

---

## 0. 复制给 AI 的执行指令（必须原样理解、逐项执行）

```text
你是 ARAM Mayhem 项目的独立高级软件审查员、Windows/Tauri 工程师、测试负责人和发布验收负责人。
目标：按照《ARAM Mayhem｜AI 项目审查与正式上线验收执行标准》审查指定 Git 提交的完整项目，给出有证据的事实判断、缺陷分级、文件级修复建议、可执行的测试方案以及 GO/NO-GO 结论。

审查仓库：https://github.com/UoMiss/aram-mayhem
审查基线：当前目标分支实际 HEAD（先记录完整 commit SHA、版本、时间），不得把旧审查报告当成当前源代码。
产品约束：纯本地运行；不增加云端依赖；LCU 只读为默认边界；随机分队仅对完整、可确认的 6/8/10 人自定义房间产生正式结果；不得猜测隐藏玩家身份、对局统计或未知 LCU 字段。

执行要求：
1. 先枚举仓库、构建配置、测试、Windows CI 与关键业务数据流，再阅读具体实现；必须追踪 Rust → IPC → TypeScript → Pinia → Vue 与失败、重连、账号切换路径。
2. 对每项发现标注：标准条目 ID、严重级别、事实/风险/建议分类、文件:行号、最小复现或可观察证据、影响、修复方案、验收测试。
3. 检查官方规范时给出文档名称、URL、版本/访问日期；社区 LCU Swagger 与实机响应不能被称为 Riot 官方稳定契约。规范条款不适用时写 N/A 并说明原因。
4. 使用项目现有脚本或 Windows CI 实际执行能执行的检查，记录环境、命令、退出码与日志证据。没有执行的测试写 NOT_RUN；没有真实国服客户端就写 NEEDS_WINDOWS_LCU，不得说通过。
5. 严格区分 BUG（当前承诺功能违反预期）、GAP（已明确的目标业务尚未实现）、ENHANCEMENT（可选改进）、COMPLIANCE_UNVERIFIED（外部合规待核实）。
6. 默认只读审查，不编辑仓库、不提交、不创建 PR、不修改配置或凭据。提出修复时先给出按优先级排序的文件级修改计划。
7. 不允许只凭主观印象打“100分”或宣布正式上线；必须按本标准第 8 节发布门禁判定。
8. 输出必须遵循本标准第 9 节的固定结构，并在结尾提供证据不足清单和最小下一步行动。
```

## 1. 审查启动与证据原则

### 1.1 固定审查对象

AI 必须先记录：

| 字段               | 必填值                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| 仓库、分支         | 实际来源，含 URL                                                                 |
| HEAD SHA、提交日期 | `git rev-parse HEAD` / GitHub commit 事实                                        |
| 产品版本           | `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三者交叉核对 |
| 环境               | OS、架构、Node、pnpm、Rust、WebView2、英雄联盟客户端版本（能得到才填）           |
| 测试范围           | 静态、单元、集成、构建、Windows 冒烟、国服实机；分别记录执行/未执行              |
| 第三方依据         | 官方文档名称、版本、URL、检索日期                                                |

不得将以前的 v0.1.1 结论直接继承给新提交；已有修复必须重新核实。

### 1.2 证据等级

- **E1：实际执行证据**——命令、完整退出码、测试报告/日志、Windows 录像或截图、可复现步骤；证据最强。
- **E2：直接源码证据**——在当前 SHA 的 `path:line-line`，包括调用方、分支及验证逻辑；能证明实现，但不能证明实机运行成功。
- **E3：外部规范证据**——官方文档明确条款、版本或官方明确不保证的限制；证明规范内容，不证明产品已合规。
- **E4：推断或建议**——必须标记 `HYPOTHESIS`，附验证手段；不得作为“已确认 BUG”的唯一证据。

**结论状态**只有 `PASS`、`FAIL`、`PARTIAL`、`NOT_IMPLEMENTED`、`NOT_RUN`、`NEEDS_WINDOWS_LCU`、`N/A`。不能把 `NOT_RUN` 或 `NEEDS_WINDOWS_LCU` 汇总为 `PASS`。

### 1.3 审查顺序与原则

1. 锁定 commit → 源码目录树 → 功能入口和数据流 → 安全边界 → 代码实现 → 测试覆盖 → 构建/发布链 → 实机证据。
2. 先检查有后果的错误：误报游戏状态、错误分队、错误排名、错误幸运数字、数据误删、凭据泄露、崩溃和安装失败。
3. 检查**不变量**而不只检查正常路径；任何未知字段、版本变化、断线、账号切换均须有合理退化。
4. 已实现功能按现有承诺判缺陷；上一轮讨论过但尚未纳入本次版本范围的功能仅标为 `GAP/ENHANCEMENT`。
5. 对存在冲突的需求，明确取舍；不得把“严格等概率随机”悄悄改成“按实力加权配平”。

## 2. 审查边界与非目标

- **必须审查**：Windows/Tauri 启动、窗口与托盘；LCU 发现、授权、本地 HTTPS；Gameflow 会话；房间名单和随机分队；战绩、结算与规则锁定；前后端 IPC 契约；数据存储和可选缓存管理；国际化与 UI；测试与 CI；隐私/第三方合规。
- **不应默认增加**：Cloudflare/R2、远程数据库、在线账号、自动改动官方客户端队伍、自动选英雄、读取隐藏身份、修改游戏进程、注入代码、绕过反作弊。
- **LCU 性质**：League Client API 是本地接口，Riot 官方说明它**不受官方第三方支持且不保证文档完整性、可用性或变更通知**。代码应依赖实测响应及严格回退，而不是假定永远不变。
- **官方客户端一致性**：字段/展示方式可以参考，但不复制官方客户端完整外观或功能；第三方产品不得侵犯 Riot 的产品风格与功能限制。

## 3. 规则编号与强制检查矩阵

> AI 应为每一行输出 `状态 + 证据 + 影响 + 建议`；不得仅在表中写“正常”。

| ID      | 检查域       | 必须验证的不变量 / 要求                                                                                           | 常见证据锚点                                           |
| ------- | ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ARC-01  | 架构分层     | Rust 负责 LCU 与敏感 IO；Vue 不持有 lockfile 凭据；Mock/Real 严格分离                                             | `src-tauri/src/lcu/`, `src/adapters/`, `src/services/` |
| ARC-02  | 版本契约     | TS 类型、Rust Serialize、IPC guard 三方一致；新增字段同步测试                                                     | `src/types/`, `src/shared/ipc/`, Rust DTO              |
| LCU-01  | 发现与权限   | 只连接经过验证的本地进程/loopback 端点；不泄漏密钥；认证失败可分类                                                | `discovery.rs`, `client.rs`, `error.rs`                |
| LCU-02  | 安全网络     | LCU TLS 例外仅限专用 localhost 客户端；其它 HTTPS 不跳过证书校验；无任意 URL 拼接/开放代理                        | `client.rs`, `settings.rs`                             |
| LCU-03  | 会话状态     | Lobby → Matchmaking → ChampSelect → GameStart → InProgress → EndOfGame → Next Lobby，不跨局污染；未知阶段安全降级 | `gameflow.rs`, `gameflow_monitor.rs`                   |
| LCU-04  | 数据真实     | 模式、队列、地图、账户和玩家身份基于实际字段；未知/null 不猜测；缓存标记来源和有效期                              | `lobby.rs`, `gameflow_monitor.rs`, `home.ts`           |
| TEAM-01 | 正式抽签范围 | 仅经证实的自定义房间 6/8/10 名有效真人可以正式抽签；不得混入 party/champ_select 预览名单                          | `participants.rs`, `TeamDrawer.vue`                    |
| TEAM-02 | 名单准确     | 去机器人/观战者、唯一 ID 去重、名单完整性证据、预抽刷新；任何未确认信息有明确错误态                               | `participants.rs`, `useTeamParticipants.ts`            |
| TEAM-03 | 算法正确     | Fisher–Yates；6→3+3、8→4+4、10→5+5；原数组不变；无丢失/重复；结果概率不被隐藏规则扭曲                             | `teamRandomizer.ts`, tests                             |
| TEAM-04 | 状态生命周期 | 抽签中禁止重复操作；改变有效玩家/房间/账号即失效；仅昵称变化不应无故重抽；关闭/重连无过期结果                     | `useTeamShuffle.ts`, `TeamDrawer.vue`                  |
| TEAM-05 | 结果语义     | 分组只是本地建议，不声称已修改 LOL 红蓝阵营；截图标明来源/时间/分队模式                                           | `TeamDrawer.vue`, `zh-CN.ts`                           |
| HIST-01 | 历史真实     | 当前账号匹配、gameId 用字符串保精度、分页去重排序、空与缺失区分、不同账号不串数据                                 | `history.rs`, `history.ts`                             |
| SET-01  | 结算一致     | teamId、参与者、胜负、伤害、排名、好友集合映射正确；数字精度无损                                                  | `settlement.rs`, `settlement-contract.ts`              |
| SET-02  | 规则锁定     | 同一账号+同一 gameId 不可二次覆盖；幸运数字一次生成、持久化且重启一致；未满足条件不抽奖                           | `commands/match_rules.rs`, `commands/settlement.rs`    |
| SET-03  | 未就绪状态   | 404/204/部分数据与永久错误分开；有限重试、可手动重试、切换账号中断；缺数据不假造排名                              | `MatchDetailPage.vue`, `settlement.ts`, Rust source    |
| DATA-01 | 本地持久化   | 规则、幸运数字、偏好位置明确；意外断电/重复写入/并发写入不破坏数据；版本兼容                                      | `match_rules.rs`, `local-data.ts`, `settings.ts`       |
| DATA-02 | 缓存和删除   | 如果提供清缓存：仅删除应用自己拥有的可再生缓存，准确测量，保护 `match-rules-v2` 和 localStorage                   | `storage/*`（若存在）, Tauri command                   |
| SEC-01  | IPC 安全     | 最小权限、主窗口验证、输入强校验、禁止任意路径/任意 URL、错误脱敏、无秘密打印                                     | `capabilities/*.json`, `commands/*`, `discovery.rs`    |
| SEC-02  | 数据隐私     | 玩家身份仅按功能需要处理；无未经同意的云上传；分享/导出前给用户明确操作                                           | `participants.rs`, `image.service.ts`, 配置            |
| UX-01   | 用户可理解   | loading/empty/error/offline/unknown 状态区分；中文显示准确；残障/键盘焦点/减少动画有效                            | Vue 页面, `i18n`, 交互测试                             |
| OPS-01  | 自动化检查   | format、lint、typecheck、测试、audit、Rust fmt/test、适用 clippy、构建；不能仅因为 workflow 存在判通过            | `package.json`, `.github/workflows/`                   |
| OPS-02  | Windows 发布 | NSIS 安装、启动、托盘、退出、升级/卸载、SHA-256、版本一致、运行时依赖、签名策略记录                               | Tauri config、release workflow、Windows 录像           |
| GOV-01  | Riot 合规    | 产品登记状态、显著免责声明、使用资产与游戏完整性、游戏客户端 API 政策、隐私和公开发行的合法性                     | Riot 官方政策 + UI + 人工登记记录                      |
| GOV-02  | 版本边界     | 建议功能、已实现功能、缺陷分别清点；每一版本有变更记录、回滚预案及验收负责人                                      | README, release notes, PR/issue                        |

## 4. 强制业务验收用例

### 4.1 随机分队（必须真实/模拟两组证据）

| ID   | 前置条件 / 输入                           | 预期结果                                                 |
| ---- | ----------------------------------------- | -------------------------------------------------------- |
| T-01 | 自定义房间 6 名已确认真人                 | 只允许 3v3；唯一 ID 6 个，任意 2 人不能同时出现在两组    |
| T-02 | 自定义房间 8 名已确认真人                 | 只允许 4v4                                               |
| T-03 | 自定义房间 10 名已确认真人                | 只允许 5v5                                               |
| T-04 | 0/1/2/5/7/9/11 人                         | 禁止**正式**抽签；明确人数和理由                         |
| T-05 | 自定义房间 10 个槽位仅识别 8 个 ID        | 未确认完整时不得按 4v4 正式抽签                          |
| T-06 | 机器人/观战者/重复身份/空槽               | 不误计入；不能确定人数时失败关闭（fail closed）          |
| T-07 | 选英雄/普通队伍大厅                       | 不可冒充正式自定义房间分队；如果设计支持预览必须显著标记 |
| T-08 | 抽签前增加/退出玩家、换房间、换账号、断线 | 已得结果立即失效，禁止复制过期结果                       |
| T-09 | 仅昵称补全但 ID 不变                      | 分组不重算；显示同步即可                                 |
| T-10 | 连续点击、动画中关闭/卸载、低动态偏好     | 无双重任务、定时器泄露；结果可解释且有效                 |
| T-11 | 100+ 可重复种子/边界输入                  | 校验人数守恒、去重、均分；“统计公平”须注明样本与局限     |

### 4.2 LCU 与对局状态

| ID   | 场景                                  | 验收标准                                                     |
| ---- | ------------------------------------- | ------------------------------------------------------------ |
| L-01 | 未安装/未启动/未登录客户端            | 清楚提示，不崩溃、不露密钥、不展示 Mock 为真实               |
| L-02 | 正常生命周期与重复事件                | 同一场次会话稳定，下一场次不带旧数据                         |
| L-03 | 客户端断线、重启、切换账号            | 取消旧请求/订阅，不展示其他账号的数据                        |
| L-04 | 未知 `queueId` / `gameMode` / `mapId` | 展示“未知/待确认”或可信客户端元数据，绝不强行映射            |
| L-05 | API 404/204/超时/未授权/结构变化      | 错误按语义分类，恢复策略有边界                               |
| L-06 | Windows 国服当前版本                  | 核实各接口实际存在性、字段和中文名称；录入构建/版本/录像证据 |

### 4.3 结算、本地数据与安装

| ID   | 场景                               | 验收标准                                                                     |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------- |
| S-01 | 伤害/尾数/幸运数字排序、并列       | 可复算、定义清晰；整数精度不丢失                                             |
| S-02 | 赛后 API 尚未就绪                  | `PENDING` 或等价明确状态；不会将缺数据误报为 0 或直接终局失败                |
| S-03 | 同一场结算重复打开、应用重启       | 锁定规则和幸运数字保持不变                                                   |
| S-04 | 错误 gameId、换账号、恶意 IPC 输入 | 无数据串场、无不授权读取写入                                                 |
| S-05 | 不同 Windows 用户、升级/重装       | 本地记录边界明确；历史数据可读，损坏文件有恢复提示                           |
| S-06 | 若已实现缓存管理                   | 扫描大小可复核，默认清理不删除偏好/幸运数字/他人目录；联接点和被占用文件安全 |
| S-07 | 打包的 NSIS、首次运行和托盘退出    | 能安装、运行、卸载；WebView2/权限问题有友好提示                              |

## 5. 安全、官方 API 与合规审查准则

1. **官方性分层**：`Riot 开发者文档/政策` > `Riot 公开静态数据` > `客户端实际捕获字段` > `社区 LCU Swagger` > `代码中的猜测`。不同来源的用途不同，不能用社区文档取代 Riot 的政策承诺；所有社区/实机字段要声明版本范围。
2. **LCU 接口**：优先只读 `GET`；逐条记录真实用到的 path、返回字段、可能状态码、调用阶段、权限和失败处理。严格限制 `127.0.0.1` 及经过校验的本地进程；不把 lockfile 密码发送到公网。
3. **第三方政策**：检查 Riot 开发者门户的产品登记/审查要求和游戏专项政策；核对产品内可见免责声明及资源许可。**无法读取开发者后台状态时必须 `COMPLIANCE_UNVERIFIED`**。
4. **反作弊与游戏完整性**：不允许未经明确批准的客户端队伍修改、玩家隐藏信息解锁、自动游戏操作、进程注入、内存读写、反作弊规避。
5. **网络与依赖**：严格检查升级检查的外部请求、依赖许可证、已知漏洞和供应链边界；`pnpm audit`、`cargo audit` 等工具若未配置/未运行，应记录为缺失证据而非自动无漏洞。
6. **本地数据与删除**：缓存清理为可选功能，如果未实现是 `GAP`，不是自动 `BUG`。若实现必须按正向白名单、目录归属、符号链接/联接点、防 TOCTOU、文件锁和安全重启要求测试。Tauri `clearAllBrowsingData()` 会清除 localStorage 等所有浏览数据，不应直接当作“安全清理缓存”。
7. **错误脱敏**：禁止打印 lockfile、凭据、用户私密数据、完整敏感异常堆栈；对外错误码稳定且可诊断。

## 6. 代码审查执行步骤（必须留痕）

### 阶段 A：侦察

- 读取 `README.md`、仓库树、CI、构建配置、锁文件、Tauri capabilities；列出实际功能与过去建议的差异。
- 构建数据流图：`LCU discovery → read → Rust DTO → Tauri command/event → runtime IPC guard → Store → UI`；另建结算规则持久化和抽签数据流。
- 通过关键字扫描 `TODO/FIXME`, `unwrap/expect/panic`, `danger_accept_invalid_certs`, `Math.random`, `setInterval`, `localStorage`, `fs::remove_*`, `invoke`, `queueId`, `mapId`, `isCustom`, `gameId`, `accountKey`，但**扫描命中不等于漏洞**，需上下文证明。

### 阶段 B：逻辑与安全

- 对第 3 节每个 ID 展开代码路径与不变量验证。
- 按“正常、空值、格式错误、未知版本、断线、并发、过期响应、账号切换、跨局、重启”建立用例。
- 任何结算/抽签/删除类操作，审查输入来源、授权、幂等性、异常处理和破坏性风险。

### 阶段 C：自动化（在可运行环境执行）

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm audit
pnpm audit --prod
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
cargo test --locked --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

> 上述是**目标验证命令集合**，不是已执行记录。`cargo clippy` 可先在可用 target 上运行，并评估是否纳入 CI；Windows 交叉目标要求相应工具链。`pnpm audit`/`cargo audit` 无结果不等于永久无风险。若无本地 checkout/Windows 环境，只能读源码和 CI 配置，标记 `NOT_RUN`，不可声称命令成功。

### 阶段 D：真实 Windows / 国服客户端

至少覆盖：首次安装、退出与托盘、登录/登出、Lobby、3v3/4v4/5v5、房间成员更替、ChampSelect、GameStart、InProgress、结束到战绩、断线重连、账号切换、重启恢复、未知字段、Windows Defender/反作弊正常环境、中文显示、截图导出。

对每一项记录：测试机 OS、客户端版本、账号匿名标识、接口来源、步骤、期望、实际、时间、录像/日志、缺陷编号。不能用 Mock 替代这一阶段。

### 阶段 E：发布门禁

结合安全审查、用户验收和残余风险列表给出正式判定。完整的流程记录必须可由另一个审查者复核。

## 7. 缺陷分类、严重度和修复优先级

### 7.1 类型（禁止混淆）

- `BUG`：当前发布版本明确提供/承诺的功能在有效输入下实现不正确。
- `GAP`：目标业务需求已提出，但当前版本尚未实现；必须标注是否纳入本次发布范围。
- `ENHANCEMENT`：体验或效率可改善，但不是当前必需能力。
- `COMPLIANCE_UNVERIFIED`：法律/政策/外部登记状态无法凭仓库证实。
- `RISK`：可推导的潜在失败条件，尚未有复现证据；保留验证计划。

### 7.2 严重度

| 等级          | 定义                                                                   | 示例                                           | 发布影响                 |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------- | ------------------------ |
| **S0 / 致命** | 可造成凭据泄露、越权任意文件删除、破坏用户重要数据、重大游戏完整性违规 | 删除游戏目录、向公网发 lockfile 密码           | 一票否决                 |
| **S1 / 高**   | 核心业务数据/结果可信性严重受损，或影响大范围主要流程                  | 未确认名单就正式抽签；错误结算；幸运数字被覆盖 | 一票否决（需修复后复测） |
| **S2 / 中**   | 可用性/一致性显著下降，但有合理绕过方式                                | 模式识别部分不准；结果无故失效；结算重试体验差 | 明确风险接受或修复期限   |
| **S3 / 低**   | 局部 UI、文案、非核心性能                                              | 提示不够清晰、微小样式缺陷                     | 可以延期                 |
| **S4 / 建议** | 尚未承诺的新能力、非必要重构                                           | 存储空间可视化、缓存管理新增                   | 不自动阻止发布           |

**定级应结合当前版本目标**：未加入发布范围的 6/8/10 限制是 `GAP`，一旦宣称产品已支持“正式好友内战分组”且错误结果可被用户采信，则可能为 S1。最终写清条件和证据，不机械定级。

## 8. 正式发布 GO / NO-GO 门禁

**GO 必须同时满足：**

1. 当前提交 SHA、版本一致，且打包工件可溯源；产物校验信息存在。
2. 无未关闭的 S0/S1；S2 有书面风险接受、负责人和截止时间。
3. 核心流程（LCU 连接、账号、房间名单、正式抽签、结算、规则持久化）在其**实际声明的产品范围内**有测试证据。
4. 前端、Rust 构建和测试门槛实际通过；Windows 安装/启动/退出/升级路径有当次版本的报告。
5. 国服真实客户端关键流程已通过；若该版本面向国服正式分发，没有实测证据不得标记 GO。
6. Riot 相关产品登记、免责声明/资产使用、游戏完整性审查有记录；无法确认的关键合规项不得默认为通过。
7. 已定义备份/回滚方案；不会因升级/清理丢失不可恢复的规则和幸运数字。

判定定义：

- `GO`：上述全部满足，并由有权发布人员确认。
- `CONDITIONAL_GO`：只剩可接受的非核心 S2/S3 或明确非阻断缺口；附签字、期限与回退条件。**不得用此绕过 S0/S1、国服核心实测或关键合规核实。**
- `NO_GO`：存在 S0/S1，或关键验收失败。
- `INSUFFICIENT_EVIDENCE`：未运行核心测试/缺少国服实机或外部合规材料；此状态不是“发现必然缺陷”，但**不得签署 GO**。

## 9. AI 审查报告输出模板（固定顺序）

### 9.1 执行摘要（必须简短）

```
审查目标：<repo / branch / SHA / version>
审查范围：<模块列表>
证据类型：静态分析 / 本地执行 / CI 日志 / Windows LCU 实测 / 外部政策
当前发布判定：GO | CONDITIONAL_GO | NO_GO | INSUFFICIENT_EVIDENCE
S0/S1/S2/S3/S4 数量：...
最重要的 3 个阻断或改进项目：...
无法验证的关键项目：...
```

### 9.2 条目矩阵

`ID | 结果状态 | 证据等级 | 当前 SHA 文件:行号 / 命令日志 | 判定依据 | 缺口/风险`；覆盖第 3 节所有 ID。

### 9.3 逐项发现（一个发现一个编号）

```markdown
#### F-001｜<简短标题>

- 类别：BUG / GAP / ENHANCEMENT / RISK / COMPLIANCE_UNVERIFIED
- 严重度：S0 / S1 / S2 / S3 / S4
- 证据等级：E1/E2/E3/E4
- 代码定位：`path:line-line`（当前 SHA）
- 外部依据：文档 URL / 条款 / 访问日期（若适用）
- 当前行为：可观察事实，不凭空猜测
- 预期不变量：...
- 影响范围/触发条件：...
- 最小复现：步骤、输入、预期、实际（没执行必须标注未复现）
- 建议修复：具体文件和逻辑，不破坏只读 LCU
- 验收测试：自动测试名 + 国服实机步骤 + 通过标准
- 信心：高/中/低；剩余未知：...
```

### 9.4 按 PR 分组的修复计划

每一 PR 要有 `目标 → 文件清单 → 数据契约变化 → 单元测试 → Windows 实测 → 回滚方式 → 完成定义（DoD）`。优先 S0/S1，再 S2，最后 GAP/S4。禁止建议不必要的大重构。

### 9.5 测试执行记录

`命令/测试项 | 环境 | 执行时间 | 退出码 | 结果 | 证据位置 | 阻断原因`；没有执行的命令列 `NOT_RUN`，不可省略。

### 9.6 风险接受与上线签署

| 角色       | 审查人 | 日期   | 签名/批准 | 备注 |
| ---------- | ------ | ------ | --------- | ---- |
| 代码审查   | 待填写 | 待填写 | 待填写    |      |
| 测试负责人 | 待填写 | 待填写 | 待填写    |      |
| 合规/产品  | 待填写 | 待填写 | 待填写    |      |
| 发布负责人 | 待填写 | 待填写 | 待填写    |      |

### 9.7 证据不足和下一步

列出所有 `NOT_RUN`、`NEEDS_WINDOWS_LCU`、`COMPLIANCE_UNVERIFIED`，写明**具体由谁**补什么证据；最终报告不得用无依据的“总体评分 95 分”替代门禁。

## 10. 项目专项关注清单（随代码变化复核，不是预先判罪）

以下锚点用于下一次 AI 审查的**检索入口**；它们反映历史审查中值得注意的模式，必须重新读取目标 commit 后再下结论。

1. `src/features/tools/teamRandomizer.ts`、`useTeamShuffle.ts`、`TeamDrawer.vue`：正式分队是否已限制 6/8/10，是否禁止用部分身份名单抽签；动画是否与最终结果隔离。
2. `src-tauri/src/lcu/participants.rs`：`customTeam100/customTeam200`、members 回退、观战者/机器人、`lobbyKey`、完整性和账号切换。
3. `src/stores/home.ts`、`src/shared/lib/history-presentation.ts`、`src-tauri/src/lcu/lobby.rs`：`queueId/gameMode/gameType/mapId` 是否统一；不依据 ARAM 模式猜地图。
4. `src-tauri/src/lcu/gameflow.rs`、`gameflow_monitor.rs`：房间退出后的模式上下文、sessionKey 复用与下一局污染。
5. `src/features/match-detail/MatchDetailPage.vue`、`src-tauri/src/lcu/settlement.rs`：404/204 未就绪与错误区分；排位/幸运数字的跨局确定性。
6. `src-tauri/src/commands/match_rules.rs`：不可覆盖的本地规则记录，不被“清缓存”删除。
7. `scripts/sync-champion-assets.mjs`、`src/assets/champions/catalog.json`：Data Dragon `name`（英雄名）与 `title`（称号）映射、资源版本和 UI 名称优先级。
8. `src-tauri/src/commands/app.rs`：健康检查中的 `simulated` 语义是否与真正使用 LCU 的桌面版一致。
9. `.github/workflows/`：实际 CI 运行记录、Clippy/安全扫描与发布签名策略；有 workflow 文件不等于最近一次已通过。
10. `src/features/settings/SettingsPage.vue`、`src/stores/settings.ts`：本地存储管理是否已经实现；若未加入版本范围仅作产品建议，不标为缺陷。

## 11. 审查者禁止事项

- 不得编造文件、行号、运行日志、CI 通过状态、Riot 批准状态、Windows 兼容性结果。
- 不得把 LCU 社区提取文档称为 Riot 正式公开支持的 API。
- 不得因为缺少测试就直接断言代码必有漏洞；也不得因为有测试文件就断言功能正确。
- 不得把计划中的功能当作已交付；也不得把没有承诺的功能缺失计为生产事故。
- 不得在源码审查时自行改变用户数据、开启云同步或调用游戏客户端写接口。
- 不得建议缓存清理直接删除整个 `%LOCALAPPDATA%/com.arammayhem.desktop` 或整个 `EBWebView` 目录。
- 不得以主观评分替代 S0/S1 门禁和完整证据链。

## 12. 官方参考依据（审查前检查是否已更新）

1. ISO/IEC 25010:2023 产品质量模型：<https://www.iso.org/standard/78176.html>。
2. OWASP Application Security Verification Standard（ASVS）5.0.0：<https://asvs.owasp.org/>。本标准只采用适用于桌面 WebView / IPC / 本地网络的安全要求，不宣称完整 ASVS 认证。
3. Tauri Security Capabilities / 最小权限：<https://tauri.app/security/capabilities/>。
4. Tauri WebView API（`clearAllBrowsingData` 的删除范围）：<https://tauri.app/reference/javascript/api/namespacewebview/>。
5. Riot League of Legends Developer Documentation / League Client API：<https://developer.riotgames.com/docs/lol>。
6. Riot General Policies / 产品登记与合规要求：<https://developer.riotgames.com/policies/general>。
7. Riot 游戏完整性和第三方应用安全说明：<https://support.riotgames.com/en-us/riot/events/third-party-applications>。
8. Microsoft WebView2 文档（版本与运行时存储能力需按具体 API 再核对）：<https://learn.microsoft.com/en-us/microsoft-edge/webview2/>。

---

**最终约束**：本规范的用途是让任何 AI 在不同时间、不同版本，对同一项目实施**可复核、可复现、可验收的审查**。输出的“一次性审查报告”是执行本规范的结果，**不能取代本规范本身**。
