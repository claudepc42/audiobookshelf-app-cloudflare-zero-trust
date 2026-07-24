<template>
  <div v-if="seriesName" id="nh-series-header">
    <div class="nh-sh-eyebrow">Series</div>
    <h1>{{ seriesName }}</h1>
    <div v-if="authorLine" class="nh-sh-author">{{ authorLine }}</div>
    <div v-if="statsLine" class="nh-sh-stats">{{ statsLine }}</div>
    <p v-if="description" class="nh-sh-desc">{{ description }}</p>
  </div>
</template>

<script>
// NH source: book-details.js nhSeriesHeader() (lines 1973-2058). Reads from the
// already-loaded bookshelf entities in source; we don't have access to the
// sibling bookshelf-lazy-bookshelf component's loaded items from here, so this
// fetches its own first page of series books via the same endpoint pattern
// pages/bookshelf/series/_id.vue already uses for series downloads.
export default {
  props: {
    seriesId: String,
    libraryId: String
  },
  data() {
    return {
      seriesName: '',
      authorLine: '',
      statsLine: '',
      description: ''
    }
  },
  methods: {
    async fetchAndBuild() {
      if (!this.seriesId || !this.libraryId) return
      const searchParams = new URLSearchParams()
      searchParams.set('filter', `series.${this.$encode(this.seriesId)}`)
      const payload = await this.$nativeHttp.get(`/api/libraries/${this.libraryId}/items?${searchParams.toString()}&limit=40&page=0&minified=1`).catch(() => null)
      if (!payload || !payload.results || !payload.results.length) return

      const entities = payload.results
      let seriesName = ''
      let best = null
      let bestScore = Infinity
      let dur = 0
      const authors = []

      entities.forEach((e) => {
        const md = (e.media && e.media.metadata) || {}
        if (e.media && e.media.duration) dur += e.media.duration
        if (md.authorName && authors.indexOf(md.authorName) === -1) authors.push(md.authorName)
        const se = md.series
        if (se && se.name && !seriesName) seriesName = se.name
        const q = se ? parseFloat(se.sequence) : NaN
        // integer >=1 scores its own value (1 wins), fractional >=1 after all
        // integers, sub-1 novellas after those, sequence-less last
        const score = isFinite(q) ? (q >= 1 ? (Number.isInteger(q) ? q : q + 1000) : q + 2000) : 3000
        if (score < bestScore) {
          bestScore = score
          best = e
        }
      })

      let desc = ''
      const raw = best && best.media && best.media.metadata && best.media.metadata.description
      if (raw) {
        const tmp = document.createElement('div')
        tmp.innerHTML = raw
        desc = (tmp.textContent || '').trim()
      }

      const total = payload.total && payload.total > entities.length ? payload.total : entities.length
      const allLoaded = !payload.total || entities.length >= payload.total
      const durStr = allLoaded && dur > 60 ? `${Math.floor(dur / 3600)}h ${Math.round((dur % 3600) / 60)}m` : ''
      const authStr = authors.slice(0, 2).join(', ') + (authors.length > 2 ? ' & more' : '')

      this.seriesName = seriesName
      this.authorLine = authStr ? `by ${authStr}` : ''
      this.statsLine = [`${total} ${total === 1 ? 'book' : 'books'}`, durStr].filter(Boolean).join(' · ')
      this.description = desc
    }
  },
  mounted() {
    this.fetchAndBuild()
    // NH source: document.body.classList.add('nh-series-page') (book-details.js
    // line 2041) — gates the series-page toolbar transparency (core.js lines
    // 695-701). Our CSS scopes that rule off <html> alongside data-theme, so the
    // class is added there instead of <body>.
    document.documentElement.classList.add('nh-series-page')
  },
  beforeDestroy() {
    document.documentElement.classList.remove('nh-series-page')
  }
}
</script>
