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
        return ext ? `/_nh/series-covers/${seriesId}.${ext}` : null
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
      const ext = this.nhStore?.state.nhAvatars?.[userId]
      return ext ? `/_nh/user-avatars/${userId}.${ext}` : null
    }
  }
}
