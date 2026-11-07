import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import html2canvas from 'html2canvas-pro'
import {
  ScreenshotError,
  canvasToBlob,
  captureAndDeliverScreenshot,
  captureElementToBlob,
  copyPngToClipboard,
  downloadPng,
} from './image.service'

vi.mock('html2canvas-pro', () => ({ default: vi.fn() }))

const pngBlob = new Blob(['png'], { type: 'image/png' })

function canvasWith(blob: Blob | null): HTMLCanvasElement {
  return {
    toBlob: (callback: BlobCallback) => callback(blob),
  } as unknown as HTMLCanvasElement
}

function screenshotTarget(): HTMLElement {
  return {
    id: 'screenshot-area',
    offsetWidth: 400,
    querySelectorAll: () => [],
  } as unknown as HTMLElement
}

function stubFontDocument(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  stubFontDocument()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('image service', () => {
  it('captures the target element and awaits canvas.toBlob', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))

    const target = screenshotTarget()
    const result = await captureElementToBlob(target)

    expect(result).toBe(pngBlob)
    expect(html2canvas).toHaveBeenCalledOnce()
    expect(html2canvas).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        useCORS: true,
        scale: 2,
        backgroundColor: '#090a10',
        logging: false,
      }),
    )
  })

  it('applies original onclone sizing and disables clone animations', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))

    const target = screenshotTarget()
    await captureElementToBlob(target)

    const options = vi.mocked(html2canvas).mock.calls[0]?.[1]
    const child = { style: {} as CSSStyleDeclaration }
    const clone = {
      style: {} as CSSStyleDeclaration,
      querySelectorAll: vi.fn(() => [child]),
    }
    const clonedDoc = {
      getElementById: vi.fn(() => clone),
      querySelector: vi.fn(() => clone),
    }

    options?.onclone?.(clonedDoc as unknown as Document, target)

    expect(clone.style.width).toBe('400px')
    expect(clone.style.margin).toBe('0')
    expect(clone.style.transform).toBe('none')
    expect(child.style.transition).toBe('none')
    expect(child.style.animation).toBe('none')
  })

  it('rejects when the target or PNG blob is missing', async () => {
    await expect(captureElementToBlob(null)).rejects.toBeInstanceOf(ScreenshotError)
    await expect(canvasToBlob(canvasWith(null))).rejects.toBeInstanceOf(ScreenshotError)
  })

  it('wraps html2canvas failures in ScreenshotError', async () => {
    vi.mocked(html2canvas).mockRejectedValue(new Error('render failure'))

    await expect(captureElementToBlob(screenshotTarget())).rejects.toBeInstanceOf(ScreenshotError)
  })

  it('writes PNG to the clipboard when supported', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemStub {
        constructor(public items: Record<string, Blob>) {}
      },
    )

    await expect(copyPngToClipboard(pngBlob)).resolves.toBe(true)
    expect(write).toHaveBeenCalledOnce()
  })

  it('returns false when clipboard writing fails or is unsupported', async () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemStub {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    await expect(copyPngToClipboard(pngBlob)).resolves.toBe(false)

    vi.stubGlobal('ClipboardItem', undefined)
    await expect(copyPngToClipboard(pngBlob)).resolves.toBe(false)
  })

  it('downloads a PNG with the original filename pattern', () => {
    const anchor = { href: '', download: '', click: vi.fn() }
    const appendChild = vi.fn()
    const removeChild = vi.fn()
    stubFontDocument({
      createElement: vi.fn(() => anchor),
      body: { appendChild, removeChild },
    })
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    downloadPng(pngBlob, 'LOL战绩_1.png')

    expect(anchor.href).toBe('blob:mock')
    expect(anchor.download).toBe('LOL战绩_1.png')
    expect(anchor.click).toHaveBeenCalledOnce()
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(removeChild).toHaveBeenCalledWith(anchor)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('returns copied when clipboard succeeds', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemStub {
        constructor(public items: Record<string, Blob>) {}
      },
    )

    const result = await captureAndDeliverScreenshot(screenshotTarget(), {
      fileNamePrefix: 'LOL战绩',
    })

    expect(result.status).toBe('copied')
    expect(result.blob).toBe(pngBlob)
  })

  it('falls back to download when clipboard writing fails', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))
    const anchor = { href: '', download: '', click: vi.fn() }
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class ClipboardItemStub {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    stubFontDocument({
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })

    const result = await captureAndDeliverScreenshot(screenshotTarget(), {
      fileNamePrefix: 'LOL战绩',
    })

    expect(result.status).toBe('downloaded')
    expect(result.fileName).toMatch(/^LOL战绩_\d+\.png$/)
    expect(anchor.click).toHaveBeenCalledOnce()
  })
})

describe('screenshot delivery validity', () => {
  it('starts clipboard delivery in the same turn as a synchronous validity check', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))
    let current = true
    let currentAtWrite: boolean | undefined
    const write = vi.fn(() => {
      currentAtWrite = current
      return Promise.resolve()
    })
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    const result = await captureAndDeliverScreenshot(screenshotTarget(), {
      beforeDeliver: () => {
        const valid = current
        queueMicrotask(() => {
          current = false
        })
        return valid
      },
    })
    expect(result.status).toBe('copied')
    expect(write).toHaveBeenCalledOnce()
    expect(currentAtWrite).toBe(true)
  })
  it('blocks clipboard writes when capture has become invalid', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    await expect(
      captureAndDeliverScreenshot(screenshotTarget(), { beforeDeliver: async () => false }),
    ).rejects.toThrow('截图结果已失效')
    expect(write).not.toHaveBeenCalled()
  })
  it('rechecks before download if the clipboard attempt fails', async () => {
    vi.mocked(html2canvas).mockResolvedValue(canvasWith(pngBlob))
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal(
      'ClipboardItem',
      class {
        constructor(public items: Record<string, Blob>) {}
      },
    )
    const validate = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const createObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    await expect(
      captureAndDeliverScreenshot(screenshotTarget(), { beforeDeliver: validate }),
    ).rejects.toThrow('截图结果已失效')
    expect(write).toHaveBeenCalledOnce()
    expect(validate).toHaveBeenCalledTimes(2)
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
