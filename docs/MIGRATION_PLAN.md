# 原生 HTML → Vue 3 迁移执行清单

## 基线

`references/deepseek.original.html` 是原始设计真值；由 `pnpm check:baseline` 验证 SHA-256。迁移期间只读，不得覆盖、删减或修改。

## 页面清单

- [x] 未连接页（完整迁移；LCU 仍以 Mock 演示代替）
- [x] 顶部栏与底部四栏导航
- [x] 已连接首页
- [x] 战绩列表与类型筛选
- [x] 结算详情 / 分组视图 / 全局排行
- [x] 工具页 / 三种规则选择
- [x] 8 人随机分组抽屉 / 洗牌动画
- [x] 设置页
- [x] 结算截图复制与下载兜底
- [x] 分组图片复制

## 阶段

- [x] Stage 1：工程、lint/typecheck/test/build 基础、pnpm 锁文件
- [x] Stage 2：完整主题提取、应用壳、未连接页与导航
- [x] Stage 3：首页迁移、首页类型/Mock 与规则响应式状态
- [x] Stage 4：战绩页面、7 条战绩 Mock、筛选、刷新与详情选择
- [x] Stage 5：结算详情、分组/全局排行、截图复制与下载
- [x] Stage 6：工具页、三种规则、随机分组抽屉、洗牌动画与分组图片复制
- [x] Stage 7：设置页、演示开关、检查更新与更新 Toast
- [x] Stage 8：全量视觉/交互回归、格式/审计/favicon 收尾与最终验收
- [x] Stage 8.2：简体中文文案资源化（仅 zh-CN）
- [x] Stage 9：Tauri 2 + Rust 桌面工程、IPC 与 macOS `.app`
- [x] Stage 10.1：Rust LCU 发现、只读连接、状态机、自动重连与 Mock 测试
- [x] Stage 10.1.5：GitHub 私有仓库、Windows x64 CI、27 Rust 测试与 NSIS Artifact
- [x] Stage 10.2：LCU Gameflow、Lobby/ChampSelect 快照、WebSocket + 轮询与会话隔离
- [ ] Stage 10.3+：真实 Windows 游戏流程验证、战绩/结算接入、托盘/Updater、签名

## Stage 9 交付

- Tauri CLI/JS API 2.12.4；Rust tauri 2.12.5、tauri-build 2.7.4、Rust 1.99.1。
- `src-tauri/` 官方入口、`commands/app.rs`、`tauri.conf.json`、capability、品牌 icons 与 Cargo.lock。
- 480×900 原生窗口、最小 320×568；Vite/Tauri 统一 1420；beforeDev/beforeBuild 使用 pnpm。
- `app_health_check` IPC + 前端 `AppHealth`/adapter/service；App 启动静默探测，无可见测试 UI。
- 浏览器 Mock adapter、Tauri lazy adapter；不接 LCU，不伪造真实连接。
- CSP 与仅 `core:default` capability；无 Shell/FS/HTTP/Clipboard 插件/Updater。
- 75 前端测试、103 构建模块、3 Rust 测试、cargo check/fmt、tauri dev、tauri build `.app` 通过。
- 限制：完整 Xcode 未安装、DMG hdiutil 沙箱拒绝、桌面截图/剪贴板自动化权限不足；详见 `docs/PHASE9_TAURI_INTEGRATION.md`。

## Stage 10.2 交付

- Gameflow phase 全量解析、未知阶段、Lobby/ChampSelect 精简快照、GameSessionContext。
- WebSocket WAMP 事件解析 + 1.5s HTTP 轮询 fallback + 会话 generation/revision。
- Tauri 命令/事件：snapshot/start/stop + gameflow/lobby/champ-select/session-ended。
- 前端 types/adapter/service/Pinia/i18n；无 UI 改动。
- 90 前端 / 47 Rust 测试；Windows CI Run `41312013808` 成功，NSIS 4,315,210 bytes，SHA-256 `e5df5ce93e184e40ba46afb7746cde697477c111b9fddc331e54237b48103342`。
- 真实 Windows 游戏流程/LCU 未验收。
- 详情：`docs/PHASE10_2_GAMEFLOW.md`。

## Stage 10.1.5 交付

- 私有仓库：https://github.com/UoMiss/aram-mayhem；main 成功代码提交 `5d0c961d1e107779eab9def6b0167b267a36e853`。
- Workflow：`.github/workflows/windows-build.yml`；Run `41294166671` 成功。
- Windows-2022：82 前端测试、27 Rust 测试、MSVC check、NSIS、Artifact 上传均成功。
- NSIS：`ARAM Mayhem_0.1.0_x64-setup.exe`，4,182,062 bytes，SHA-256 `d08cacced2dde3049860a52fed425752b9748c035c4af14635b5099b57bf205f`。
- Artifact：`aram-mayhem-windows-x64`，id `13078453720`。
- 真实 Windows 10/11 桌面和真实 LCU 未验收；未签名、未创建 Release。
- 详情：`docs/PHASE10_1_5_WINDOWS_CI.md`。

## Stage 10.1 交付

- `src-tauri/src/lcu/`：discovery、client、connection、monitor、models、error；命令 `lcu_get_connection_status`、`lcu_start_monitoring`、`lcu_stop_monitoring`；事件 `lcu://connection-status`。
- Windows：`LeagueClientUx.exe` + lockfile + PID 校验；非 Windows 明确 `unsupported_platform`。
- 只读：专用 loopback HTTPS、仅 `GET /riotclient/region-locale`；3s 超时；无 LCU 写操作。
- 自签名 TLS：仅专用 connector 禁用验证，固定 127.0.0.1；未全局修改 TLS。
- 状态机/监控：状态码、revision/updatedAt、generation、单任务、2s 轮询、500ms–5s 退避、stop/shutdown。
- 前端：`types/lcu.ts`、`lcu.service.ts`、browser/tauri adapters、Pinia `lcuStatus`；无 UI 改动。
- 测试：82 前端 / 106 构建模块 / 27 Rust；Tauri dev/release 在 macOS 返回 UnsupportedPlatform；Windows 未实机验证。
- 文档：`docs/PHASE10_1_LCU_FOUNDATION.md`。

## Stage 8.2 交付

- 安装 `vue-i18n@11.4.16`，仅注册 `zh-CN`；无英文包、语言切换或语言检测。
- 新增 `src/i18n/index.ts`、`src/i18n/locales/zh-CN.ts`、`src/i18n/labels.ts` 与 i18n 测试。
- 公共 UI、首页、战绩、结算、工具、抽屉、设置、Toast、aria/title 全部迁移。
- Pinia/Mock 去除重复展示 label，仅保留业务值/数据；玩家、英雄、KDA、数值、ID、时间、队列、版本保持数据。
- `useTeamShuffle` 改为 countdown；Image Service 行为不变，UI 负责中文 Toast。
- i18n 后 8 个静态状态与阶段八 Vue 基线 0 像素差；分组/全局 PNG 字节完全一致。
- 测试 67 → 70；构建 76 → 96。
- 开发依赖安全：Vitest 4.1.12、minimatch 11.0.3 override，审计 0。
- 映射与验收：`docs/ZH_CN_I18N_MIGRATION.md`、`docs/verification/stage8.2/`。

## Stage 8 交付

- 全页面 9 状态 × 5 尺寸 × 原始/Vue 视觉回归，证据在 `docs/verification/stage8/`。
- 三张真实 PNG：分组结算 896×1894、全局排行 896×1696、随机分组 880×570；剪贴板、下载、失败、并发实测。
- 连续多页面功能回归：连接/重连、首页三按钮、战绩筛选/刷新、结算选择、工具规则、随机分组、设置状态与更新提示。
- 修复全仓 `pnpm format:check`：格式化配置/主题文件；仅忽略 pnpm 锁文件与本地 store，未忽略源码目录。
- 修复 favicon 404：本地 SVG icon，浏览器网络 200。
- `pnpm install --frozen-lockfile` 从锁文件重装成功；Vitest 4.1.12 + minimatch 11.0.3 override；`pnpm audit` 与 `--prod` 均为 0。
- 测试 67、构建 76、原始 HTML SHA-256 未变；最终结论有条件通过，见 `docs/FINAL_ACCEPTANCE.md`。

## Stage 7 交付

- `SettingsPage.vue` + `SettingToggle.vue` 完整复刻两张设置卡片、三行开关、版本与检查更新。
- `types/settings.ts` + `mocks/settings.ts`：三个默认 true 设置、`v2.4.0-release`、更新提示文案；版本不依赖 package.json。
- 设置状态复用既有 Pinia store；未新建重复全局状态；三个开关独立、跨 Tab 保持、刷新恢复默认、无 localStorage。
- 开关补充 `role="switch"` / `aria-label` / `aria-checked` 与仅键盘聚焦的 focus ring；支持 Space。
- 检查更新复用 AppToast 显示「已是最新版本！」，不调用 API；原版 alert 的交互差异已记录。
- 设置页五宽度全开/全关对照完成，平均像素差 0.25–0.70，几何一致；证据在 `docs/verification/stage7/`。
- 测试 59 → 67；构建模块 73 → 76。

## Stage 6 交付

- `ToolsPage.vue` + `RuleOption.vue` 完整复刻工具页三段规则、小工具双列卡片、禁用「更多工具」。
- 规则复用 Pinia `currentRule` / `setCurrentRule()`；默认 tail、互斥、可取消为 null；首页文案实时同步，切页保持。
- `types/tools.ts` + `mocks/tools.ts`：原版 8 名玩家完整昵称、规则选项、`TeamPlayer` / `TeamSplit`；名单独立于结算 6 人 fixture。
- `teamRandomizer.ts`：Fisher–Yates，前 4 名 A 组、后 4 名 B 组；不修改原数组；`Asia/Shanghai` 时间格式化。
- `useTeamShuffle.ts`：3 秒倒计时、50ms 洗牌、结束揭晓、时间戳、重复开始守卫与 `dispose()`。
- `TeamDrawer.vue`：全屏遮罩/模糊、480px 居中、底部抽屉、A 蓝/B 红、关闭锁、结果保留、复制图片。
- 分组图片复用 `image.service.ts`，只截取 `#teamCaptureArea`；真实剪贴板成功、下载降级、失败恢复、并发守卫均实测。
- 五宽度 × 四状态视觉对照完成，保存真实 880×570 分组 PNG，详见 `docs/verification/stage6/`。
- 测试总数 46 → 59；构建模块 63 → 73。

## Stage 5 交付

- `MatchDetailPage.vue` + `RedPacketNotice` / `SettlementPlayerRow` / `SettlementTeamSection` / `SettlementRanking` 完整复刻结算 UI。
- `types/match-detail.ts` + `mocks/match-detail.ts`：6 名玩家、队伍、红包、统计、评分与排名逐项一致；共享静态 fixture 标注 `isSharedFixture`。
- 分组与全局共用同一份 `players`；队伍总 KDA 由 KDA 求和；全局按 rank 排序。
- `image.service.ts`：PNG Blob 生成、剪贴板、下载降级、错误与结果返回；页面层只处理状态和 Toast。
- 截图只包含 `#screenshot-area`；真实剪贴板成功、下载降级、失败恢复与并发守卫均已实测。
- 两种布局、五宽度视觉对照完成，详见 `docs/STATUS.md` 与 `docs/verification/stage5/`。

## Stage 4 交付

- `HistoryPage.vue` + `MatchHistoryCard.vue` 完整复刻筛选栏、提示条、刷新按钮与 7 条战绩卡片。
- `types/history.ts` + `mocks/history.ts`：原始顺序、英雄、胜负、KDA、时间、好友标记完全一致；稳定 ID `match-001`–`match-007`。
- 头像本地化到 `src/assets/champions/`，不依赖外部图片 CDN。
- 筛选由 Pinia 状态 + `computed` 实现；刷新 800ms 动画有重复点击守卫；点击卡片记录 ID 并进入 `match-detail`。
- Font Awesome 改为最低优先级 vendor 层，恢复 Tailwind 图标行高覆盖关系。
- 五宽度视觉对照、筛选/刷新/导航/滚动交互回归已完成。

## Stage 3 交付

- `HomePage.vue` 完整复刻 `#page-home` 布局、间距、颜色、图标、按钮反馈。
- 首页数据来自 `types/home.ts` + `mocks/home.ts` + Pinia `homeView`，不在页面硬编码重复业务状态。
- 规则文本随共享 `currentRule` 响应式更新。
- 首页按钮接入既有导航；`match-detail` 已在阶段五迁移。
- 五宽度视觉对照与交互回归已完成。

## Stage 2 交付

- 设计系统：480px 视口、径向暗色背景、紫 / 青 / 玫瑰、玻璃卡片、安全区、滚动区、全部原版动画。
- 组件：`AppShell`、`AppHeader`、`BottomNavigation`、`ConnectionScreen`、`AppToast`、阶段占位组件。
- 状态：Pinia 管理连接阶段、当前 Tab、详情展开、Toast、连接定时器。
- 未迁移页面显示明确占位，不伪造完整页面，不删除原始参考源码。

## 视觉验收基准

同浏览器、同窗口宽高（320 / 375 / 390 / 430 / 480px 宽）、同字体和演示数据比较截图；动态内容与动画需冻结后比较。重点比较元素定位、背景、圆角、颜色、图标、滚动与抽屉层级。测试不得以只看代码替代实际截图。

## 不在本阶段

阶段 10.1 不包含真实 LCU 实机验证、gameflow/房间、战绩、红包、写操作、Windows 构建、托盘/Updater、自动更新与真实游戏测试。
