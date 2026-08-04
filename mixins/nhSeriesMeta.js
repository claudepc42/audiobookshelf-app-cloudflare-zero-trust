// Shared fetch for NH's combined series-meta payload (custom series covers,
// custom series descriptions, user avatar extensions) — one call covers every
// series card/header/avatar in the app. NH source: nhScFetch()
// (enhancements.js:4247-4263).
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
      if (!this.nhStore || this.nhStore.state.nhSeriesCovers || this._fetchingSeriesMeta) return
      this._fetchingSeriesMeta = true
      this.$nativeHttp
        .get('/_nh/api/series-meta')
        .then((res) => {
          this.nhStore.commit('setNhSeriesMeta', { covers: res?.covers, descs: res?.descs, avatars: res?.avatars })
        })
        .catch(() => {
          this.nhStore.commit('setNhSeriesMeta', { covers: {}, descs: {}, avatars: {} })
        })
    },
    // Returns the custom description text once loaded, null while pending/absent.
    // NH source: nhSdText() (enhancements.js:4268-4279).
    nhSeriesDescText(seriesId) {
      if (!seriesId || !this.nhStore?.state.nhSeriesDescs?.[seriesId]) return null
      const cached = this.nhStore.state.nhSeriesDescText[seriesId]
      if (cached !== undefined) return cached || null
      this.nhStore.commit('setNhSeriesDescText', { seriesId, text: '' })
      this.$nativeHttp
        .get(`/_nh/series-desc/${seriesId}.txt`)
        .then((text) => {
          this.nhStore.commit('setNhSeriesDescText', { seriesId, text: String(text || '').trim() })
        })
        .catch(() => {})
      return null
    },
    nhAvatarUrl(userId) {
      // A non-admin's own picked photo never reaches the server (admin-only write
      // endpoint there), so it's saved locally instead — shown only in this app,
      // for this user, taking priority over whatever the real shared avatar is.
      const localDataUrl = this.nhStore?.state.nhSettings?.localAvatarDataUrl
      const isMe = userId && userId === this.nhStore?.state.user?.user?.id
      if (isMe && localDataUrl) return localDataUrl

      const ext = this.nhStore?.state.nhAvatars?.[userId]
      if (!ext) return null
      // Same reasoning as nhSeriesCoverUrl above — used directly as an <img>
      // src/CSS background, needs an absolute URL, not a bare relative path.
      const serverAddress = this.nhStore?.getters['user/getServerAddress']
      return serverAddress ? `${serverAddress}/_nh/user-avatars/${userId}.${ext}` : null
    }
  }
}
