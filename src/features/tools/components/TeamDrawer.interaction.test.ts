// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import TeamDrawer from './TeamDrawer.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('team drawer keyboard interaction', () => {
  it('focuses the dialog, traps Tab, closes on Escape and restores the opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mount(TeamDrawer, {
      attachTo: document.body,
      props: { open: false },
      global: { plugins: [createPinia(), createAppI18n()] },
    })
    expect(wrapper.get('#teamDrawer').attributes('inert')).toBeDefined()
    await wrapper.setProps({ open: true })
    const close = wrapper.get<HTMLButtonElement>('[aria-label="关闭随机分组"]')
    expect(document.activeElement).toBe(close.element)
    expect(opener.inert).toBe(true)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(wrapper.get('#randomBtn').element)
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(close.element)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    await wrapper.setProps({ open: false })
    expect(document.activeElement).toBe(opener)
    expect(opener.inert).toBe(false)
    wrapper.unmount()
  })
})
