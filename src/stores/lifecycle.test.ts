import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia } from 'pinia'
import { useConnectionStore, CONNECT_DELAY_MS } from './connection'
import { useFeedbackStore, TOAST_DURATION_MS } from './feedback'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('domain store lifetime', () => {
  it('cancels pending connection and feedback work when the application scope is disposed', () => {
    const pinia = createPinia()
    const connection = useConnectionStore(pinia)
    const feedback = useFeedbackStore(pinia)
    connection.connect()
    feedback.notify('test')
    disposePinia(pinia)
    vi.advanceTimersByTime(CONNECT_DELAY_MS + TOAST_DURATION_MS)
    expect(connection.isConnected).toBe(false)
    expect(feedback.toastVisible).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
