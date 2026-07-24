<template>
  <div v-if="series.length" id="nh-recent-series-row">
    <h2 class="nh-rs-heading">Recent Series</h2>
    <div class="nh-rs-scroll">
      <div v-for="s in series" :key="s.id" class="nh-rs-card" @click="openSeries(s)">
        <div class="nh-rs-covers">
          <div v-for="(cover, i) in s.covers" :key="i" :class="['nh-rs-cover', `c${i + 1}`]">
            <i class="nh-rs-bg" :style="{ backgroundImage: `url(${cover})` }" />
            <i class="nh-rs-fg" :style="{ backgroundImage: `url(${cover})` }" />
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
    async fetchSeries() {
      const libId = this.currentLibraryId
      if (!libId) {
        this.series = []
        return
      }
      const key = `${libId}:${this.recentSeriesCount}`
      if (key === this.lastKey) return
      this.lastKey = key

      const res = await this.$nativeHttp.get(`/api/libraries/${libId}/series?sort=addedAt&desc=1&limit=${this.recentSeriesCount}&page=0`).catch(() => null)
      if (!res || !res.results) {
        this.series = []
        return
      }
      this.series = res.results.map((s) => {
        const books = s.books || []
        return {
          id: s.id,
          name: s.name,
          count: books.length,
          covers: books.slice(0, 3).map((b) => this.coverSrc(b))
        }
      })
    },
    openSeries(s) {
      this.$router.push(`/bookshelf/series/${s.id}`)
    }
  },
  mounted() {
    this.fetchSeries()
  }
}
</script>
