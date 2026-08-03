<template>
  <div v-if="seriesName || loading" id="nh-series-header" :class="{ 'nh-sh-loading': loading }">
    <div v-if="displayCoverUrl" class="nh-sh-cover nh-on" :style="{ backgroundImage: `url(${displayCoverUrl})` }" />
    <div class="nh-sh-eyebrow">Series</div>
    <h1>{{ seriesName }}</h1>
    <div v-if="authorLine || loading" class="nh-sh-author">{{ authorLine }}</div>
    <div v-if="statsLine || loading" class="nh-sh-stats">{{ statsLine }}</div>
    <!-- NH source: nhSeriesBooksAvg() (enhancements.js:3843-3883) — the series
         rating is DERIVED from the member books' own ratings, not a separate
         user-entered series rating. Read-only, no picker. -->
    <div v-if="booksAvg" class="nh-sh-rate">
      <span class="nh-rt-stars">
        <span>★★★★★</span>
        <span class="nh-rt-fill" :style="{ width: (Math.max(0, Math.min(5, booksAvg.avg)) / 5) * 100 + '%' }">★★★★★</span>
      </span>
      <span class="nh-rt-score">{{ booksAvgText }}</span>
    </div>
    <p v-if="displayDescription || loading" ref="desc" class="nh-sh-desc" :class="{ 'nh-open': descOpen }">{{ displayDescription }}</p>
    <button v-if="descClamped || descOpen" type="button" class="nh-sh-more" @click="descOpen = !descOpen">
      {{ descOpen ? 'Show less' : 'Show more' }}
    </button>
  </div>
</template>

<script>
import nhRatingsBulk from '@/mixins/nhRatingsBulk'
import nhSeriesMeta from '@/mixins/nhSeriesMeta'

// NH source: book-details.js nhSeriesHeader() (lines 1973-2058) for the general
// shape; the cover/rating/description-preservation details are actually from
// enhancements.js's real nhSeriesHeader() (lines 3633-3823), which supersedes
// the book-details.js citation — this component's data comes from the
// already-loaded bookshelf entities in source; we don't have access to the
// sibling bookshelf-lazy-bookshelf component's loaded items from here, so this
// fetches its own first page of series books via the same endpoint pattern
// pages/bookshelf/series/_id.vue already uses for series downloads.
export default {
  mixins: [nhRatingsBulk, nhSeriesMeta],
  props: {
    seriesId: String,
    libraryId: String
  },
  data() {
    return {
      loading: true,
      seriesName: '',
      authorLine: '',
      statsLine: '',
      description: '',
      coverUrl: '',
      entityIds: [],
      descClamped: false,
      descOpen: false
    }
  },
  computed: {
    // NH source: nhSeriesBooksAvg() math (enhancements.js:3871-3881) — mean of
    // each rated member book's OWN average, only counting books with >=1 rating.
    booksAvg() {
      if (!this.entityIds.length) return null
      let sum = 0
      let rated = 0
      this.entityIds.forEach((id) => {
        const r = this.nhRatingAvgFor(id)
        if (!r) return
        sum += r.avg
        rated++
      })
      return rated ? { avg: sum / rated, n: rated } : null
    },
    booksAvgText() {
      return this.booksAvg ? Number(this.booksAvg.avg.toFixed(2)).toString() : ''
    },
    // NH source: nhScUrl(seriesId) || book-derived fallback (enhancements.js:3822,
    // nhSeriesHeaderCover) — an admin-set custom cover wins over the auto-derived one.
    displayCoverUrl() {
      return this.nhSeriesCoverUrl(this.seriesId) || this.coverUrl
    },
    // NH source: nhSdText(seriesId) override wins over book #1's blurb
    // (enhancements.js:3753-3755).
    displayDescription() {
      return this.nhSeriesDescText(this.seriesId) || this.description
    }
  },
  methods: {
    async fetchAndBuild() {
      if (!this.seriesId || !this.libraryId) return
      const searchParams = new URLSearchParams()
      searchParams.set('filter', `series.${this.$encode(this.seriesId)}`)
      const payload = await this.$nativeHttp.get(`/api/libraries/${this.libraryId}/items?${searchParams.toString()}&limit=40&page=0&minified=1`).catch(() => null)
      this.loading = false
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
        // NH source (enhancements.js:3745-3750): <br>/<p> become newlines BEFORE
        // stripping the rest, so paragraph structure survives into the pre-line
        // rendering below — a DOMParser-based textContent extraction alone (as
        // used elsewhere, e.g. HeroCarousel.vue) would flatten paragraphs.
        // DOMParser's parsed document is inert either way, unlike a detached
        // <div> + .innerHTML, which isn't guaranteed safe across every WebView.
        const withBreaks = String(raw).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
        const doc = new DOMParser().parseFromString(withBreaks, 'text/html')
        desc = (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
      }

      const total = payload.total && payload.total > entities.length ? payload.total : entities.length
      const allLoaded = !payload.total || entities.length >= payload.total
      const durStr = allLoaded && dur > 60 ? `${Math.floor(dur / 3600)}h ${Math.round((dur % 3600) / 60)}m` : ''
      const authStr = authors.slice(0, 2).join(', ') + (authors.length > 2 ? ' & more' : '')

      this.seriesName = seriesName
      this.authorLine = authStr ? `by ${authStr}` : ''
      this.statsLine = [`${total} ${total === 1 ? 'book' : 'books'}`, durStr].filter(Boolean).join(' · ')
      this.description = desc
      this.entityIds = entities.map((e) => e.id).filter(Boolean)
      // NH source: nhSeriesHeaderCover() default 'grid' composite mode is a
      // browser-canvas composite of multiple covers — not attempted here.
      // 'first' mode (best book's own cover) is the simple, portable case and
      // is what this uses. Admin custom-cover upload (nhScUpload) is a separate
      // admin content-management tool, not part of "series header UI" — left out.
      if (best && best.id) {
        this.coverUrl = this.$store.getters['globals/getLibraryItemCoverSrcById'](best.id)
      }
      const s = this.$store.state.nhSettings
      if (s.showRatings !== false && s.showCardRatings !== false) this.ensureNhRatingsBulk()
      this.$nextTick(this.measureDescClamp)
    },
    measureDescClamp() {
      const el = this.$refs.desc
      this.descClamped = !!el && !this.descOpen && el.scrollHeight > el.clientHeight + 2
    }
  },
  watch: {
    descOpen() {
      this.$nextTick(this.measureDescClamp)
    },
    // Re-measure when an async custom-description override lands after the
    // initial render (nhSeriesDescText resolves lazily).
    displayDescription() {
      this.$nextTick(this.measureDescClamp)
    }
  },
  mounted() {
    this.fetchAndBuild()
    this.ensureNhSeriesMeta()
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
