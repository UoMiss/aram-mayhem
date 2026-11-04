# 开发标准问题修复与验证（2026-11-05）

本次按《Tauri 2 + Vue 3 桌面应用前端开发标准》核对后修复现有实现，不扩展真实战绩、算分或结算的业务范围。

## 已修复

- CI：Validation 增加 main 的 PR 触发；`pnpm check` 包含 Prettier；Release 显式执行 Prettier；ESLint 禁止警告。
- IPC：原生响应和事件先作为 unknown，经共享契约守卫检查；覆盖嵌套 session、Lobby、选人及玩家字段。已知业务错误保留稳定 code，丢弃原始消息；未知异常保持统一错误。
- Event：订阅失败自动重试，恢复后读取权威快照，避免漏事件；卸载时清理重试计时器，异步订阅晚到立即注销。
- Pinia：连接、首页、规则、战绩、设置、反馈、导航和桌面元信息独立持有状态。生产组件直接使用领域 Store；旧 app Store 仅作兼容门面，不再持有独立业务状态。
- UI：设置和规则共用 Reka Switch；既有颜色、阴影和层级集中映射为语义令牌，保持现有配色。键盘可见焦点、抽屉初始焦点/Tab 限制/Escape/焦点恢复、关闭时 inert 及离页释放已补齐。
- 减少动画：覆盖全部动画和伪元素，包括洗牌与扫描。
- 版本：浏览器使用 package.json 版本，桌面通过健康检查读取原生版本；顶栏和设置页共用桌面元信息 Store。检查更新不再误报“已是最新版本”。
- LCU：相同终态的重复观测保持会话与 revision；WebSocket 对同一客户端重试，重连不增加会话 generation；本地 HTTP 显式绕过系统代理。

## 契约归属与权限

- 前端 DTO：`src/types/desktop.ts`、`src/types/lcu.ts`。
- 运行时边界：`src/shared/ipc/contracts.ts`；原生命令及订阅仅在 `src/adapters/tauri.adapter.ts`。
- Rust 对应：`commands/app.rs`、`commands/lcu.rs`、`commands/gameflow.rs`、`lcu/models.rs`、`lcu/gameflow.rs`。
- 使用窗口：main。本轮未增加原生命令、文件访问、Shell 或插件权限；仍为现有只读查询及监控启停。
- 新增/修改 DTO 时同步修改类型、守卫、Rust 契约与 Adapter 测试。目前采用手工契约，尚未使用自动生成绑定。

## 验证范围

新增自动化验证覆盖 malformed IPC、业务/未知错误、部分订阅失败清理、卸载早于订阅完成、重复挂载、旧响应覆盖防护、订阅失败恢复、Store 计时器清理、开关实际交互、抽屉键盘交互，以及 Rust 终态幂等和 WebSocket 恢复。

浏览器人工复核：最新代码使用独立本地端口，确认规则互斥切换、抽屉进入/关闭后的焦点恢复、设置独立开关、顶栏和设置版本一致、更新未接入提示；未把浏览器 Mock 视为真实 LCU 连接。

本轮修复推送后，Windows CI 已验证 MSVC 编译、56 个 Rust 测试（含 Windows-only 共享锁测试）及 NSIS 构建，安装包 SHA-256 已独立核对。真实 LCU、原生 WebView 和完整桌面流程仍需实机验收；不能以 CI 模拟源测试代替真实客户端。

## 实际检查结果

- 前端：`pnpm check` 通过，23 个测试文件 / 112 个测试；包含格式、Strict 类型、零警告 ESLint、原始设计文件校验和生产构建。
- Rust：工作区自带工具链，`cargo test --locked --offline` 55 个测试通过；`cargo check`、`cargo fmt -- --check` 通过。
- 新增 Vue Test Utils / happy-dom 仅用于开发测试。首次审计发现 js-beautify 的 glob 漏洞，已通过限定 `js-beautify>glob=14.0.2` 修复；修复版本兼容项目 Node 基线。
- `pnpm audit` 与 `pnpm audit --prod` 均无已知漏洞；本次 Windows CI 结果与下载链接见 `docs/STATUS.md` 的“修复推送与 Windows 构建验证”。

## 本轮边界

- 480px 暗色设计及现有 Tab 导航保持；尚未实现 System/Light 主题、Vue Router、页面懒加载或完整 WCAG/高对比度回归。
- 基础组件按需封装 Reka 原语，未运行 shadcn-vue CLI 批量生成。
- 真实战绩、算分、结算数据、设置持久化、托盘和自动更新仍属于后续业务开发，不能因为工程检查通过而宣称完成。
- 以上边界不是架构评审已通过的声明；本轮修复不等同于全部开发标准通过验收。
