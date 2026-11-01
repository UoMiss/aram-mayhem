# ARAM: Mayhem — 简体中文文案资源化开发规范（阶段 8.2）

> **文档类型**：可直接交给 AI 编程代理执行的开发任务与验收标准  
> **目标技术栈**：Vue 3 · TypeScript · Vite · Pinia · Tailwind CSS 4 · shadcn-vue · pnpm  
> **实施范围**：仅 `zh-CN` 单语言包  
> **实施状态**：待执行；本文为开发规范，不代表已修改项目源码  
> **基线**：阶段八报告记载 67 项测试通过、生产构建通过，最终验收为“有条件通过”；实施时以当前仓库实际检查为准。

## 1. 背景与目标

当前 ARAM: Mayhem 已完成原生 HTML → Vue 3 的主要页面迁移，但界面显示文案可能仍分散在 Vue 模板、Pinia Store、Mock 数据、提示消息及组件属性中。新增文案或修改措辞时，容易产生遗漏和重复维护。

**本阶段唯一业务目标：将界面中需要统一维护的静态中文文案集中到一个 `zh-CN` 语言包，并保持既有页面的外观与交互不变。**

预期成果：

1. 统一查找、修改中文 UI 文案；相同含义不再散落维护多份。
2. 组件只负责展示中文文案，Pinia 保持规则 ID / 状态码等稳定业务值。
3. Toast、按钮状态、无障碍名称、空态及错误提示也统一管理。
4. 现有中文用户界面视觉与功能保持一致，尤其是结算截图、随机分组图片。
5. 将来若扩展语言，可复用结构；**当前明确不开发多语言功能**。

### 1.1 必须保持不变

- `references/deepseek.original.html`：原始设计基准，禁止修改，原有 SHA-256 校验持续通过。
- 原有紫色暗色主题、玻璃拟态、页面布局、480px 容器、字号、图标、动画、底部导航。
- 首页、战绩 7 条列表、结算共享示例、工具与随机分组、设置的全部已有交互。
- 三种算分规则选择行为：默认 `tail`、互斥、可全部取消；不变更实际计算规则。
- 截图 Service、PNG 复制及下载降级的业务行为。
- Mock 玩家名单、英雄、KDA、伤害、评分、排名及既有演示数据。
- `pnpm` 作为唯一包管理器；不接入 Rust、Tauri、LCU、数据库或真实更新服务。

### 1.2 明确不做

- 不创建 `en-US` 或其他语言资源文件。
- 不增加语言选择器、切换按钮、语言持久化或自动检测浏览器语言。
- 不更改 CSS、Tailwind 类名、组件结构或进行与文案迁移无关的重构。
- 不把所有中文字符串无差别地强制迁入语言包：业务数据、日志、测试数据与固定品牌信息需要分类处理。
- 不因引入 i18n 改变原始显示文案（包括空格、标点、换行和数字格式）。

## 2. 技术方案与工程目录

使用 Vue I18n 的 **Composition API** 模式。只注册一个全局语言 `zh-CN`，语言环境固定；Vue I18n 可用于单语言资源集中管理，不要求必须提供英文包。

安装（若已安装则不要重复安装）：

```bash
pnpm add vue-i18n
```

建议目录（按当前工程实际结构做最小改动）：

```text
src/
├── i18n/
│   ├── index.ts
│   └── locales/
│       └── zh-CN.ts           # 唯一语言包
├── features/
│   ├── connection/
│   ├── home/
│   ├── history/
│   ├── match-detail/
│   ├── tools/
│   └── settings/
├── stores/
├── mocks/
├── services/
├── types/
├── App.vue
└── main.ts

docs/
└── ZH_CN_I18N_MIGRATION.md    # 可采用本文文件名
```

### 2.1 初始化示例

**`src/i18n/index.ts`**：

```ts
import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  globalInjection: false,
  messages: {
    'zh-CN': zhCN,
  },
})
```

**`src/main.ts`**：在既有 `createApp`、Pinia、全局 CSS、插件安装流程中加入：

```ts
import { i18n } from './i18n'

// 仅示意：复用原有 app，注意不要重复 createApp 或 mount
app.use(i18n)
```

**Vue 组件中使用**：

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <h2>{{ t('matchDetail.title') }}</h2>
  <button type="button">{{ t('matchDetail.copyScreenshot') }}</button>
</template>
```

要求：**只提供全局单语言包**；默认关闭 `$t` 全局模板注入以统一编码习惯。所有既有插件、样式和应用初始化顺序需保持可运行。

## 3. 文案与数据分类规则

| 内容类别          | 示例                                   | 处理规则                                              |
| ----------------- | -------------------------------------- | ----------------------------------------------------- |
| 导航和页面标题    | 首页、战绩、工具、设置、对局结算       | **进入 `zh-CN`**                                      |
| 交互按钮          | 重新连接、全部、复制截图、开始分组     | **进入 `zh-CN`**                                      |
| 状态展示名称      | 已连接、房间中、胜利、失败             | **进入 `zh-CN`**；Store 保留状态码                    |
| 规则名称和说明    | 纯伤害规则、幸运数字规则、伤害尾数规则 | **进入 `zh-CN`**；Store 保留 `damage/lucky/tail/null` |
| Toast 和错误提示  | 复制成功、自动下载、生成失败           | **进入 `zh-CN`**；Service 返回结果或错误码            |
| 无障碍属性        | `aria-label`、图片操作提示             | **进入 `zh-CN`**                                      |
| 动态数字周边单位  | 最近 20 局、8 人、3 秒                 | **使用插值键**，数字仍由程序提供                      |
| 玩家数据          | Ezreal、洞爷湖、Faker、召唤师昵称      | **不翻译、不改内容**                                  |
| 战绩与比赛数值    | KDA、评分、排名、伤害数值、时间戳      | **不迁入语言包**                                      |
| 稳定业务标识      | `match-001`、`hex`、`custom`、规则 ID  | **不迁入语言包**；仅显示文案映射                      |
| 版本号            | `v2.4.0-release` 或实际包版本          | **保留为数据**；“当前版本”放语言包                    |
| 时间格式          | “随机时间（北京时间）”及时间值         | 标签进语言包，时间由 `Asia/Shanghai` 格式化           |
| 日志/内部异常代码 | 程序调试信息、`ScreenshotError` 类型   | **保留结构化代码**；面向用户的提示进语言包            |

特别强调：`mocks/match-detail.ts` 的结算示例是共享 fixture，**不可**因为文案提取而伪造 7 场分别对应的结算详情；随机组队的 8 名玩家也不能与结算示例的 6 名玩家混用。

## 4. `zh-CN` 键值命名规范

统一采用 `页面/功能域.语义键`，小驼峰命名，**不得以中文内容或数字下标作为 key**。

建议一级命名空间：

- `common`：公用操作与状态
- `nav`：底部导航
- `connection`：未连接、重连、客户端状态
- `home`：首页
- `history`：战绩、筛选、列表提示
- `matchDetail`：结算、红包名单、分组与全局排行、截图
- `rules`：规则名称及描述
- `tools`：工具页
- `team`：组队抽屉、动画、两组、时间标签及截图
- `settings`：设置与关于助手
- `toast`：全局成功/错误反馈
- `a11y`：需要独立描述的无障碍文案

### 4.1 唯一语言包结构示例

以下是**结构示例，不是完整文案清单**。AI 实施时必须从当前真实组件与原始 HTML 逐项提取，不得凭示例省略现有文案。

```ts
// src/i18n/locales/zh-CN.ts
const zhCN = {
  nav: {
    home: '首页',
    history: '战绩',
    tools: '工具',
    settings: '设置',
  },
  home: {
    connected: '已连接',
    inRoom: '房间中',
  },
  history: {
    filters: {
      all: '全部',
      hex: '海克斯大乱斗',
      custom: '自定义',
    },
    recentHint: '仅显示最近 {count} 局 · 点击查看结算',
  },
  matchDetail: {
    title: '对局结算',
    redPacketList: '发红包名单',
    groupView: '分组模式',
    globalView: '全局排行',
    copyScreenshot: '复制截图',
  },
  rules: {
    none: '未选择规则',
    damage: { name: '纯伤害规则', description: '按伤害排名结算' },
    lucky: { name: '幸运数字规则', description: '按尾数匹配结算' },
    tail: { name: '伤害尾数规则', description: '按伤害尾数排名' },
  },
  team: {
    title: '随机分组',
    participants: '参与玩家',
    participantCount: '{count} 人',
    groupA: 'A组 (蓝队)',
    groupB: 'B组 (红队)',
    timeLabel: '随机时间（北京时间）',
    start: '开始分组',
    retry: '重新分组',
    copyImage: '复制图片',
  },
  settings: {
    general: '通用设置',
    autoStart: '自动启动并后台运行',
    autoRetry: '断开连接自动重试',
    sound: '提示音效',
    about: '关于助手',
    versionLabel: '当前版本',
    checkUpdate: '检查更新',
  },
} as const

export default zhCN
```

**文案精确保真要求**：示例中的标点或空格如与原始 HTML / 当前已验收 Vue 版本不一致，必须以原始 UI 基准和当前已经通过的视觉基线为准；不能使用“语义差不多”的新措辞。

### 4.2 插值规范

使用命名参数，不拼接用户可见的固定中文：

```ts
t('history.recentHint', { count: 20 })
t('team.participantCount', { count: players.length })
```

- 所有插值变量须具备明确类型，传入的数据源来自现有 Store / Mock。
- 不把数字本身写死到翻译模板（如果它在业务上可变化）。
- 不能为凑 i18n 而改变原有数字格式、间距、标点或 DOM 包裹方式。
- 如果原版分开渲染数字和单位以满足特定样式，保留 DOM 结构，单独翻译单位即可。

## 5. Pinia / Mock / Service 职责边界

### 5.1 Pinia 只保存业务值

保留现有 `currentRule` 的稳定标识（`'damage' | 'lucky' | 'tail' | null` 等实际定义），以及连接状态、战绩模式、筛选值、开关 Boolean、所选对局 ID。

**不得**为了 i18n 在 Store 中再建立 `ruleLabelZh`、`roomStatusTextZh` 等重复文案状态。

组件层通过规则键映射取得文案，例如：

```ts
const ruleNameKeys = {
  damage: 'rules.damage.name',
  lucky: 'rules.lucky.name',
  tail: 'rules.tail.name',
} as const

const ruleLabel = computed(() => {
  const rule = appStore.currentRule
  return rule ? t(ruleNameKeys[rule]) : t('rules.none')
})
```

注意：此代码是设计示意；如果现有 `currentRule`、`homeView` 或 TypeScript 类型不同，应先核对实际类型后进行**最小兼容迁移**，不得随意重构公共 Store 接口。必要时逐步弃用现有 `currentRuleLabel`，并同步改造其调用处和测试。

### 5.2 Mock 仅保存数据

- `mocks/home.ts`：玩家昵称、业务状态 / 规则标识、需要显示的演示数值。
- `mocks/history.ts`：七场战绩的 ID、英雄、结果、模式、KDA 和时间等。
- `mocks/match-detail.ts`：共享结算示例完整数值和玩家名单。
- 工具/设置 Mock：参与玩家名单、规则 ID、开关初始值、版本数据。

既有 Mock 中如果包含“用于显示的固定 UI 文案”，应谨慎抽取到语言包，保留原有对象结构与行为契约；不修改业务内容和测试所依赖的数据含义。

### 5.3 Service 返回结果，不负责中文 UI

例如 `image.service.ts` 保持 `copied` / `downloaded`、错误类型或错误码等结果契约；在页面或面向 UI 的 composable 中使用 `t('toast.xxx')` 生成提示文案。

不要把 `useI18n()` 放到普通 TypeScript Service 顶层；该 composable 应在 Vue `setup()` 或合法的 Vue 组合式上下文调用。若服务的确需要用户可见文案，优先由调用方传入格式化函数，而不是让 Service 直接耦合 UI。

## 6. 迁移工作顺序

### 第 0 步：基线与盘点

1. 阅读当前 `docs/FINAL_ACCEPTANCE.md`（若文件位置不同，以仓库实际路径为准）、`STATUS.md` 和迁移规范。
2. 执行 `pnpm check`、`pnpm format:check`，确认现有测试和构建基线。
3. 列出所有面向用户的中文字符串及所在文件，分类为“UI 文案 / 业务数据 / 内部日志”。
4. 重点盘点动态按钮状态、Toast、SSR 测试、图片导出、`aria-*` 属性以及 Pinia 显示文本。
5. 标记不应迁移的业务数据，避免对玩家名字和排名误处理。

**交付**：文案清单（文件路径、原文、建议 key、类别、迁移状态）。

### 第 1 步：基础设施

- 安装 `vue-i18n` 并创建 `src/i18n/index.ts`、`src/i18n/locales/zh-CN.ts`。
- 在现有 `main.ts` 安装插件，保持 `locale === 'zh-CN'`。
- 不建立语言选择组件；不新增多语言环境变量。
- 使用当前项目的规范做类型推导和约束，优先保证缺失 key 可被测试发现。

### 第 2 步：公共 UI 与首页

- AppHeader、BottomNavigation、AppToast、ConnectionScreen、HomePage。
- 页面标题、连接状态显示、三项入口、加载和重连提示、规则名称。
- 只改文案来源，保持节点结构和 Tailwind class 不变。

### 第 3 步：战绩与结算

- HistoryPage、MatchHistoryCard：筛选标签、模式名称、胜负名称、提示、刷新状态。
- MatchDetailPage、RedPacketNotice、SettlementPlayerRow、SettlementTeamSection、SettlementRanking：标题、队伍和排行标签、红包提示、KDA 统计标题、截图按钮和 Toast。
- 严禁改变排序、红包名单、数值和导出区域。

### 第 4 步：工具、分组与设置

- ToolsPage：三条规则名称与说明；`tail` 默认状态和互斥行为保持不变。
- TeamDrawer：抽屉标题、人数、A/B 两队标签、倒计时、随机时间标签、按钮与提示。
- SettingsPage：三个设置项、版本字段标签、检查更新提示。
- `Asia/Shanghai` 仅用于格式化现有随机时间，与 i18n 资源化相互独立。

### 第 5 步：全面回归与文档更新

- 运行全套自动化测试。
- 按五种尺寸验证全部页面中文排版，检查文本是否换行、截断、溢出。
- 重验结算分组/全局及随机分组的 PNG 导出、复制和下载降级。
- 记录差异和文件清单，更新 README、STATUS 与本次实施状态。

## 7. 测试与验收标准

### 7.1 代码与语言包

- [ ] 工程中只注册 `zh-CN` 一个 locale。
- [ ] 仅有 `src/i18n/locales/zh-CN.ts` 一个语言包文件（不额外创建其他地区或语言包）。
- [ ] 无语言切换 UI、语言偏好状态或浏览器自动语言检测。
- [ ] 所有本次盘点认定为 UI 文案的条目已迁移并能正确显示。
- [ ] 没有语言包 key 缺失、显示 key 原文或空白文本。
- [ ] 相同语义的文案尽量复用 key，不复制多套同义文本。
- [ ] Pinia 不为 UI 文案创建不必要的重复状态。
- [ ] Mock 玩家、英雄、KDA、排名、数值、战绩 ID 均保持不变。
- [ ] 原始 HTML SHA-256 完全一致。

### 7.2 功能回归

- [ ] 模拟连接、首页、四个 Tab 和页面导航正常。
- [ ] 战绩全部/hex/custom 仍为 7 / 5 / 2 条。
- [ ] 结算分组 / 全局、红包名单、两种图片导出正常。
- [ ] 三种规则互斥、允许全部取消、首页文案正确联动。
- [ ] 8 人 Fisher–Yates 分组、三秒动画、抽屉行为和组队导出正常。
- [ ] 设置三个开关和检查更新演示行为不变。
- [ ] 图片服务的剪贴板、下载降级、错误和并发测试持续通过。

### 7.3 视觉回归

对以下固定 viewport、固定 Mock、固定动画时间和滚动状态截图比对：

| 尺寸    | 范围           |
| ------- | -------------- |
| 320×568 | 小屏与横向溢出 |
| 375×812 | 普通移动端     |
| 390×844 | 常见移动端     |
| 430×932 | 大屏移动端     |
| 480×900 | 应用最大宽度   |

必须包括未连接页、首页、战绩、两种结算视图、工具、抽屉初始与完成、设置。

**验收原则**：中文文案应与阶段八已验收的 Vue 页面逐字一致（包括标点、空格）；不因 i18n 导致 DOM 结构、文本换行、元素坐标、截图尺寸或颜色改变。允许字体抗锯齿及动态随机内容造成的既有差异，不允许新引入可见回归。

### 7.4 必须实际运行的命令

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm check
```

如果新增语言包键覆盖检测、动态插值测试或快照测试，需纳入 `pnpm test`。记录实际测试数量；不可机械宣称仍为 67 项。不得删除测试、放宽检查规则或通过屏蔽 `src/` 来使检查通过。

安全审计可同时观察 `pnpm audit`、`pnpm audit --prod`，但已有开发依赖安全告警属独立收尾任务，不能把未处理漏洞表述为已修复。

## 8. 需要重点处理的边界情况

1. **属性文本**：不能只迁移模板文本节点，`aria-label`、`title`、`alt`、`placeholder` 也要审查；英雄头像已有英雄名或业务数据的 `alt` 不必强制翻译。
2. **Store 中的中文**：迁移时优先保留 ID 和旧数据契约，通过组件显示映射实现；避免一次性破坏大量既有依赖。
3. **动态拼接**：不要使用 `固定中文 + count`；需要组合式样式时可拆分单位键，保持原版标签结构。
4. **截图区域**：截图时应使用当前已渲染的中文文案，确保 `#screenshot-area` 与 `#teamCaptureArea` 仍是唯一导出目标。
5. **文案精确性**：原始 HTML 与阶段八的中文文案差异需要先列出来，不允许借“国际化”暗中统一措辞。
6. **国际化 API**：仅用于读取固定 `zh-CN`；不应引入多语言路由、切换能力、额外存储或翻译后端。
7. **固定品牌**：ARAM: Mayhem、英雄英文名等可保留为品牌 / 业务数据，不强求全部迁入语言包。
8. **插件依赖**：保持 pnpm 锁文件一致；新增 `vue-i18n` 后需更新并提交锁文件。

## 9. 开发完成后的交付内容

AI Agent 必须提供：

1. 新增、修改、删除的文件清单。
2. 全部文案映射清单或映射表，说明已迁移及明确保留的数据型文本。
3. `src/i18n/index.ts` 与唯一 `zh-CN.ts` 的实际实现。
4. Pinia / Mock / Service 的文案职责调整说明。
5. 主要页面和两类 PNG 的视觉及功能回归结果。
6. 实际命令、测试数量、构建结果、基线 SHA-256 验证结果。
7. 尚存的硬编码 UI 文案及理由、未完成测试或风险。
8. 最终结论：**通过 / 有条件通过 / 未通过**。

## 10. 可直接发送给 AI Agent 的执行指令

> 请在当前 ARAM: Mayhem Vue 3 项目中执行阶段 8.2“仅简体中文文案资源化”任务。先读取 `docs/`、当前 Pinia、Mock、Service 与全部 Vue 组件，执行 `pnpm check` 建立基线。然后仅安装/配置 Vue I18n Composition API 与一个 `zh-CN` 语言包，逐项提取现有 UI 文案、Toast、状态标签、按钮与无障碍文案；业务数据（玩家昵称、KDA、规则 ID、战绩 ID、版本值、时间戳）不得当作翻译文本。不得增加英文包、语言切换或新 UI，不修改原始 HTML，不改业务行为和既有视觉结构。按公共 UI→首页→战绩/结算→工具/随机分组→设置的顺序逐模块修改并测试。最终运行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build`、`pnpm check`，进行五尺寸视觉回归与 PNG 导出检查，并提交文件清单、文案映射和实际测试记录。请直接实施代码修改，不要停留在建议阶段。

---

**官方技术参考**：Vue I18n Composition API https://vue-i18n.intlify.dev/guide/advanced/composition ，TypeScript https://vue-i18n.intlify.dev/guide/advanced/typescript 。
