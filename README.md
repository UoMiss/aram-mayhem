# 海克斯大乱斗 · ARAM: Mayhem

**Phase 10.2：LCU Gameflow 监听 / 房间 / 选英雄快照**

在阶段九 Tauri 桌面上新增 Rust LCU 发现、只读 HTTPS 探测、连接状态机、单任务自动重连、Tauri IPC/Event 和浏览器 Mock/Tauri 真实来源隔离。macOS 明确返回 `unsupported_platform`，不伪造真实客户端；Windows CI 已通过编译、27 Rust 测试和 NSIS 构建，真实 Windows 桌面/LCU 仍未验收。

Windows CI 已通过：90 前端测试、47 Rust 测试、Windows MSVC 编译与 NSIS Artifact 均成功；真实 Windows 10/11 桌面和真实 LCU 仍待验收。原有浏览器视觉、i18n 和 75 测试基线保持，当前达到 **90 个前端测试 / 106 个构建模块 / 47 个 Rust 测试**。详见 [阶段 10.2 实施记录](docs/PHASE10_2_GAMEFLOW.md)、[阶段 10.1.5 CI 记录](docs/PHASE10_1_5_WINDOWS_CI.md)、[阶段 10.1 实施记录](docs/PHASE10_1_LCU_FOUNDATION.md) 与 [i18n 实施记录](docs/ZH_CN_I18N_MIGRATION.md)。

当前结算数据是一份标注为 `isSharedFixture` 的静态示例，不冒充七场历史战绩各自的真实结算；`selectedMatchId` 仅保留导航上下文。设置页三个开关为内存演示状态，不接入操作系统、LCU 或真实音效。

## 1. 在 Mac 上运行

安装 Node.js 22 LTS（项目要求 >=20.19），进入项目目录：

```bash
cd /你的路径/aram-mayhem-vue3-pnpm
corepack enable
pnpm install
pnpm dev
```

打开终端显示的地址（固定为 `http://127.0.0.1:1420/`；Vite 配置了 `strictPort`，端口被占用会直接失败而不是自动换端口）。

演示流程：

1. 未连接页点击「重新连接」进入首页。
2. 点击首页「上一局」或进入战绩页点击任意卡片，打开对局结算。
3. 默认显示「分组模式」；点击「全局排行」切换为 6 人排名列表，再切回分组模式。
4. 滚动到底部点击「复制截图」：
   - 支持剪贴板时写入 PNG 并提示「截图已复制到剪贴板」。
   - 剪贴板不可用/失败时自动下载 PNG 并提示「截图已生成并自动下载」。
   - 截图只包含 `#screenshot-area`，不包含顶部导航、底部导航和复制按钮。
5. 顶部返回按钮回到首页；底部导航在结算态继续高亮「战绩」。
6. 进入「工具」页：
   - 默认选中「伤害尾数规则」；点击任一规则切换，再次点击当前规则全部取消，首页显示「未选择规则」。
   - 点击「随机分组」打开抽屉；「开始分组」后倒计时 3 秒，期间禁止关闭、重复分组和复制。
   - 完成后显示 A/B 两组、北京时间与「重新分组」；关闭再打开保留结果。
7. 分组完成后点击「复制图片」：
   - 优先复制 `#teamCaptureArea` 的 PNG；失败时自动下载。
   - 截图只包含两队、玩家与时间，不包含遮罩、标题、关闭按钮或底部操作按钮。
8. 进入「设置」页：
   - 三个开关默认开启，可独立切换；切换 Tab 后保持，刷新恢复 Mock 默认值。
   - 支持鼠标与 Space 键盘操作；每个开关有可访问名称与 `aria-checked` 状态。
   - 点击「检查更新」使用现有 AppToast 显示「已是最新版本！」，不调用真实更新 API。
9. 刷新页面可回到未连接页重新测试连接。

### 桌面模式（macOS）

```bash
# 本工作区使用本地 Rust 工具链；普通 macOS 安装 Rust 后无需 source
source .cargo/env
export RUSTUP_HOME="$PWD/.rustup" CARGO_HOME="$PWD/.cargo"

pnpm tauri dev     # Vite 1420 + 原生 Tauri 窗口
pnpm tauri build   # 生成 src-tauri/target/release/bundle/macos/ARAM Mayhem.app
```

Tauri dev/build 的 `beforeDevCommand`/`beforeBuildCommand` 均使用 `pnpm`。浏览器模式与 Tauri 模式使用同一份 Vue 页面和 Mock 数据；桌面模式额外静默调用 `app_health_check`、LCU 状态命令/事件，不增加可见 UI；macOS 的 LCU 状态应为 `unsupported_platform`。

## 2. 验收命令

```bash
pnpm install --frozen-lockfile # 验证锁文件可复现安装
pnpm check:baseline            # 核对原始 HTML 未被修改
pnpm typecheck                 # Vue + TypeScript / Vite 配置类型检查
pnpm lint                      # ESLint
pnpm format:check              # 全仓 Prettier 检查
pnpm test                      # Vitest（90 个测试）
pnpm build                     # 类型检查 + 生产构建（106 模块）
pnpm check                     # baseline + typecheck + lint + test + build
pnpm audit                     # 开发+生产依赖审计（当前 0 漏洞）
pnpm audit --prod              # 生产依赖审计（当前 0）
pnpm tauri dev                 # Tauri 桌面开发窗口
pnpm tauri build               # macOS .app 生产构建
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

`pnpm install --frozen-lockfile` 在无 TTY 环境首次会要求确认清理旧 `node_modules`；CI 环境可用 `CI=true pnpm install --frozen-lockfile` 从锁文件重装。

本阶段实际执行结果见 `docs/STATUS.md`；阶段九桌面环境见 `docs/PHASE9_TAURI_INTEGRATION.md`；LCU 架构/风险见 `docs/PHASE10_1_LCU_FOUNDATION.md`。

## 3. 阶段十.1：LCU 连接基础

- Rust 模块：`lcu/discovery`、`client`、`connection`、`monitor`、`models`、`error`；命令 `lcu_get_connection_status`/`lcu_start_monitoring`/`lcu_stop_monitoring`；事件 `lcu://connection-status`。
- 发现：Windows `LeagueClientUx.exe` + lockfile/PID 校验；非 Windows 返回 `unsupported_platform`，不发起网络请求。
- 只读：专用 loopback HTTPS client，仅 `GET /riotclient/region-locale`；自签名证书策略隔离在专用 connector。
- 状态机：`not_running/discovering/connecting/connected/disconnected/reconnecting/error`；含 revision、updatedAt、generation。
- 监控：单任务、2s 正常轮询、500ms–5s 退避、停止/应用退出清理；旧异步结果不可覆盖新状态。
- 前端：`types/lcu.ts`、`services/lcu.service.ts`、browser/tauri adapters、Pinia `lcuStatus`；App 启动静默订阅/获取/启动，无 UI 改动。
- 测试：82 前端 / 106 构建模块 / 27 Rust；Tauri dev/release 在 macOS 实测 `UnsupportedPlatform/Unavailable`。
- Windows GitHub Actions 已通过：MSVC check、27 Rust 测试、NSIS 构建和 Artifact 上传；真实 Windows 10/11 桌面与真实 LCU 仍未验收。
- 成功 Run `41294166671`；Workflow：`.github/workflows/windows-release.yml`（手动）+ `.github/workflows/windows-validation.yml`（push/manual）；Artifact `aram-mayhem-windows-x64`。

## 3.1 阶段九：Tauri 2 + Rust

- `@tauri-apps/api` / `@tauri-apps/cli` 2.12.4；Rust tauri 2.12.5、tauri-build 2.7.4、Rust 1.99.1。
- `src-tauri/`：`main.rs`/`lib.rs`/`commands/app.rs`、`tauri.conf.json`、`capabilities/default.json`、品牌 icons。
- 窗口标题 `ARAM: Mayhem`，480×900，最小 320×568；原生装饰、非透明、可调整大小。
- Vite 与 Tauri devUrl 统一为 `http://127.0.0.1:1420`，`strictPort: true`；前后置命令均为 pnpm。
- IPC：`app_health_check` 返回 `{status,runtime,appName,appVersion,platform,simulated}`；Rust `AppHealth`/前端 `AppHealth` 类型一致。
- 前端适配层：`browser.adapter` / `tauri.adapter` / `app.service`；`App.vue` 启动时静默探测，无测试按钮、无页面改动；Tauri adapter 动态加载。
- Rust 错误只返回 `{code,message}`，前端转换为 `DesktopServiceError`，不暴露堆栈。
- CSP + 仅 `core:default` capability；无 Shell/FS/HTTP、Tauri Clipboard、Updater 或真实 LCU。
- 验证：75 前端测试、103 构建模块、3 Rust 测试、`cargo check`、`cargo fmt`、`pnpm tauri dev`、`pnpm tauri build` 全部通过；release `.app` 约 10.57 MiB。
- macOS 沙箱限制：完整 Xcode 未安装、DMG 的 `hdiutil` 被拒、桌面截图/剪贴板自动化无权限；详见阶段九文档。

## 3.2 阶段八 / 8.2 完成内容

- 阶段 8.2：安装 `vue-i18n@11.4.16`，仅注册 `zh-CN`；新增 `src/i18n/index.ts`、`locales/zh-CN.ts`、`labels.ts`。
- 公共 UI、首页、战绩、结算、工具、抽屉、设置、Toast 与无障碍文案全部迁移；组件统一 `useI18n({ useScope: 'global' })`。
- Pinia/Mock 只保留业务值与数据；删除 `currentRuleLabel`、`connectionStatusLabel`、`homeView.ruleLabel`、`copy`、统计/队伍/设置显示 label 等重复文案。
- 玩家昵称、英雄、KDA、评分、排名、数值、战绩 ID、规则 ID、相对时间、队列名、版本号保持数据型文本。
- i18n 后 8 个静态状态与阶段八 Vue 基线逐像素 0 差异；分组/全局 PNG 与阶段八样例字节完全一致。
- 测试 67 → 70（新增 i18n 资源/插值测试）；构建 76 → 96 模块。
- 阶段八最终视觉回归证据在 `docs/verification/stage8/`；i18n 对照证据在 `docs/verification/stage8.2/`。
- 完成 9 个状态 × 5 个尺寸 × 原始/Vue 的最终视觉回归。
- 三张真实 PNG：分组结算 896×1894、全局排行 896×1696、随机分组 880×570；均不包含顶栏/底栏/操作按钮。
- 真实剪贴板成功、下载降级、生成失败、并发守卫均已实测；三张样例已归档。
- 修复全仓 `pnpm format:check`：格式化 `.vscode/extensions.json`、tsconfig 与 `theme.css`；仅忽略 pnpm 生成的锁文件和本地 store，未忽略源码目录。
- 修复 `/favicon.ico` 404：新增本地 `public/favicon.svg` 与 `<link rel="icon">`，浏览器实测返回 200 且无 404。
- `pnpm audit` 与 `pnpm audit --prod` 均为 0；Vitest 升级到 4.1.12，并通过 `pnpm.overrides` 将 minimatch 固定为 11.0.3。
- 开发依赖安全：Vitest 3.2.7 → 4.1.12；`minimatch` override 11.0.3；`pnpm audit` / `--prod` 均为 0。
- 阶段 8.2 最终测试 13 文件 / 70 测试；构建 96 模块；原始 HTML SHA-256 未变化。
- 阶段八未新增页面/业务功能；阶段 8.2 仅新增 `vue-i18n` 与 i18n 资源，未新增业务 Mock。
- 最终验收结论：**有条件通过**，仅剩外部粘贴/真机安全区未人工验收；依赖审计已归零。

## 3.3 阶段七完成内容

- `src/features/settings/SettingsPage.vue`：完整迁移两张设置卡片、三行开关、版本与检查更新按钮。
- `SettingToggle.vue`：原版 44×24 开关、紫色选中、白色滑块、分隔线与 hover；补充 `role="switch"`、`aria-label`、`aria-checked` 和仅键盘聚焦时出现的 focus ring。
- `src/types/settings.ts`：`SettingKey` / `SettingsFlags`；显示文案由 i18n 提供。
- `src/mocks/settings.ts`：三个默认 true、设置 key 顺序、`v2.4.0-release` 与默认值工厂。
- 设置状态复用既有 Pinia store，未新建重复全局状态；三个开关独立、跨 Tab 保持、刷新恢复默认，无 localStorage。
- 「检查更新」复用 AppToast 显示「已是最新版本！」；不调用 API、不下载、不接入 Tauri Updater。原版为 `alert`，这是唯一交互差异，页面布局不变。
- 未添加重置按钮、额外设置项、系统开机启动、音效播放或真实平台行为。
- 新增设置 State/Mock/SSR 测试，测试总数从 59 增加到 67；构建模块 73 → 76。
- 完成 320 / 375 / 390 / 430 / 480px、开关全开/全关对照；页面与原始 HTML 几何一致，无横向溢出。

## 3.4 既有页面

- 未连接页、应用壳、顶栏、底部导航（阶段 2）。
- 首页、首页 Mock/规则状态（阶段 3）。
- 战绩页、7 条战绩、筛选、刷新与详情选择（阶段 4）。
- 结算页、分组/全局排行、共享静态 fixture 与截图复制（阶段 5）。
- 工具页、三种规则、8 人随机分组、3 秒洗牌与分组图片复制（阶段 6）。

## 4. 尚未完成 / 后续阶段

- 真实 LCU 客户端连接（Windows 实机）、Windows 安装包、数据库、托盘/开机启动、真实更新与桌面签名/公证（阶段十.2 及以后）。
- 全量业务 Mock 与 Service 接口。
- 微信/QQ 等外部应用剪贴板粘贴人工验收；真机刘海/Home Indicator 安全区验收。
- shadcn-vue 默认组件仍按需引入，未覆盖原版视觉。
- `ModulePlaceholder.vue` 已无页面引用，待归档/删除决策。
- 当前只有 `zh-CN`，不提供语言切换；未来多语言需另立阶段。

阶段七/八/九刻意未实现真实客户端数据、真实更新检查、系统开机启动或音效播放；设置开关仅为内存演示状态，Tauri 仅提供桌面壳与健康检查 IPC。

## 5. 主要目录

```text
references/deepseek.original.html     只读设计基线（不可修改）
src/App.vue                           未连接页 / 应用壳切换
src/features/connection/              未连接页（阶段 2）
src/features/home/HomePage.vue        已连接首页（阶段 3）
src/features/history/                 战绩页面与卡片（阶段 4）
src/features/match-detail/            结算页面与子组件（阶段 5）
src/features/tools/                   工具页、规则、算法、动画控制、随机分组抽屉（阶段 6）
src/features/settings/                设置页、设置开关（阶段 7）
src/i18n/                             唯一 zh-CN 资源、初始化与 key 映射（阶段 8.2）
src/services/image.service.ts         结算/分组截图生成 / 剪贴板 / 下载服务
src/services/app.service.ts           浏览器/Tauri 运行时选择与健康检查
src/services/lcu.service.ts           LCU 状态 / Gameflow 的浏览器/Tauri 选择
src/types/lcu.ts                      LCU 状态 / Gameflow / Lobby / ChampSelect 契约
src/adapters/                         browser / tauri 桌面与 LCU adapter
src/adapters/                         browser / tauri 桌面适配器
src/types/desktop.ts                  AppHealth / DesktopAdapter 契约
src-tauri/                            Tauri 2 + Rust 桌面工程
src/types/*.ts                        首页 / 战绩 / 结算 / 工具 / 设置类型
src/mocks/*.ts                        首页 / 战绩 / 共享结算 / 8 人分组 / 设置 Mock
src/assets/champions/                 本地英雄头像
src/components/layout/                AppShell、顶栏、底部导航
src/components/feedback/              Toast
public/favicon.svg                    本地 favicon
src/assets/styles/theme.css           设计变量、480px 视口、玻璃卡片
src/assets/styles/effects.css         原版动画与弹层过渡
src/stores/app.ts                     Pinia 连接 / 导航 / 首页 / 战绩状态
docs/MIGRATION_PLAN.md                逐页面迁移清单
docs/STATUS.md                        完成度与实际验证状态
docs/FINAL_ACCEPTANCE.md              阶段八最终验收、审计与 Tauri/Rust/LCU 建议
docs/PHASE9_TAURI_INTEGRATION.md      阶段九 Tauri/Rust 结构、IPC、测试与限制
docs/PHASE10_1_LCU_FOUNDATION.md      阶段 10.1 LCU 发现、状态机、安全与限制
docs/PHASE10_1_5_WINDOWS_CI.md        阶段 10.1.5 Windows CI/NSIS 结果与 Artifact
docs/PHASE10_2_GAMEFLOW.md             阶段 10.2 Gameflow/Lobby/ChampSelect/会话与事件
docs/ZH_CN_I18N_MIGRATION.md          阶段 8.2 文案映射、职责调整与验收
docs/verification/stage8/             全页面五宽度、三张真实 PNG 与审计证据
docs/verification/stage8.2/           i18n 后五宽度、PNG 与基线差异
```

## 6. pnpm 与依赖说明

- 项目固定 pnpm 10.34.9，只维护 `pnpm-lock.yaml`；禁止混用 npm / yarn。
- `pnpm-workspace.yaml` 显式批准 esbuild 安装脚本。
- Font Awesome 由本地依赖加载，并通过 `layer(vendor)` 保持 Tailwind 工具类覆盖关系。
- `html2canvas-pro` 固定为 `2.5.0`（支持 Node >=16；`2.6.0` 要求 Node >=24）。
- `vue-i18n` 固定为 `^11.4.16`；只注册 `zh-CN`，无英文包或语言切换。
- `@tauri-apps/api` 2.12.4（运行时）与 `@tauri-apps/cli` 2.12.4（开发）；Rust 依赖见 `src-tauri/Cargo.toml`/`Cargo.lock`。
- Rust LCU：`reqwest` 0.13（rustls）、`tokio`、`async-trait`；Windows 专用 `sysinfo` 0.40。LCU 认证只保留在 Rust 内存，不写入前端/日志/仓库。
- Tauri 仅启用 `core:default` capability；未启用 Shell/FS/HTTP、Clipboard 插件、Updater 或自动更新。
- macOS app 当前 bundle target 为 `app`；DMG 在当前沙箱被 `hdiutil` 拒绝，Windows target 未配置。
- 结算与分组截图只使用浏览器 Clipboard API 与下载兜底，不接入 Tauri Clipboard 插件。
- `references/deepseek.original.html` 是设计真值，任何阶段都不得覆盖或删除。
- 8 人随机分组名单保留完整昵称；初始网格使用 `truncate`，不把 `...` 写进数据。原版初始网格中的 `翻斗花园牛...` 是硬编码截断，Vue 版本在单元格能容纳时显示全名。
- 设置页版本固定为演示文案 `v2.4.0-release`，不随包版本自动变化；三个开关刷新后恢复默认，不做 localStorage。
- `pnpm-lock.yaml` 与 `.pnpm-store/` 是生成物，已在 `.prettierignore` 中排除；`.pnpm-store/` 同时加入 `.gitignore`。未忽略源码目录。
- 安全：Vitest 4.1.12 修复 tinypool/vitest/mocker 告警；`pnpm.overrides.minimatch = 11.0.3` 修复 ESLint/TypeScript ESLint 传递依赖；`pnpm audit` 与 `--prod` 均为 0。
- 外部应用粘贴、真机安全区仍未人工验收。
- Tauri WebView 内的剪贴板/下载与窗口拖拽未自动化验收（macOS 屏幕录制/辅助功能权限被拒）；浏览器剪贴板与下载已实测。
- Windows Tauri 编译/安装包、真实 LCU、Tauri 托盘/开机启动/Updater 未实现。
- LCU 真实发现/连接/重连只在 Windows 客户端环境中才能最终确认；macOS 仅验证 `unsupported_platform` 与模拟状态机。
- i18n 后仍保留的硬编码中文仅为玩家/英雄/时间/队列等数据、Service 内部诊断、测试数据和注释；Vue 模板已无中文 UI 字面量。

## 阶段 10.2 结果

- 90 前端测试 / 47 Rust 测试；Windows CI Run `41312013808` 成功。
- 新增 Gameflow phase/Lobby/ChampSelect 快照、WebSocket 事件解析、1.5s 轮询 fallback、会话 generation/revision 防串局。
- macOS 明确 unavailable；浏览器显式 Mock；真实 Windows LCU 仍待实机验收。
- NSIS Artifact `aram-mayhem-windows-x64`：4,315,210 bytes，SHA-256 `e5df5ce93e184e40ba46afb7746cde697477c111b9fddc331e54237b48103342`。

## CI 构建加速

Windows CI 已拆分为 Validation 和手动 Release；热缓存 Release 4m19（基线 11m42），Release 前端只构建一次，Artifact SHA-256 `26916b588de478350d7444cc454b9a74dafcecef710e34c3d2e3ac2bcdb02f48`。详见 [CI 优化记录](docs/CI_OPTIMIZATION.md)。

## LCU 真实连接状态修复

- 浏览器继续使用 Mock；Windows Tauri 仅在 `source=real` 且 `status=connected` 时进入首页。
- 连接页 Tauri 重试调用真实监控，不再执行 1.5s Mock。
- 修复版 Windows Artifact：id `13123466431`，安装包 4,314,581 bytes，SHA-256 `14b022f98067e369849304c9d88d8d8c2b7e8e1e3dc2e0e8089213a015ab3705`。
- 详情：[LCU_CONNECTION_STATUS_FIX.md](docs/LCU_CONNECTION_STATUS_FIX.md)。
- Windows 真实客户端实机复测仍未执行，不能仅凭 CI 判定阶段 10.1 正式通过。
