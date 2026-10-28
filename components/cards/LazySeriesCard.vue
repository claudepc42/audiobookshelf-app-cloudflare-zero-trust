<template>
  <div ref="card" :id="`series-card-${index}`" :style="{ width: width + 'px', height: height + 'px' }" class="rounded-sm cursor-pointer z-30" @click="clickCard">
    <div class="absolute top-0 left-0 w-full box-shadow-book shadow-height" />
    <div class="w-full h-full bg-primary relative rounded overflow-hidden">
      <!-- NH source: nhSeriesCardCovers() (enhancements.js:4382-...) — swaps the
           stacked-covers tile for an admin-uploaded custom cover when present. -->
      <div v-if="customCoverUrl" class="w-full h-full bg-cover bg-center" :style="{ backgroundImage: `url(${customCoverUrl})` }" />
      <covers-group-cover v-else-if="series" ref="cover" :id="seriesId" :name="title" :book-items="books" :width="width" :height="height" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>

    <div v-if="seriesPercentInProgress > 0" class="absolute bottom-0 left-0 h-1 max-w-full z-10 rounded-b w-full box-shadow-progressbar nh-series-progressbar" :class="isSeriesFinished ? 'bg-success' : 'bg-yellow-400'" :style="{ width: seriesPercentInProgress * 100 + '%' }" />

    <!-- NH source: nhSpPaint() (enhancements.js:6222-6244) — tick for fully
         finished, a ring filled to the finished fraction otherwise; two
         distinct shapes (not just two colors) so the states read apart for
         colorblind viewers too. Finished-only, same as the progress bar
         above — merely started marks neither. -->
    <div v-if="nhThemeActive && seriesFinishedFraction !== null" class="nh-sp" :class="{ 'nh-sp-some': !isSeriesFinished }" :title="seriesBadgeLabel">
      <svg v-if="isSeriesFinished" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.8 9.5 17.8 19.5 6.8" /></svg>
      <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="4.2" opacity="0.32" />
        <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" :stroke-dasharray="seriesRingDasharray" transform="rotate(-90 12 12)" />
      </svg>
    </div>

    <!-- NH source: core.js [cy-id="seriesLengthMarker"] (lines 381-382) — frosted
         white pill, bottom-left, showing the book count. Missing entirely before. -->
    <div v-if="nhThemeActive && books.length" class="nh-series-length-marker absolute z-20">
      <p>{{ books.length }}</p>
    </div>

    <!-- NH source: nhSeriesBooksAvg() math applied to card badges (enhancements.js:5818-5825) -->
    <div v-if="cardRating" class="nh-card-rating">
      <span v-nh-star-nudge class="nh-cr-stars">
        <span>★★★★★</span>
        <span class="nh-cr-fill" :style="{ width: (Math.max(0, Math.min(5, cardRating.avg)) / 5) * 100 + '%' }">★★★★★</span>
      </span>
      <span class="nh-cr-num">{{ Number(cardRating.avg.toFixed(1)) }}</span>
    </div>

    <div v-if="isAltViewEnabled && isCategorized" class="absolute z-30 left-0 right-0 mx-auto -bottom-8 h-8 py-1 rounded-md text-center">
      <p class="truncate" :style="{ fontSize: labelFontSize + 'rem' }">{{ title }}</p>
    </div>
    <div v-if="!isCategorized" class="categoryPlacard absolute z-30 left-0 right-0 mx-auto -bottom-6 h-6 rounded-md text-center" :style="{ width: Math.min(240, width) + 'px' }">
      <div class="w-full h-full flex items-center justify-center rounded-sm border" :class="isAltViewEnabled ? 'altBookshelfLabel' : 'shinyBlack'" :style="{ padding: `0rem ${0.5 * sizeMultiplier}rem` }">
        <p class="truncate" :style="{ fontSize: labelFontSize + 'rem' }">{{ title }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import nhRatingsBulk from '@/mixins/nhRatingsBulk'
import nhSeriesMeta from '@/mixins/nhSeriesMeta'

export default {
  mixins: [nhRatingsBulk, nhSeriesMeta],
  props: {
    index: Number,
    width: Number,
    height: Number,
    bookCoverAspectRatio: Number,
    seriesMount: {
      type: Object,
      default: () => null
    },
    isAltViewEnabled: Boolean,
    isCategorized: Boolean
  },
  data() {
    return {
      series: null
    }
  },
  computed: {
    labelFontSize() {
      if (this.width < 160) return 0.75
      return 0.875
    },
    sizeMultiplier() {
      if (this.bookCoverAspectRatio === 1) return this.width / (120 * 1.6 * 2)
      return this.width / 240
    },
    title() {
      return this.series ? this.series.name : ''
    },
    books() {
      return this.series ? this.series.books || [] : []
    },
    seriesBookProgress() {
      return this.books
        .map((libraryItem) => {
          return this.store.getters['user/getUserMediaProgress'](libraryItem.id)
        })
        .filter((p) => !!p)
    },
    seriesBooksFinished() {
      return this.seriesBookProgress.filter((p) => p.isFinished)
    },
    hasSeriesBookInProgress() {
      return this.seriesBookProgress.some((p) => !p.isFinished && p.progress > 0)
    },
    seriesPercentInProgress() {
      let totalFinishedAndInProgress = this.seriesBooksFinished.length
      if (this.hasSeriesBookInProgress) totalFinishedAndInProgress += 1
      return Math.min(1, Math.max(0, totalFinishedAndInProgress / this.books.length))
    },
    isSeriesFinished() {
      return this.books.length === this.seriesBooksFinished.length
    },
    // NH source: nhSpState() (enhancements.js:6205-6212) — null (no badge) until
    // at least one book is finished; merely-started books don't count.
    seriesFinishedFraction() {
      if (!this.books.length || !this.seriesBooksFinished.length) return null
      return this.seriesBooksFinished.length / this.books.length
    },
    seriesRingDasharray() {
      const c = 2 * Math.PI * 8
      const on = Math.max(c * 0.08, c * Math.min(1, Math.max(0, this.seriesFinishedFraction || 0)))
      return `${on.toFixed(2)} ${(c - on).toFixed(2)}`
    },
    seriesBadgeLabel() {
      if (this.isSeriesFinished) return this.$getString('LabelSeriesAllFinished', [this.books.length])
      return this.$getString('LabelSeriesSomeFinished', [this.seriesBooksFinished.length, this.books.length])
    },
    store() {
      return this.$store || this.$nuxt.$store
    },
    currentLibraryId() {
      return this.store.state.libraries.currentLibraryId
    },
    seriesId() {
      return this.series ? this.series.id : null
    },
    customCoverUrl() {
      return this.nhThemeActive ? this.nhSeriesCoverUrl(this.seriesId) : null
    },
    nhThemeActive() {
      return this.store.state.nhThemeActive
    },
    ratingsEnabledForLibrary() {
      const s = this.store.state.nhSettings
      if (s.showRatings === false || s.showCardRatings === false) return false
      const libs = s.ratingLibs && typeof s.ratingLibs === 'object' ? s.ratingLibs : {}
      if (this.currentLibraryId && Object.prototype.hasOwnProperty.call(libs, this.currentLibraryId)) return libs[this.currentLibraryId] !== false
      return true
    },
    cardRating() {
      if (!this.nhThemeActive || !this.ratingsEnabledForLibrary || !this.books.length) return null
      let sum = 0
      let rated = 0
      this.books.forEach((b) => {
        const r = this.nhRatingAvgFor(b.id)
        if (!r) return
        sum += r.avg
        rated++
      })
      return rated ? { avg: sum / rated, n: rated } : null
    }
  },
  methods: {
    setEntity(_series) {
      this.series = _series
    },
    setSelectionMode(val) {},
    clickCard() {
      if (!this.series) return
      var router = this.$router || this.$nuxt.$router
      router.push(`/bookshelf/series/${this.seriesId}`)
    },
    destroy() {
      // destroy the vue listeners, etc
      this.$destroy()

      // remove the element from the DOM
      if (this.$el && this.$el.parentNode) {
        this.$el.parentNode.removeChild(this.$el)
      } else if (this.$el && this.$el.remove) {
        this.$el.remove()
      }
    }
  },
  mounted() {
    if (this.seriesMount) {
      this.setEntity(this.seriesMount)
    }
    if (this.nhThemeActive && this.ratingsEnabledForLibrary) this.ensureNhRatingsBulk()
    if (this.nhThemeActive) this.ensureNhSeriesMeta()
  },
  beforeDestroy() {}
}
</script>
