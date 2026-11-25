// Saved copies of server covers, so a cover that fails to load (dead zone, expired browser cache, a
// refreshed token that changed every cover URL) can still show the picture instead of a blank card.
//
// How it works: whenever a server cover loads, a medium-size copy is downloaded once through the app's
// own HTTP layer (the same one that handles the Cloudflare session) and saved in IndexedDB. When a cover
// fails, the card asks for the saved copy of that book instead. Copies are keyed by library item id and
// remember the cover's `ts` (last-update stamp), so a changed cover is saved again. Total size is capped
// and the least recently used copies are dropped first.
const DB_NAME = 'abs-cover-cache'
const MAX_BYTES = 100 * 1024 * 1024
const COPY_WIDTH = 800 // px; plenty for the big player cover, small on disk
const MAX_PARALLEL = 2
const START_DELAY_MS = 2500 // let the covers that are on screen load first

const COVER_URL = /\/api\/items\/([^/?#]+)\/cover(?:\?([^#]*))?/

// Decode base64 into bytes, and only accept real images: a stale Cloudflare session can answer with an
// HTML login page, which must never be saved as a cover.
function toImageBlob(base64) {
  if (typeof base64 !== 'string' || base64.length < 100) return null
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  let type = null
  if (bytes[0] === 0xff && bytes[1] === 0xd8) type = 'image/jpeg'
  else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) type = 'image/png'
  else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) type = 'image/gif'
  else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) type = 'image/webp'
  if (!type) return null
  return new Blob([bytes], { type })
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

class CoverCache {
  constructor() {
    this.dbPromise = null
    this.index = null // id -> { ts, size, lastUsed }
    this.objectUrls = new Map() // id -> { stamp, url } blob URLs handed out this session
    this.attempted = new Set() // "id|ts" already queued or saved this session
    this.queue = []
    this.active = 0
    this.timer = null
  }

  // The item id and ts stamp inside a server cover URL, or null for anything else (placeholders, local files)
  parse(url) {
    const m = COVER_URL.exec(url || '')
    if (!m) return null
    const params = new URLSearchParams(m[2] || '')
    return { id: decodeURIComponent(m[1]), ts: params.get('ts') || '' }
  }

  openDb() {
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('meta', { keyPath: 'id' })
        db.createObjectStore('blobs', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }).catch((e) => {
      this.dbPromise = null
      throw e
    })
    return this.dbPromise
  }

  // Runs fn(transaction) and resolves with its result once the transaction has committed
  async tx(stores, mode, fn) {
    const db = await this.openDb()
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode)
      let result
      Promise.resolve(fn(t)).then((r) => (result = r), reject)
      t.oncomplete = () => resolve(result)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  }

  async loadIndex() {
    if (this.index) return this.index
    const rows = await this.tx(['meta'], 'readonly', (t) => reqAsPromise(t.objectStore('meta').getAll()))
    if (!this.index) this.index = new Map(rows.map((r) => [r.id, { ts: r.ts, size: r.size, lastUsed: r.lastUsed }]))
    return this.index
  }

  /**
   * An object URL for the saved copy of the cover at `url`, or null if there is none. Any saved copy
   * counts, even an older version of the cover: showing it beats showing nothing.
   */
  async fallbackUrl(url) {
    const parsed = this.parse(url)
    if (!parsed) return null
    try {
      const index = await this.loadIndex()
      const meta = index.get(parsed.id)
      if (!meta) return null
      const stamp = `${meta.ts}|${meta.size}`
      const handed = this.objectUrls.get(parsed.id)
      if (handed && handed.stamp === stamp) return handed.url
      const row = await this.tx(['blobs'], 'readonly', (t) => reqAsPromise(t.objectStore('blobs').get(parsed.id)))
      if (!row || !row.blob) return null
      if (handed) URL.revokeObjectURL(handed.url)
      const objectUrl = URL.createObjectURL(row.blob)
      this.objectUrls.set(parsed.id, { stamp, url: objectUrl })
      meta.lastUsed = Date.now()
      this.tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put({ id: parsed.id, ...meta })).catch(() => {})
      return objectUrl
    } catch (e) {
      console.warn('[coverCache] fallbackUrl failed', e)
      return null
    }
  }

  /** Call when a server cover has loaded: saves a copy the first time (or when the cover changed). */
  async remember(url) {
    const parsed = this.parse(url)
    if (!parsed) return
    const key = `${parsed.id}|${parsed.ts}`
    if (this.attempted.has(key)) return
    this.attempted.add(key)
    try {
      const index = await this.loadIndex()
      const meta = index.get(parsed.id)
      if (meta && meta.ts === parsed.ts) return // already saved
    } catch (e) {
      return
    }
    this.queue.push(parsed)
    this.pump()
  }

  pump() {
    if (this.timer || !this.queue.length) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.drain()
    }, START_DELAY_MS)
  }

  drain() {
    while (this.active < MAX_PARALLEL && this.queue.length) {
      const item = this.queue.shift()
      this.active++
      this.download(item)
        .catch((e) => {
          // Offline or a server error: allow another try the next time this cover loads
          this.attempted.delete(`${item.id}|${item.ts}`)
          console.warn('[coverCache] could not save cover', item.id, e?.message || e)
        })
        .finally(() => {
          this.active--
          this.drain()
        })
    }
  }

  async download({ id, ts }) {
    const nuxt = typeof window !== 'undefined' ? window.$nuxt : null
    if (!nuxt || !nuxt.$nativeHttp || !nuxt.$store.state.networkConnected) throw new Error('not ready')
    const base64 = await nuxt.$nativeHttp.get(`/api/items/${id}/cover?width=${COPY_WIDTH}&format=jpeg`, { responseType: 'blob', connectTimeout: 10000, readTimeout: 20000 })
    const blob = toImageBlob(base64)
    if (!blob) throw new Error('response was not an image')
    const index = await this.loadIndex()
    await this.tx(['meta', 'blobs'], 'readwrite', (t) => {
      t.objectStore('blobs').put({ id, blob })
      t.objectStore('meta').put({ id, ts, size: blob.size, lastUsed: Date.now() })
    })
    index.set(id, { ts, size: blob.size, lastUsed: Date.now() })
    await this.trim()
  }

  // Drop the least recently used copies until the total is under the cap
  async trim() {
    const index = await this.loadIndex()
    let total = 0
    index.forEach((m) => (total += m.size || 0))
    if (total <= MAX_BYTES) return
    const oldest = [...index.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    const drop = []
    for (const [id, m] of oldest) {
      if (total <= MAX_BYTES * 0.9) break
      total -= m.size || 0
      drop.push(id)
    }
    await this.tx(['meta', 'blobs'], 'readwrite', (t) => {
      drop.forEach((id) => {
        t.objectStore('meta').delete(id)
        t.objectStore('blobs').delete(id)
      })
    })
    drop.forEach((id) => {
      index.delete(id)
      const handed = this.objectUrls.get(id)
      if (handed) {
        URL.revokeObjectURL(handed.url)
        this.objectUrls.delete(id)
      }
    })
  }
}

export default (context, inject) => {
  inject('coverCache', new CoverCache())
}
