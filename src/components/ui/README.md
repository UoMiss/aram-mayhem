# 公共 UI 组件

`switch/Switch.vue` 是基于已安装的 Reka UI 原语封装的受控开关，设置页和算分规则共用。
组件只包含通用交互、键盘支持和语义主题，不读取业务 Store。其尺寸保持现有 44×24px 设计。

采用 shadcn-vue 的源码归仓与 Reka 原语封装方式；此组件为项目手工维护，未声称由 CLI 生成。
后续引入 Button、Sheet 等组件时按需添加，不批量生成未使用组件。

视觉主题集中在 `src/assets/styles/theme.css`，组件使用语义颜色、阴影和层级令牌。
现有暗色、480px 窄窗布局来自原始设计约束；System/Light 主题和 Router 迁移不在本轮修复范围。
