// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import { useDesktopStore } from '@/stores/desktop'
import SettingsPage from './SettingsPage.vue'

describe('settings component interaction', () => {
  it('updates only the selected switch and displays the native application version', async () => {
    const pinia = createPinia()
    useDesktopStore(pinia).setAppVersion('1.2.3')
    const wrapper = mount(SettingsPage, { global: { plugins: [pinia, createAppI18n()] } })
    const switches = wrapper.findAll('[role="switch"]')
    expect(switches).toHaveLength(3)
    await switches[1]!.trigger('click')
    expect(useSettingsStore(pinia).settings).toEqual({
      autoStart: true,
      autoRetry: false,
      soundEffects: true,
    })
    expect(switches[1]!.attributes('aria-checked')).toBe('false')
    expect(wrapper.text()).toContain('v1.2.3')
    wrapper.unmount()
    disposePinia(pinia)
  })
})
