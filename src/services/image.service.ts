import html2canvas from 'html2canvas-pro'

export interface ScreenshotOptions {
  scale?: number
  backgroundColor?: string
  fileNamePrefix?: string
  /** Revalidate immediately before each irreversible delivery attempt. */
  beforeDeliver?: () => boolean | Promise<boolean>
}

export interface ScreenshotDelivery {
  status: 'copied' | 'downloaded'
  blob: Blob
  fileName?: string
}

export class ScreenshotError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScreenshotError'
  }
}

/** 等待目标区域内的字体和图片，避免生成半成品截图。 */
async function waitForElementAssets(element: HTMLElement): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts) {
    try {
      await document.fonts.ready
    } catch {
      // 字体加载失败不应阻止截图；由 html2canvas 使用当前可用字体。
    }
  }

  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true })
        image.addEventListener('error', () => resolve(), { once: true })
      })
    }),
  )
}

/** 将 canvas 转成 Blob；必须等待回调，不能使用未 await 的 toBlob。 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new ScreenshotError('PNG 生成失败'))
    }, 'image/png')
  })
}

/** 对指定 DOM 区域生成 PNG Blob，不处理剪贴板或下载。 */
export async function captureElementToBlob(
  element: HTMLElement | null,
  options: ScreenshotOptions = {},
): Promise<Blob> {
  if (!element) throw new ScreenshotError('截图区域不存在')

  await waitForElementAssets(element)

  try {
    const canvas = await html2canvas(element, {
      useCORS: true,
      scale: options.scale ?? 2,
      backgroundColor: options.backgroundColor ?? '#090a10',
      logging: false,
      onclone: (clonedDoc) => {
        const clone =
          (element.id ? clonedDoc.getElementById(element.id) : null) ??
          clonedDoc.querySelector<HTMLElement>('[data-screenshot-root]')
        if (!clone) return

        clone.style.width = `${element.offsetWidth}px`
        clone.style.margin = '0'
        clone.style.transform = 'none'

        clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
          node.style.transition = 'none'
          node.style.animation = 'none'
        })
      },
    })

    return await canvasToBlob(canvas)
  } catch (error) {
    if (error instanceof ScreenshotError) throw error
    throw new ScreenshotError('截图生成失败', { cause: error })
  }
}

export function isClipboardImageSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  )
}

/** 剪贴板不可用或写入失败返回 false，由调用方降级为下载。 */
export async function copyPngToClipboard(blob: Blob): Promise<boolean> {
  if (!isClipboardImageSupported()) return false

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export function downloadPng(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function buildFileName(prefix = 'LOL战绩'): string {
  return `${prefix}_${new Date().getTime()}.png`
}

/**
 * 完整截图交付流程：生成 PNG → 尝试写剪贴板 → 失败时下载。
 * 页面层只根据 status 显示 Toast，不重复实现生成逻辑。
 */
export async function captureAndDeliverScreenshot(
  element: HTMLElement | null,
  options: ScreenshotOptions = {},
): Promise<ScreenshotDelivery> {
  const blob = await captureElementToBlob(element, options)

  function assertCurrent(): void | Promise<void> {
    const valid = options.beforeDeliver?.()
    function check(value: boolean | undefined) {
      if (value === false) throw new ScreenshotError('截图结果已失效')
    }
    if (typeof valid === 'boolean' || valid === undefined) return check(valid)
    return valid.then(check)
  }
  // Synchronous page guards must not yield between validation and the delivery call.
  const clipboardCheck = assertCurrent()
  if (clipboardCheck) await clipboardCheck
  if (await copyPngToClipboard(blob)) {
    return { status: 'copied', blob }
  }

  const downloadCheck = assertCurrent()
  if (downloadCheck) await downloadCheck
  const fileName = buildFileName(options.fileNamePrefix)
  try {
    downloadPng(blob, fileName)
    return { status: 'downloaded', blob, fileName }
  } catch (error) {
    throw new ScreenshotError('截图已生成，但下载失败', { cause: error })
  }
}
