# ARAM: Mayhem 前端 AI 开发规则

1. **源页面保真**：`references/deepseek.original.html` 为只读基线；不删页面、功能入口、演示数据、现有样式与交互。
2. **迁移阶段性**：只处理当前获批阶段；这次只建工程，不能宣称全量页面已迁移。
3. **设计不改**：维持 480px、紫色暗黑、玻璃卡片、底部导航、Font Awesome 原图标及动画；使用 shadcn-vue 时应覆盖默认外观。
4. **职责分离**：Vue 组件只展示和交互，Mock 数据集中，API Service 独立，避免直接 document.getElementById 管理 Vue 状态。
5. **安全输入**：用户内容使用 Vue 插值，不用动态 `innerHTML` 或 `v-html`。
6. **不虚报**：检查命令只能如实汇报“执行通过/失败/未执行”，不能把配置完成当成构建成功。
7. **变更最小化**：一次完成一个模块；附文件清单、功能与视觉对比、回归测试和未验证事项。
8. **发布限制**：当前仅 macOS 开发前端；后续 GitHub Actions Windows-only 构建是另一个阶段。不得加入 macOS .dmg 发布任务。

9. **统一包管理器**：仅使用 pnpm 进行项目依赖管理和脚本调用；pnpm-lock.yaml 首次生成后提交并维护。禁止同时提交 package-lock.json 或 yarn.lock。
