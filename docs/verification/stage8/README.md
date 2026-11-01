# 阶段八最终视觉与导出证据

## 覆盖范围

- 窗口：320×568、375×812、390×844、430×932、480×900。
- 状态：未连接、首页、战绩、结算分组、结算全局、工具、分组抽屉初始、分组抽屉完成、设置。
- 每个状态均有原始 HTML 与 Vue 版截图，共 90 张逐宽度截图。
- 另有 9 张 480px 对照、9 张五宽度总览、`visual-metrics.json` 和三张真实 PNG。

## 文件

```text
<state>-original-<width>.png
<state>-vue-<width>.png
<state>-480-compare.png
<state>-compare-widths.png
visual-metrics.json
match-detail-group-export.png
match-detail-global-export.png
team-random-export.png
clipboard-group.png
```

## 平均像素差

| 状态           |   320 |   375 |   390 |   430 |   480 |
| -------------- | ----: | ----: | ----: | ----: | ----: |
| connection     | 0.394 | 0.238 | 0.221 | 0.181 | 0.168 |
| home           | 0.612 | 0.372 | 0.346 | 0.289 | 0.273 |
| history        | 0.863 | 0.589 | 0.548 | 0.455 | 0.429 |
| detail-group   | 1.321 | 0.999 | 0.951 | 0.856 | 0.843 |
| detail-global  | 1.330 | 1.097 | 1.075 | 1.015 | 0.996 |
| tools          | 1.017 | 0.631 | 0.590 | 0.498 | 0.478 |
| drawer-initial | 1.753 | 1.537 | 1.479 | 1.308 | 1.252 |
| drawer-final   | 4.902 | 3.223 | 3.165 | 2.464 | 2.354 |
| settings       | 0.701 | 0.432 | 0.403 | 0.339 | 0.323 |

## 差异说明

- 字体抗锯齿、Tailwind 4 的 `translate` 与颜色空间表示、Font Awesome 6.7.2 对 6.4.0 的字形差异，构成静态状态的主要像素差。
- 结算分组/全局模拟真实头像与统计条，存在抗锯齿差异；复制按钮 copy 图标约 2px 字形宽度差。
- 随机分组初始状态：原版将 `翻斗花园牛...` 硬编码，Vue 保留完整昵称并用 CSS `truncate`；在 480/320 的单元格中完整名称可容纳，因此显示全名。未修改 Mock 数据。
- 随机分组完成状态：玩家排列与随机结果不同；时间被固定为 `2026/11/01 15:04:05`，但组名序号不同，像素差较高属预期。
- 未连接页倒计时是动态值。早期截图原版停在 3 秒、Vue 停在 5 秒；最终证据已在同一初始 5 秒状态重拍，不是代码差异。
- 原版 `showMatchDetail()` 和 `simulateConnect()` 的调用路径已用于截图；工具页 tail 默认选中态通过 `simulateConnect()` 的 `updateRuleUI('tail')` 对齐。

## 真实 PNG

| 文件                           |             尺寸 | 内容                                                 |
| ------------------------------ | ---------------: | ---------------------------------------------------- |
| match-detail-group-export.png  |         896×1894 | 分组结算，不含顶栏/底栏/复制按钮                     |
| match-detail-global-export.png |         896×1696 | 全局排行，不含顶栏/底栏/复制按钮                     |
| team-random-export.png         |          880×570 | 随机分组 A/B、8 人、北京时间，不含抽屉标题/按钮/遮罩 |
| clipboard-group.png            | 与剪贴板读回一致 | 真实剪贴板 PNG 读回（324,272 bytes）                 |
