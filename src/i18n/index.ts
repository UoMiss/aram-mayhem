import { createI18n } from 'vue-i18n'
import { previewRuntime } from '@/adapters/preview-runtime'
import zhCN from './locales/zh-CN'

export function createAppI18n() {
  const instance = createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    globalInjection: false,
    messages: {
      'zh-CN': zhCN,
    },
  })
  if (previewRuntime) instance.global.mergeLocaleMessage('zh-CN', previewRuntime.messages)
  return instance
}

/** 应用唯一语言实例；当前仅注册 zh-CN。 */
export const i18n = createAppI18n()
