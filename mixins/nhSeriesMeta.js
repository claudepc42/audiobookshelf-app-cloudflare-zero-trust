// Shared fetch for NH's combined series-meta payload (custom series covers,
// custom series descriptions, user avatar extensions) — one call covers every
// series card/header/avatar in the app. NH source: nhScFetch()
// (enhancements.js:4247-4263).
// One request at a time for the whole app. This used to be a flag on each component, so a page of
// series cards sent one identical request per card until the first answer arrived.
let sharedSeriesMetaPromise = null
let sharedSeriesMetaEpoch = -1
const SERIES_META_RETRY_MS = 60000

export default {
  computed: {
    // LazySeriesCard mounts its card instances manually (`new
    // ComponentClass().$mount()`, in mixins/bookshelfCardsHelpers.js) with no
    // `parent`, so Vuex's normal `$store` injection never runs there and
    // `this.$store` is undefined — same reason LazySeriesCard already has its
    // own `store` computed fallback. This mixin is shared with normally
    // template-rendered components too (where `this.$store` is always fine),
    // so the fallback has to live here rather than assume a host `store` exists.
    nhStore() {
      return this.$store || this.$nuxt?.$store
    },
    nhSeriesCoverUrl() {
      return (seriesId) => {
        if (!this.nhStore?.getters.nhServerFeaturesOn) return null
        const ext = this.nhStore?.state.nhSeriesCovers?.[seriesId]
        if (!ext) return null
        // Used directly as a CSS background-image url(), not routed through
        // $nativeHttp (which prefixes the server address itself) — a bare
        // relative path here resolves against the WebView's own local origin
        // instead of the actual server, so it must be made absolute here.
        const serverAddress = this.nhStore?.getters['user/getServerAddress']
        return serverAddress ? `${serverAddress}/_nh/series-covers/${seriesId}.${ext}` : null
      }
    }
  },
  methods: {
    ensureNhSeriesMeta() {
      const state = this.nhStore?.state
      if (!state || state.nhSeriesCovers) return
      // This server has no NanoHive backend (or the user turned the server features off)
      if (!this.nhStore.getters.nhServerFeaturesOn) return
      // One in flight per cache epoch: a request left over from before a server switch must neither
      // block the new server's fetch nor fill its caches
      if (sharedSeriesMetaPromise && sharedSeriesMetaEpoch === state.nhCacheEpoch) return
      // A failed fetch is retried after a minute, not stored as "loaded and empty" for the session
      if (Date.now() < state.nhSeriesMetaRetryAt) return
      // Cards mounted by hand have no parent, so Nuxt's injected $nativeHttp is not there and every
      // card threw a TypeError here. The shelves that mount normally do the fetch.
      if (!this.$nativeHttp) return
      const store = this.nhStore
      const epoch = state.nhCacheEpoch
      const promise = this.$nativeHttp
        .get('/_nh/api/series-meta')
        .then((res) => {
          if (store.state.nhCacheEpoch !== epoch) return
          store.commit('setNhSeriesMeta', { covers: res?.covers, descs: res?.descs, avatars: res?.avatars })
        })
        .catch(() => {
          if (store.state.nhCacheEpoch !== epoch) return
          store.commit('setNhSeriesMetaRetryAt', Date.now() + SERIES_META_RETRY_MS)
        })
        .finally(() => {
          if (sharedSeriesMetaPromise === promise) sharedSeriesMetaPromise = null
        })
      sharedSeriesMetaPromise = promise
      sharedSeriesMetaEpoch = epoch
    },
    // Reads the custom description text if it has been loaded, null otherwise. Read-only, so it's
    // safe to call while rendering; ensureNhSeriesDescText does the fetching.
    // NH source: nhSdText() (enhancements.js:4268-4279).
    nhSeriesDescText(seriesId) {
      if (!seriesId || !this.nhStore?.getters.nhServerFeaturesOn || !this.nhStore.state.nhSeriesDescs?.[seriesId]) return null
      return this.nhStore.state.nhSeriesDescText[seriesId] || null
    },
    // Starts the fetch for a series' custom description (once per series)
    ensureNhSeriesDescText(seriesId) {
      if (!seriesId || !this.nhStore?.getters.nhServerFeaturesOn || !this.nhStore.state.nhSeriesDescs?.[seriesId]) return
      if (this.nhStore.state.nhSeriesDescText[seriesId] !== undefined) return
      const store = this.nhStore
      store.commit('setNhSeriesDescText', { seriesId, text: '' })
      this.$nativeHttp
        .get(`/_nh/series-desc/${seriesId}.txt`)
        .then((text) => {
          store.commit('setNhSeriesDescText', { seriesId, text: String(text || '').trim() })
        })
        .catch(() => {
          // Let the next visit try again
          store.commit('setNhSeriesDescText', { seriesId, text: undefined })
        })
    },
    nhAvatarUrl(userId) {
      // A non-admin's own picked photo never reaches the server (admin-only write
      // endpoint there), so it's saved locally instead — shown only in this app,
      // for this user, taking priority over whatever the real shared avatar is.
      const localDataUrl = this.nhStore?.state.nhSettings?.localAvatarDataUrl
      const isMe = userId && userId === this.nhStore?.state.user?.user?.id
      if (isMe && localDataUrl) return localDataUrl

      if (!this.nhStore?.getters.nhServerFeaturesOn) return null
      const ext = this.nhStore?.state.nhAvatars?.[userId]
      if (!ext) return null
      // Same reasoning as nhSeriesCoverUrl above — used directly as an <img>
      // src/CSS background, needs an absolute URL, not a bare relative path.
      const serverAddress = this.nhStore?.getters['user/getServerAddress']
      return serverAddress ? `${serverAddress}/_nh/user-avatars/${userId}.${ext}` : null
    }
  }
}
