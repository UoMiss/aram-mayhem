# ARAM: Mayhem — 阶段八 / 8.2 最终验收报告

日期：2026-11-01  
结论：**阶段八总体有条件通过；阶段 8.2 中文资源化通过**

## 1. 验收范围

阶段八不开发新业务功能，只对阶段一至七的 Vue 3 工程做完整回归、必要修复、工程配置收尾和文档归档。阶段 8.2 追加 Vue I18n 中文资源化，只替换文案来源，不改变 UI、数据或截图行为；随后完成开发依赖安全升级，`pnpm audit` 归零。

原始 HTML `references/deepseek.original.html` 作为唯一 UI 基准，SHA-256 保持：

`6197327909428f19baca483aa8ec9de170bfa8a34bf88e9d2db4b7546fbecd9e`

未接入真实 LCU API、Tauri、Rust、数据库、系统开机启动或真实更新服务。

## 2. 最终工程状态

- Vue 3 + TypeScript + Vite + Tailwind CSS 4 + Pinia + Vue I18n + Font Awesome + html2canvas-pro。
- 依赖与命令统一使用 pnpm 10.34.9。
- 所有原始页面已完成：未连接、应用壳、首页、战绩、结算、工具/随机分组、设置。
- 阶段 8.2 只注册唯一 `zh-CN` 语言包，无英文包/语言切换；UI 文案集中管理。
- 测试：13 个测试文件 / 70 个测试全部通过。
- 构建：96 个模块，生产构建成功。
- 类型检查、ESLint、全仓 `pnpm format:check` 通过。
- 原始 HTML SHA-256 未变化。
- 真实三张 PNG 样例已归档到 `docs/verification/stage8/` 与 `docs/verification/stage8.2/`；i18n 后分组/全局 PNG 字节完全一致。

## 2.1 阶段 8.2 中文资源化

- `vue-i18n@11.4.16`，仅 `zh-CN`；`src/i18n/locales/zh-CN.ts` 唯一语言包。
- 公共 UI、首页、战绩、结算、工具、抽屉、设置、Toast/aria 全部资源化。
- Pinia/Mock 删除重复显示 label；业务数据（玩家、英雄、KDA、数值、ID、时间、队列、版本）保持。
- 8 个静态状态与阶段八 Vue 基线逐像素 0 差异；随机分组完成态仅随机玩家不同。
- 分组/全局 PNG 与阶段八样例 SHA-256/字节完全一致；随机分组 880×570 一致。
- 实施/映射：[ZH_CN_I18N_MIGRATION.md](ZH_CN_I18N_MIGRATION.md)；证据：[stage8.2](verification/stage8.2/README.md)。

## 3. 命令与实际结果

| 命令                             | 结果                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 首次无 TTY 时因 pnpm 安全清理确认而中止；`CI=true pnpm install --frozen-lockfile` 从锁文件重装 257 包成功，锁文件未变 |
| `pnpm check:baseline`            | 通过                                                                                                                  |
| `pnpm typecheck`                 | 通过                                                                                                                  |
| `pnpm lint`                      | 通过                                                                                                                  |
| `pnpm format:check`              | 修复后通过                                                                                                            |
| `pnpm test`                      | 通过，13 文件 / 70 测试                                                                                               |
| `pnpm build`                     | 通过，96 模块                                                                                                         |
| `pnpm check`                     | 通过                                                                                                                  |
| `pnpm audit`                     | 0 漏洞，退出码 0                                                                                                      |
| `pnpm audit --prod`              | 0 个生产依赖漏洞                                                                                                      |

首次 `pnpm install --frozen-lockfile` 中止不是锁文件冲突，而是现有 `node_modules` 的 store 元数据指向旧临时 store，pnpm 想清理且无 TTY 确认。CI 模式重装成功，证明锁文件可复现安装。

## 4. 全仓格式检查修复

初始 `pnpm format:check` 报告 6 个文件：

- `.vscode/extensions.json`
- `pnpm-lock.yaml`
- `src/assets/styles/theme.css`
- `tsconfig.app.json`
- `tsconfig.json`
- `tsconfig.node.json`

处理：

- 格式化 `.vscode/extensions.json`、三个 tsconfig 和 `theme.css`。
- 将自动生成的 `pnpm-lock.yaml` 加入 `.prettierignore`，理由：由 pnpm 维护，强制 Prettier 改写会产生无意义锁文件 churn。
- 将 pnpm 本地内容寻址 store `.pnpm-store/` 加入 `.prettierignore` 和 `.gitignore`；它是生成物，不属于源码。
- 未忽略 `src/`、测试、文档或组件目录。
- 原始 HTML 继续排除。
- 修复后 `pnpm format:check` 通过。

## 5. Favicon 404 修复

- 原因：`index.html` 没有 `<link rel="icon">`，浏览器请求 `/favicon.ico` 得到 404。
- 修复：新增本地 `public/favicon.svg`，并在 `index.html` 声明 SVG icon。
- 实测浏览器只请求 `/favicon.svg`，返回 200 `image/svg+xml`，无 `/favicon.ico` 请求，无控制台错误。
- 未改变页面布局或 UI 设计。

## 6. 依赖安全审计

`pnpm audit`：**No known vulnerabilities found**。  
`pnpm audit --prod`：**No known vulnerabilities found**。

阶段八遗留的开发依赖告警已处理：

- `vitest` 3.2.7 → **4.1.12**：修复 vitest / @vitest/mocker 告警，并移除旧 tinypool 1.1.1 依赖链。
- `pnpm.overrides.minimatch = 11.0.3`：将 ESLint / TypeScript ESLint 传递的 minimatch 3.1.5 与 10.2.6 统一到已修复版本。
- ESLint 9.39.5 保持不升级；`pnpm lint` 在 minimatch 11 override 下通过。
- 未使用 `pnpm audit --fix`、`--force` 或破坏性升级命令。
- 升级后 `pnpm typecheck`、`pnpm lint`、`pnpm test`（70）、`pnpm build`（96 模块）、`pnpm format:check`、`pnpm check` 与冻结锁安装全部通过。

## 7. 功能回归

已实际验证：

- 未连接页 → 模拟连接 → 首页 → 刷新回未连接 → 重新连接。
- 首页三个按钮：上一局打开结算、历史对局打开战绩、设置打开设置。
- 7 条战绩、全部/hex/custom 筛选（7/5/2）。
- 刷新按钮：`aria-busy=true`、旋转动画、800ms 后恢复，7 条数据不变。
- 任意战绩卡片打开结算；`selectedMatchId` 保留（实测 `match-005`）。
- 结算分组/全局视图；返回首页。
- 工具页规则互斥、全部取消、首页文案同步。
- 随机分组：3 秒倒计时、关闭锁、重复开始锁、8 人唯一、A/B 4+4、北京时间、关闭重开保留结果。
- 设置默认 true、独立切换、Tab 保持、刷新恢复默认、检查更新 Toast。
- 多页面连续操作后，规则、筛选、`selectedMatchId`、设置状态与底部导航一致。

浏览器无应用脚本错误；仅历史阶段曾出现 favicon 404，已修复。

## 8. 视觉回归

覆盖：

- 320×568
- 375×812
- 390×844
- 430×932
- 480×900

状态：

- 未连接、首页、战绩、结算分组、结算全局、工具、分组抽屉初始、分组抽屉完成、设置。

结果：

- 顶部栏、主区、底部导航、页面卡片、筛选栏、结算区域、抽屉根节点/遮罩/内容、设置卡片位置尺寸一致。
- 五宽度均无横向溢出。
- 主内容滚动行为与原始一致；固定底栏和抽屉层级正确。
- 静态状态平均像素差 0.17–1.75；主要来自字体抗锯齿、颜色空间、Font Awesome 字形。
- 随机分组完成态 2.35–4.90，主要来自随机玩家排列不同；时间已固定为同一 `2026/11/01 15:04:05`。
- 未连接页倒计时截图曾出现 3 秒 vs 5 秒，是截图时机造成的动态值差异；最终证据在同为初始 5 秒状态重拍。
- 工具页 tail 默认选中态通过原始 `simulateConnect()` 的 `updateRuleUI('tail')` 对齐，没有修改数据或隐藏元素。

已知视觉差异：

- 原版分组抽屉初始状态硬编码 `翻斗花园牛...`；Vue 保留完整昵称并用 `truncate`，在 480/320 单元格可容纳时显示全名。未修改 Mock 数据。
- 结算复制按钮 copy 图标因 Font Awesome 6.7.2 与 6.4.0 存在约 2px 字形宽度差。
- 设置页增加 `role="switch"`、`aria-label`、`aria-checked` 和键盘 focus ring，属于可访问性增强。
- 原版检查更新 `alert`；Vue 使用非阻塞 AppToast，文案一致、布局不变。

证据：`docs/verification/stage8/`（90 张逐宽度截图、9 张 480 对照、9 张五宽度总览、`visual-metrics.json`）。

## 9. 截图服务专项验收

三张真实导出：

| 文件                             |     尺寸 | 结果                                           |
| -------------------------------- | -------: | ---------------------------------------------- |
| `match-detail-group-export.png`  | 896×1894 | 完整分组结算，无顶栏/底栏/复制按钮             |
| `match-detail-global-export.png` | 896×1696 | 完整全局排行，无顶栏/底栏/复制按钮             |
| `team-random-export.png`         |  880×570 | A/B 两队、8 人、北京时间，无抽屉标题/按钮/遮罩 |

实测：

- 结算两种布局都能生成完整 PNG；长内容未被子滚动容器裁剪。
- 组队完成状态生成完整 PNG；图片只包含 `#teamCaptureArea`。
- 中文、头像、统计条、背景、两队颜色均正常。
- 真实剪贴板成功：Toast「截图已复制到剪贴板」，`navigator.clipboard.read()` 读回 `image/png`，324,272 bytes。
- 下载降级：禁用 `ClipboardItem` 后实际下载三张 PNG，Toast 正确。
- 失败：强制 `canvas.toBlob(null)`，Toast「分组图片生成失败，请重试」，按钮恢复。
- 并发：延迟剪贴板 900ms，连续点击两次，仅 1 次 `clipboard.write`，期间「生成中...」且 disabled。
- 组件销毁：`useTeamShuffle` 的 `dispose()` 清空计时器；结算/分组图片服务不保留无效全局状态。
- 外部应用粘贴（微信/QQ）**未做人工验收**；浏览器剪贴板自动化测试不能替代。

## 10. 代码质量审查

- 单一 Pinia app store 管理连接、导航、首页、战绩、结算选择、工具规则和设置；未创建重复全局事务状态。
- 组件通过 props/emits/ref/computed 管理交互；无内联 onclick，无 `getElementById` 改页面状态。
- v-for key 使用稳定 ID（match/player/rule/filter）。
- 定时器清理：连接、Toast、History 刷新、Team shuffle 均有清理；TeamDrawer 通过 `onUnmounted(dispose)` 释放。
- 异步复制有 `isCopying` 守卫和 finally 恢复。
- 截图服务边界：`image.service.ts` 统一生成/剪贴板/下载，页面只传 ref 和处理 Toast。
- Mock 与 UI 分离；结算共享 fixture 标记 `isSharedFixture`；工具 8 人独立于结算 6 人；设置为内存 Mock。
- 图片/字体/图标本地化；无 CDN 运行时依赖。
- `ModulePlaceholder.vue` 已无页面引用，未删除；建议阶段九归档或移除。

## 11. 已知问题与未验证项

1. 微信/QQ 等外部应用剪贴板粘贴未人工验收。
2. 真机刘海/底部 Home Indicator 安全区未人工验收；headless 环境安全区为 0。
3. 分组抽屉初始长昵称显示全名，与原版硬编码截断不同；这是保留完整 Mock 数据的有意选择。
4. 随机分组结果和最终时间天然动态；视觉像素差不能用于要求随机结果相同。
5. `ModulePlaceholder.vue` 无引用，待归档。
6. 真实 LCU/Tauri/Rust/数据库/自动更新未实现，属于后续阶段。

## 12. 最终结论

**有条件通过。**

通过条件：

- 全部原始页面已迁移。
- 自动化测试、类型检查、Lint、生产构建、格式检查、原始 HTML 基线检查全部通过。
- 五种尺寸全页面回归无非预期横向溢出，主要布局一致。
- 两种结算视图与随机分组 PNG 实际导出正常，剪贴板/下载/失败/并发路径实测。
- 三张真实 PNG 与全页面截图归档。

条件/保留项：

- 外部应用粘贴、真机安全区未人工验收。
- 长昵称与原版硬编码截断差异、Font Awesome 字形差异等已知非阻断差异已记录。

## 13. Tauri + Rust + LCU 后续技术准备建议

1. **Service 边界先稳定**  
   保持 `image.service.ts`、Mock、Pinia 视图模型不变；新增 `lcu.service.ts` / `app.service.ts` 接口，由浏览器 Mock 实现切换到 Tauri IPC 实现，页面不直接调用 LCU。

2. **Tauri v2 + Rust 命令层**  
   Rust 侧负责 LCU 进程发现、端口/证书读取、HTTP/WebSocket、重连与错误归一化；前端只接收类型化事件和命令结果。禁止前端直接访问 LCU 凭据。

3. **类型与错误契约**  
   在 `src/types/` 为 LCU 连接状态、房间、对局、错误码定义 DTO；Rust 与 TypeScript 使用同一份契约生成或手写校验。保留当前 Mock/共享 fixture 作为离线 UI 测试。

4. **桌面能力**  
   真实开机启动、托盘、提示音、Tauri Clipboard、Updater 都应通过 Tauri 插件/命令接入；本次设置页三个开关目前只是内存演示，接入时需明确平台权限和失败反馈。

5. **安全与发布**  
   使用 Tauri 官方能力白名单、最小权限、证书/凭据不入库；Windows 代码签名、自动更新签名、安装包、崩溃日志与版本策略单独立项。

6. **测试策略**  
   保留现有 70 个前端测试和视觉证据；新增 Rust 单元/集成测试（LCU 假服务）、Tauri IPC contract test、桌面端端到端测试；先以本地 Mock LCU server 验证，再接真实客户端。

7. **实施顺序**  
   先只读连接/状态，再房间/对局事件，最后设置持久化与自动更新；不要在渲染层直接引入 LCU HTTP 调用。
