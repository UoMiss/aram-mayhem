# Service 目录

当前只包含浏览器端图片服务，不接入 API / Rust / LCU / Tauri。

## `image.service.ts`

- `captureElementToBlob(element, options)`：等待字体与图片，使用 `html2canvas-pro` 对指定 DOM 生成 PNG Blob。
- `canvasToBlob(canvas)`：Promise 包装 `canvas.toBlob`，正确处理空 Blob。
- `copyPngToClipboard(blob)`：浏览器支持 ClipboardItem 时写入 PNG；不可用或失败返回 `false`。
- `downloadPng(blob, fileName)`：创建临时链接触发下载并释放 Object URL。
- `captureAndDeliverScreenshot(element, options)`：完整流程，返回 `copied` / `downloaded`，失败抛出 `ScreenshotError`。

截图目标由页面 ref 传入，目前用于：

- 结算页 `#screenshot-area`：不包含顶栏、底部导航和复制按钮。
- 工具页随机分组 `#teamCaptureArea`：不包含遮罩、抽屉标题、关闭按钮或底部操作按钮。

阶段 6 直接复用本服务，没有新增 PNG 生成实现或第二套截图依赖。当前只实现浏览器 Clipboard API 与下载兜底，不接入 Tauri Clipboard 插件。

阶段 8.2 后，Service 仍只返回 `copied/downloaded` 或抛出结构化错误；中文 Toast 与文件名前缀由页面通过 i18n 传入，Service 内部 `ScreenshotError` 文案仅作诊断，不直接面向 UI。

阶段 9 增加 `app.service.ts`：浏览器走 `browser.adapter`，Tauri 走懒加载的 `tauri.adapter` 并调用 `app_health_check`；`desktop-error.ts` 只暴露清洗后的 code/message。`App.vue` 启动时静默探测，不渲染测试 UI，也不接真实 LCU。
