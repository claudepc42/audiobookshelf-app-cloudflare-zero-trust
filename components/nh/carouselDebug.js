// Temporary diagnostics for the home carousel flashing: writes to the in-app Logs (tag "carousel").
// Active only for about 3 seconds after each touch on the carousel, so it stays quiet otherwise.
import { AbsLogger } from '@/plugins/capacitor'

const T0 = Date.now()
let activeUntil = 0
let rafId = null
let lastFrame = 0
let unsubscribeStore = null
let observers = []

export function carouselLog(message) {
  const t = String(Date.now() - T0).padStart(7)
  AbsLogger.info({ tag: 'carousel', message: `[+${t}ms] ${message}` })
}

function frameLoop(now) {
  if (Date.now() > activeUntil) {
    stopWatching()
    return
  }
  if (lastFrame && now - lastFrame > 50) carouselLog(`slow frame: ${Math.round(now - lastFrame)}ms since the previous one`)
  lastFrame = now
  rafId = requestAnimationFrame(frameLoop)
}

function stopWatching() {
  rafId = null
  lastFrame = 0
  if (unsubscribeStore) unsubscribeStore()
  unsubscribeStore = null
  observers.forEach((o) => o.disconnect())
  observers = []
  carouselLog('watch ended')
}

// Call on every touch on the carousel; (re)starts the short watch window
export function carouselWatch(store) {
  activeUntil = Date.now() + 3000
  if (rafId !== null) return
  carouselLog('watch started')
  rafId = requestAnimationFrame(frameLoop)
  if (store && !unsubscribeStore) {
    unsubscribeStore = store.subscribe((mutation) => carouselLog(`store: ${mutation.type}`))
  }
  try {
    const longTasks = new PerformanceObserver((list) => list.getEntries().forEach((e) => carouselLog(`long task: ${Math.round(e.duration)}ms`)))
    longTasks.observe({ entryTypes: ['longtask'] })
    observers.push(longTasks)
  } catch (e) {
    // longtask entries unsupported here
  }
  try {
    const resources = new PerformanceObserver((list) =>
      list.getEntries().forEach((e) => carouselLog(`request: ${e.initiatorType} ${String(e.name).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')} took ${Math.round(e.duration)}ms, ${e.transferSize || 0} bytes`))
    )
    resources.observe({ entryTypes: ['resource'] })
    observers.push(resources)
  } catch (e) {
    // resource entries unsupported here
  }
}
