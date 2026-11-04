import { onScopeDispose, watch, type Ref } from 'vue'

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Keeps keyboard focus inside the modal and restores the opener on close/unmount. */
export function useModalFocus(
  open: () => boolean,
  root: Ref<HTMLElement | null>,
  close: () => void,
) {
  let restore: HTMLElement | null = null
  let background: { element: HTMLElement; inert: boolean }[] = []
  const controls = () =>
    Array.from(root.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (element) => !element.closest('[inert], [hidden], [aria-hidden="true"]'),
    )

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const elements = controls()
    const first = elements[0]
    const last = elements.at(-1)
    if (!first || !last) {
      event.preventDefault()
      root.value?.focus()
      return
    }
    const active = document.activeElement
    if (event.shiftKey && (active === first || !root.value?.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !root.value?.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }
  function onFocus(event: FocusEvent) {
    if (event.target instanceof Node && !root.value?.contains(event.target)) {
      ;(controls()[0] ?? root.value)?.focus()
    }
  }
  function cleanup() {
    if (typeof document === 'undefined') return
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('focusin', onFocus, true)
    for (const item of background) item.element.inert = item.inert
    background = []
    if (restore?.isConnected) restore.focus()
    restore = null
  }
  watch(
    [open, root],
    ([isOpen]) => {
      cleanup()
      if (typeof document === 'undefined' || !isOpen || !root.value) return
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
      let child: HTMLElement = root.value
      while (child.parentElement && child !== document.body) {
        for (const sibling of child.parentElement.children) {
          if (sibling !== child && sibling instanceof HTMLElement) {
            background.push({ element: sibling, inert: sibling.inert })
            sibling.inert = true
          }
        }
        child = child.parentElement
      }
      document.addEventListener('keydown', onKey, true)
      document.addEventListener('focusin', onFocus, true)
      ;(controls()[0] ?? root.value).focus()
    },
    { flush: 'post', immediate: true },
  )
  onScopeDispose(cleanup)
}
