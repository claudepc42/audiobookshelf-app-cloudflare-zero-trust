<template>
  <div ref="card" :id="`collection-card-${index}`" :style="{ width: width + 'px', height: height + 'px' }" class="rounded-sm cursor-pointer z-30" @click="clickCard">
    <div class="absolute top-0 left-0 w-full box-shadow-book shadow-height" />
    <div class="w-full h-full bg-primary relative rounded overflow-hidden">
      <covers-collection-cover v-if="!nhThemeActive" ref="cover" :book-items="books" :width="width" :height="height" :book-cover-aspect-ratio="bookCoverAspectRatio" />
      <!-- NH source: collection icon-emblem (enhancements.js:8041-8051, core.js:1721-1738),
           replaces the native two-book cover collage. Icon/tint from an admin-set
           override (/_nh/collection-art.json, if a NanoHive backend is present) or an
           automatic name-based template match (nhColMatch — entirely client-side, no
           backend needed for this part). Admin icon-picker/creation-dialog UI (the rest
           of NH's custom collections-grid rebuild) is a separate admin tool, out of scope
           here — this is the read/display half only. -->
      <div v-else class="nh-cl-emblem" :style="{ '--nh-cl-bg': emblemBg }">
        <span class="material-symbols nh-cl-wm" aria-hidden="true">{{ emblemIcon }}</span>
        <span class="material-symbols nh-cl-ico">{{ emblemIcon }}</span>
      </div>
    </div>

    <div class="categoryPlacard absolute z-30 left-0 right-0 mx-auto -bottom-6 h-6 rounded-md text-center" :style="{ width: Math.min(240, width) + 'px' }">
      <div class="w-full h-full flex items-center justify-center rounded-sm border" :class="isAltViewEnabled ? 'altBookshelfLabel' : 'shinyBlack'" :style="{ padding: `0rem ${0.5 * sizeMultiplier}rem` }">
        <p class="truncate" :style="{ fontSize: labelFontSize + 'rem' }">{{ title }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import { nhColMatch, nhColEmblemBg } from '@/store/index'

export default {
  props: {
    index: Number,
    width: Number,
    height: Number,
    bookCoverAspectRatio: Number,
    isAltViewEnabled: Boolean
  },
  data() {
    return {
      collection: null,
      isSelectionMode: false,
      selected: false
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
      return this.collection ? this.collection.name : ''
    },
    books() {
      return this.collection ? this.collection.books || [] : []
    },
    store() {
      return this.$store || this.$nuxt.$store
    },
    currentLibraryId() {
      return this.store.state.libraries.currentLibraryId
    },
    nhThemeActive() {
      return this.store.state.nhThemeActive
    },
    // NH source: nhColArt(id) || nhColMatch(name) (enhancements.js:8042) — admin
    // override wins, falls back to the automatic name-based match.
    emblemMatch() {
      const art = this.store.state.nhCollectionArt
      const override = art && this.collection ? art[this.collection.id] : null
      if (override && override.icon) return { icon: override.icon, tint: override.tint || '#5c5048' }
      return nhColMatch(this.title)
    },
    emblemIcon() {
      return this.emblemMatch.icon
    },
    emblemBg() {
      return nhColEmblemBg(this.emblemMatch.tint)
    }
  },
  methods: {
    setEntity(_collection) {
      this.collection = _collection
    },
    // NH source: nhColArtLoad (enhancements.js:7553-7560) — plain unauthenticated
    // GET, no Bearer token needed (unlike every /_nh/api/* call elsewhere). Shared
    // across every card via the store cache; only the first mounted card fetches.
    ensureCollectionArt() {
      if (this.store.state.nhCollectionArt || this._fetchingArt) return
      this._fetchingArt = true
      this.$nativeHttp
        .get('/_nh/collection-art.json')
        .then((res) => {
          this.store.commit('setNhCollectionArt', (res && res.cols && typeof res.cols === 'object') ? res.cols : {})
        })
        .catch(() => {
          this.store.commit('setNhCollectionArt', {})
        })
    },
    setSelectionMode(val) {
      this.isSelectionMode = val
    },
    clickCard() {
      if (!this.collection) return
      var router = this.$router || this.$nuxt.$router
      router.push(`/collection/${this.collection.id}`)
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
    if (this.nhThemeActive) this.ensureCollectionArt()
  }
}
</script>