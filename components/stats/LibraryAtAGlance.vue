<template>
  <div v-if="isAdminOrUp && glance" class="w-full my-6 px-4">
    <h1 class="text-xl mb-2">{{ $strings.HeaderLibraryAtAGlance }}</h1>
    <div class="flex flex-wrap text-center">
      <div class="flex p-2">
        <div class="px-3">
          <p class="text-3xl font-bold">{{ $formatNumber(glance.items) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelBooks }}</p>
        </div>
      </div>
      <div class="flex p-2">
        <div class="px-3">
          <p class="text-3xl font-bold">{{ $formatNumber(glance.authors) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.ButtonAuthors }}</p>
        </div>
      </div>
      <div class="flex p-2">
        <div class="px-3">
          <p class="text-3xl font-bold">{{ $formatNumber(glance.series) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelSeries }}</p>
        </div>
      </div>
      <div class="flex p-2">
        <div class="px-3">
          <p class="text-3xl font-bold">{{ $formatNumber(glance.genres) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelGenres }}</p>
        </div>
      </div>
      <div class="flex p-2">
        <div class="px-3">
          <p class="text-3xl font-bold">{{ $elapsedPretty(glance.duration) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelDuration }}</p>
        </div>
      </div>
      <div class="flex p-2">
        <div class="px-3">
          <p class="text-3xl font-bold">{{ $bytesPretty(glance.size) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelSize }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// Ported from NH source: nhLsGlanceFetch()/nhLsGlance() (enhancements.js:12723-
// 12759, NH v2.7.x's "Library at a glance" (#33)). Sums /api/libraries/:id/stats
// (totalItems, totalAuthors, totalDuration, totalSize, genresWithCount) plus a
// /api/libraries/:id/series?limit=1 count (the stats endpoint has no series
// total of its own) across every book library — both real ABS admin endpoints,
// no NH-proxy dependency.
//
// Scoped to just this tile grid, not NH's full nhLibraryStats() page: that also
// rebuilds ABS's whole admin "Library Stats" screen (per-library item scan for
// live genres, top-books-by-time, best-rated) — this app's own admin surface
// for that overlaps with the already-ported stats-server-ranking below it on
// this page, so duplicating it wasn't worth the added surface here.
export default {
  data() {
    return {
      libraryStats: {}
    }
  },
  computed: {
    isAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    bookLibraries() {
      return (this.$store.state.libraries.libraries || []).filter((l) => l.mediaType === 'book')
    },
    glance() {
      const have = this.bookLibraries.map((l) => this.libraryStats[l.id]).filter(Boolean)
      if (!have.length) return null
      const out = { items: 0, authors: 0, series: 0, genres: 0, duration: 0, size: 0 }
      const genreSet = new Set()
      have.forEach((s) => {
        out.items += s.stats?.totalItems || 0
        out.authors += s.stats?.totalAuthors || 0
        out.series += s.seriesCount || 0
        out.duration += s.stats?.totalDuration || 0
        out.size += s.stats?.totalSize || 0
        ;(s.stats?.genresWithCount || []).forEach((g) => genreSet.add(g.genre))
      })
      out.genres = genreSet.size
      return out
    }
  },
  methods: {
    async fetchLibrary(libraryId) {
      if (this.libraryStats[libraryId]) return
      const [stats, series] = await Promise.all([
        this.$nativeHttp.get(`/api/libraries/${libraryId}/stats`).catch(() => null),
        this.$nativeHttp.get(`/api/libraries/${libraryId}/series?limit=1`).catch(() => null)
      ])
      if (!stats) return
      this.$set(this.libraryStats, libraryId, { stats, seriesCount: typeof series?.total === 'number' ? series.total : 0 })
    }
  },
  mounted() {
    if (!this.isAdminOrUp) return
    this.bookLibraries.forEach((l) => this.fetchLibrary(l.id))
  }
}
</script>
