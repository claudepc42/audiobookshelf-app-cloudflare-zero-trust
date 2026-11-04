<template>
  <div v-if="series.length" id="nh-recent-series-row">
    <h2 class="nh-rs-heading">{{ $strings.LabelRecentSeries }}</h2>
    <div class="nh-rs-scroll">
      <div v-for="s in series" :key="s.id" class="nh-rs-card" @click="openSeries(s)">
        <div class="nh-rs-covers">
          <div v-for="(book, i) in s.books" :key="i" :class="['nh-rs-cover', `c${i + 1}`]">
            <i class="nh-rs-bg" :style="{ backgroundImage: `url(${coverSrc(book)})` }" />
            <i class="nh-rs-fg" :style="{ backgroundImage: `url(${coverSrc(book)})` }" />
          </div>
          <div class="nh-rs-count">{{ s.count }}</div>
        </div>
        <p class="nh-rs-name">{{ s.name }}</p>
      </div>
    </div>
  </div>
</template>

<script>
// NH source: enhancements.js section 10 "CUSTOM EXPANDED RECENT SERIES SHELF"
// (fetchRecentSeries/renderRecentSeriesInner/manageRecentSeries, lines 1686-1948).
// Fetches series sorted by addedAt separately from the normal shelf list and
// renders a horizontal-scroll row of triple-stacked-cover cards.
export default {
  data() {
    return {
      series: [],
      lastKey: ''
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    nhSettings() {
      return this.$store.state.nhSettings
    },
    recentSeriesCount() {
      return Math.max(1, parseInt(this.nhSettings.recentSeriesCount, 10) || 12)
    }
  },
  watch: {
    currentLibraryId() {
      this.fetchSeries()
    },
    recentSeriesCount() {
      this.fetchSeries()
    }
  },
  methods: {
    coverSrc(book) {
      return this.$store.getters['globals/getLibraryItemCoverSrc'](book) || ''
    },
    mapResults(results) {
      return results.map((s) => {
        const books = s.books || []
        return {
          id: s.id,
          name: s.name,
          count: books.length,
          // Just enough to build the cover URL at render time. The URL itself isn't kept (it holds
          // the server address and, on servers older than 2.17, the access token) because this list is
          // cached in plain storage.
          books: books.slice(0, 3).map((b) => ({ id: b.id, updatedAt: b.updatedAt, media: { coverPath: b.media?.coverPath } }))
        }
      })
    },
    async fetchSeries() {
      const libId = this.currentLibraryId
      if (!libId) {
        this.series = []
        return
      }
      const key = `${libId}:${this.recentSeriesCount}`
      if (key === this.lastKey) return

      const res = await this.$nativeHttp.get(`/api/libraries/${libId}/series?sort=addedAt&desc=1&limit=${this.recentSeriesCount}&page=0`).catch(() => null)
      // The library can change while the request is out: don't show (or cache) the old library's series
      if (this.currentLibraryId !== libId) return
      if (!res || !res.results) {
        // Fetch failed — leave lastKey unset so the next navigation/settings
        // change retries, and keep whatever is already showing (cache or prior
        // fetch) rather than blanking the shelf.
        return
      }
      this.lastKey = key
      this.series = this.mapResults(res.results)
      this.$localStore.setNhRecentSeriesCache(libId, this.series)
    },
    openSeries(s) {
      this.$router.push(`/bookshelf/series/${s.id}`)
    }
  },
  async mounted() {
    const libId = this.currentLibraryId
    if (libId) {
      const cached = await this.$localStore.getNhRecentSeriesCache(libId)
      // Entries cached by older versions held cover URLs instead of books; those are skipped
      if (cached && cached.length && cached.every((s) => s.books)) this.series = cached
    }
    this.fetchSeries()
  }
}
</script>
