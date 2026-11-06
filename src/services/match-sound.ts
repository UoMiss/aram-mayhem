export function playMatchCue() {
  try {
    const context = new AudioContext()
    const expiry = setTimeout(() => {
      void context.close().catch(() => undefined)
    }, 1000)
    void context
      .resume()
      .then(() => {
        clearTimeout(expiry)
        if (context.state !== 'running') return
        const tone = context.createOscillator()
        const gain = context.createGain()
        tone.frequency.value = 660
        gain.gain.setValueAtTime(0.06, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18)
        tone.connect(gain).connect(context.destination)
        tone.onended = () => {
          void context.close().catch(() => undefined)
        }
        tone.start()
        tone.stop(context.currentTime + 0.18)
      })
      .catch(() => {
        clearTimeout(expiry)
        return context.close().catch(() => undefined)
      })
  } catch {
    // The desktop webview may have audio disabled.
  }
}
