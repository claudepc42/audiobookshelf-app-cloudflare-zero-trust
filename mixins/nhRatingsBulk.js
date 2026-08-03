// Shared bulk-ratings cache used by card badges (LazyBookCard/LazySeriesCard),
// search rows, and the series header's derived average. NH source: nhRsItems()
// (enhancements.js:4700-4722) — one GET /_nh/api/ratings (no item= param) covers
// every card instead of one fetch each, cached 60s, same as NH's nhRs.
const STALE_MS = 60000

export default {
  computed: {
    // LazyBookCard/LazySeriesCard mount their card instances manually
    // (`new ComponentClass().$mount()`, in mixins/bookshelfCardsHelpers.js) with
    // no `parent`, so Vuex's normal `$store` injection (which walks up from a
    // parent) never runs and `this.$store` is undefined there — same reason
    // those two components already have their own `store` computed fallback.
    // This mixin is shared with plain template-rendered components too (where
    // `this.$store` is always fine), so the fallback has to live here instead
    // of assuming a host-provided `store` computed exists.
    nhStore() {
      return this.$store || this.$nuxt?.$store
    },
    nhRatingsBulk() {
      return this.nhStore?.state.nhRatingsBulk
    }
  },
  methods: {
    ensureNhRatingsBulk() {
      if (!this.nhStore || this.nhStore.state.nhRatingsDead) return
      const stale = Date.now() - this.nhStore.state.nhRatingsBulkAt > STALE_MS
      if (this.nhStore.state.nhRatingsBulk && !stale) return
      if (this._nhRatingsBulkFetching) return
      this._nhRatingsBulkFetching = true
      this.$nativeHttp
        .get('/_nh/api/ratings')
        .then((res) => {
          this._nhRatingsBulkFetching = false
          if (res && res.items) this.nhStore.commit('setNhRatingsBulk', res.items)
        })
        .catch(() => {
          this._nhRatingsBulkFetching = false
          // $nativeHttp's thrown Error only carries a message string, not the actual
          // HTTP status — no reliable way to detect "404, backend truly absent" the
          // way NH's own fetch()-based client can (enhancements.js:4711, checking
          // r.status directly). Instead of guessing from message text, give up
          // permanently after several consecutive failed attempts (each call here is
          // already naturally rate-limited to once per 60s by the staleness check
          // above), which reaches the same end state — stop asking — without
          // depending on fragile string matching.
          this.nhStore.commit('bumpNhRatingsBulkFails')
        })
    },
    // NH source: nhRsAvg() (enhancements.js:4724-4733), values ported exactly.
    nhRatingAvgFor(itemId) {
      const rs = this.nhRatingsBulk && itemId ? this.nhRatingsBulk[itemId] : null
      if (!rs) return null
      let sum = 0
      let n = 0
      Object.keys(rs).forEach((k) => {
        const v = rs[k] && rs[k].stars
        if (typeof v === 'number') {
          sum += v
          n++
        }
      })
      return n ? { avg: sum / n, n } : null
    }
  }
}
