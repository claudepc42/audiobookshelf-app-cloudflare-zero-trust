// Reloads an <img> whose request failed (a dead zone, a dropped connection). A failed image is never
// requested again by the browser on its own, so a cover that failed once stayed broken until its card
// was rebuilt. Used by the covers that are plain <img> tags; BookCover.vue has its own retry.
const MAX_RETRIES = 5
const RETRY_BASE_MS = 2000
const RETRY_PARAM = /([?&])retry=\d+$/

// Images that ran out of retries, tried once more when the phone reports it is back online
const gaveUp = new Set()

const baseSrc = (src) => (src || '').replace(RETRY_PARAM, '')

// Call from the img's @error handler: retryImageLoad(event.target)
export function retryImageLoad(img) {
  if (!img || !img.getAttribute('src')) return
  const base = baseSrc(img.getAttribute('src'))
  // A different picture than last time (the card was reused for another book): start counting again
  if (img.dataset.retryBase !== base) {
    img.dataset.retryBase = base
    img.dataset.retries = '0'
  }
  const attempt = Number(img.dataset.retries || 0)
  if (attempt >= MAX_RETRIES) {
    gaveUp.add(img)
    return
  }
  img.dataset.retries = String(attempt + 1)
  setTimeout(() => {
    // Gone from the page, or showing a different picture by now
    if (!img.isConnected || baseSrc(img.getAttribute('src')) !== base) return
    img.src = `${base}${base.includes('?') ? '&' : '?'}retry=${attempt + 1}`
  }, RETRY_BASE_MS * Math.pow(2, attempt))
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    const images = [...gaveUp]
    gaveUp.clear()
    images.forEach((img) => {
      if (!img.isConnected) return
      img.dataset.retries = '0'
      retryImageLoad(img)
    })
  })
}
