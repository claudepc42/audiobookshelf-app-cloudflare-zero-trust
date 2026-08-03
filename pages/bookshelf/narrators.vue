<template>
  <div>
    <div id="bookshelf" class="w-full h-full p-4 overflow-y-auto">
      <div class="flex items-center flex-wrap gap-2 mb-4">
        <p class="mr-auto text-sm" style="color: #9a9085">{{ countText }}</p>
        <ui-text-input v-model="query" :placeholder="strings.search" clearable style="width: 190px" />
        <ui-dropdown v-model="sort" :items="sortItems" small style="width: 160px" />
      </div>
      <div class="nh-nr-grid">
        <nh-narrator-card v-for="narrator in filteredNarrators" :key="narrator.id" :narrator="narrator" :library-id="currentLibraryId" :cover-ids="coverIdsFor(narrator.name)" :book-forms="strings.bookForms" />
      </div>
    </div>
  </div>
</template>

<script>
import { nhNarratorStrings, nhRatingWord } from '@/store/index'

// NH source: narrators page redesign (enhancements.js:6582-6794, "NARRATORS
// PAGE REDESIGN (A9)") — cover-collage card grid, a name filter, a sort
// control (most books / name), and a localized "N Narrators" count, replacing
// the stock two-column table. One items fetch (limit=0, minified) builds
// every card's cover collage, same as NH's own nhNr.byName map — per-narrator
// requests were NH's own measured cause of 15s+ loads on big libraries.
export default {
  data() {
    return {
      loading: true,
      narrators: [],
      itemsByName: {},
      loadedLibraryId: null,
      query: '',
      sort: 'books'
    }
  },
  watch: {
    // Greptile-found bug: the library ID isn't always set yet when this page
    // first mounts (e.g. it's the first page visited while the library list
    // is still resolving) — without this watcher, init() returned once and
    // never retried, leaving the page permanently empty.
    currentLibraryId(newVal) {
      if (newVal && !this.loadedLibraryId) this.init()
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    lang() {
      return this.$languageCodes?.current || 'en'
    },
    strings() {
      return nhNarratorStrings(this.lang)
    },
    sortItems() {
      return [
        { text: this.strings.sortBooks, value: 'books' },
        { text: this.strings.sortName, value: 'name' }
      ]
    },
    filteredNarrators() {
      let list = this.narrators
      const q = this.query.trim().toLowerCase()
      if (q) list = list.filter((n) => String(n.name || '').toLowerCase().indexOf(q) !== -1)
      list = list.slice()
      if (this.sort === 'books') list.sort((a, b) => b.numBooks - a.numBooks || String(a.name).localeCompare(String(b.name)))
      else list.sort((a, b) => String(a.name).localeCompare(String(b.name)))
      return list
    },
    countText() {
      const total = this.narrators.length
      const label = nhRatingWord(total, this.strings.narratorForms)
      const filtered = this.query.trim() ? `${this.filteredNarrators.length} / ` : ''
      return `${filtered}${total} ${label}`
    }
  },
  methods: {
    coverIdsFor(name) {
      return this.itemsByName[name] || []
    },
    async init() {
      const libraryId = this.currentLibraryId
      if (!libraryId) {
        return
      }
      this.loadedLibraryId = libraryId
      const narrators = await this.$nativeHttp
        .get(`/api/libraries/${libraryId}/narrators`)
        .then((response) => response.narrators || [])
        .catch((error) => {
          console.error('Failed to load narrators', error)
          return []
        })
      // Greptile-found bug: without this guard, a slow response for a
      // previous library could land after the user already switched to a
      // different one and overwrite its narrator list with stale data.
      if (this.currentLibraryId !== libraryId) return
      this.narrators = narrators
      this.$eventBus.$emit('bookshelf-total-entities', this.narrators.length)
      this.loading = false
      this.loadCoverMap()
    },
    async loadCoverMap() {
      const libId = this.currentLibraryId
      const payload = await this.$nativeHttp
        .get(`/api/libraries/${libId}/items?limit=0&sort=media.metadata.title`)
        .catch(() => null)
      if (!payload?.results || this.currentLibraryId !== libId) return
      const map = {}
      payload.results.forEach((it) => {
        const nn = it.media?.metadata?.narratorName || ''
        if (!nn) return
        nn.split(', ').forEach((nm) => {
          if (!map[nm]) map[nm] = []
          if (map[nm].length < 3) map[nm].push(it.id)
        })
      })
      this.itemsByName = map
    },
    libraryChanged(libraryId) {
      if (libraryId !== this.loadedLibraryId) {
        if (this.$store.getters['libraries/getCurrentLibraryMediaType'] === 'book') {
          this.itemsByName = {}
          this.query = ''
          this.init()
        } else {
          this.$router.replace('/bookshelf')
        }
      }
    }
  },
  mounted() {
    this.init()
    this.$eventBus.$on('library-changed', this.libraryChanged)
  },
  beforeDestroy() {
    this.$eventBus.$off('library-changed', this.libraryChanged)
  }
}
</script>

<style>
/* NH source: #nh-narrators grid (core.js:1382,1430). */
.nh-nr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}
</style>
