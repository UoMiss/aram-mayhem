# 业务模块目录（阶段 8.2）

按基线页面逐模块迁移：`connection`、`home`、`history`、`match-detail`、`tools`、`settings`。

## 当前状态

- `connection/`：阶段 2 已完成未连接页、连接详情、倒计时与演示连接。
- `home/`：阶段 3 已完成正式首页、首页数据模型与规则联动。
- `history/`：阶段 4 已完成正式战绩页、7 条 Mock、筛选、刷新和卡片详情选择。
- `match-detail/`：阶段 5 已完成正式结算页、分组/全局排行、截图复制与下载。
- `tools/`：阶段 6 已完成工具页、三种规则、8 人 Fisher–Yates 随机分组、3 秒洗牌与分组图片复制。
  - `ToolsPage.vue`：规则区、小工具卡片、随机分组入口。
  - `components/RuleOption.vue`：规则开关与紫色选中态。
  - `components/TeamDrawer.vue`：遮罩、抽屉、A/B 队伍、关闭锁、结果保留、复制图片。
  - `teamRandomizer.ts` / `useTeamShuffle.ts`：纯算法与 Vue 动画控制分离。
- `settings/`：阶段 7 已完成设置页、三行演示开关、版本与检查更新。
  - `SettingsPage.vue`：通用设置、关于助手两张卡片。
  - `components/SettingToggle.vue`：原版开关外观、键盘/aria 可访问性。
  - 设置状态复用 Pinia store；无 localStorage、系统开机启动或音效资源。
- `selectedMatchId` / `selectedMatch` 保留导航上下文；当前结算内容为共享静态 fixture，不冒充逐场真实数据。
- 工具页 8 人名单独立于结算 6 人 fixture；不调用真实客户端。
- 所有原始页面均已迁移；设置页不再使用阶段占位。
- 阶段 8.2：所有页面通过 `useI18n({ useScope: 'global' })` 读取唯一 `zh-CN` 语言包；组件不保存重复中文显示状态。
- 业务值到 key 的映射集中在 `src/i18n/labels.ts`。

原始页面、数据和交互仍完整保存在 `references/deepseek.original.html`。
