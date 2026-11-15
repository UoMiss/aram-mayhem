import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia } from 'pinia'
import { useFeedbackStore, TOAST_DURATION_MS } from './feedback'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('domain store lifetime', () => {
  it('cancels pending feedback when the application scope is disposed', () => {
    const pinia = createPinia()
    const feedback = useFeedbackStore(pinia)
    feedback.notify('test')
    disposePinia(pinia)
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(feedback.toastVisible).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
