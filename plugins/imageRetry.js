// Recovers an <img> cover whose request failed (a dead zone, a dropped connection). A failed image is
// never requested again by the browser on its own, so a cover that failed once stayed broken until its
// card was rebuilt. Used by the covers that are plain <img> tags; BookCover.vue has its own version.
//
// On a failure: first show the saved copy of the cover (plugins/coverCache.js) if there is one; otherwise
// reload the live URL with a growing delay. When the phone reports it is online again, covers showing a
// saved copy go back to the live one, and covers that ran out of retries get another go.
const MAX_RETRIES = 5
const RETRY_BASE_MS = 2000
const RETRY_PARAM = /([?&])retry=\d+$/

// Images that ran out of retries, tried once more when the phone reports it is back online
const gaveUp = new Set()
// Images currently showing a saved copy instead of the live cover
const showingSaved = new Set()

const baseSrc = (src) => (src || '').replace(RETRY_PARAM, '')
const getCoverCache = () => (typeof window !== 'undefined' && window.$nuxt ? window.$nuxt.$coverCache : null)

// True while the img is showing the saved copy we put there (the card may since have been reused)
const isShowingSaved = (img) => !!img.dataset.savedUrl && img.getAttribute('src') === img.dataset.savedUrl

function clearSaved(img) {
  showingSaved.delete(img)
  delete img.dataset.savedUrl
  delete img.dataset.liveUrl
}

// Call from the img's @load handler on server covers: keeps a saved copy for when a later load fails
export function rememberCover(img) {
  if (!img || !img.getAttribute('src') || isShowingSaved(img)) return
  getCoverCache()?.remember(baseSrc(img.getAttribute('src')))
}

// Call from the img's @error handler: retryImageLoad(event.target)
export async function retryImageLoad(img) {
  if (!img || !img.getAttribute('src')) return
  const current = img.getAttribute('src')

  // The saved copy itself would not load: back to the live URL, and do not try the saved copy again
  if (isShowingSaved(img)) {
    const live = img.dataset.liveUrl
    clearSaved(img)
    img.dataset.savedBroken = '1'
    img.src = live
    return
  }
  // The card was reused for another book: forget everything about the previous one
  if (img.dataset.savedUrl) clearSaved(img)

  const base = baseSrc(current)
  if (img.dataset.retryBase !== base) {
    img.dataset.retryBase = base
    img.dataset.retries = '0'
    delete img.dataset.savedBroken
  }

  // First choice: the saved copy of this cover
  if (!img.dataset.savedBroken) {
    const saved = await getCoverCache()?.fallbackUrl(base)
    if (saved && img.isConnected && img.getAttribute('src') === current) {
      img.dataset.liveUrl = base
      img.dataset.savedUrl = saved
      showingSaved.add(img)
      img.src = saved
      return
    }
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
    // Showing a saved copy: go back to the live cover
    ;[...showingSaved].forEach((img) => {
      if (!img.isConnected || !isShowingSaved(img)) return clearSaved(img)
      const live = img.dataset.liveUrl
      clearSaved(img)
      img.dataset.retries = '0'
      img.src = live
    })
    const images = [...gaveUp]
    gaveUp.clear()
    images.forEach((img) => {
      if (!img.isConnected) return
      img.dataset.retries = '0'
      retryImageLoad(img)
    })
  })
}
