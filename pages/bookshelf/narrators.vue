<template>
  <div>
    <div id="bookshelf" class="w-full h-full p-4 overflow-y-auto">
      <div class="flex flex-wrap justify-center">
        <template v-for="narrator in narrators">
          <nuxt-link :key="narrator.name" :to="`/bookshelf/library?filter=narrators.${$encode(narrator.name)}`">
            <cards-narrator-card :narrator="narrator" :width="cardWidth" :height="cardHeight" class="p-2" />
          </nuxt-link>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
// NH source: enhancements.js Narrator card pages. Confirmed portable, see
// NANOHIVE_2.0_UPDATE_PLAN.md section 2. Mirrors pages/bookshelf/authors.vue's
// structure — narrators have no dedicated detail page in ABS (no id, no
// image), so tapping a card filters the library view instead, same
// destination the existing narrator search-result card already links to.
export default {
  data() {
    return {
      loading: true,
      narrators: [],
      loadedLibraryId: null,
      cardWidth: 200
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    cardHeight() {
      return this.cardWidth * 1.25
    }
  },
  methods: {
    async init() {
      this.cardWidth = (window.innerWidth - 64) / 2
      if (!this.currentLibraryId) {
        return
      }
      this.loadedLibraryId = this.currentLibraryId
      this.narrators = await this.$nativeHttp
        .get(`/api/libraries/${this.currentLibraryId}/narrators`)
        .then((response) => response.narrators || [])
        .catch((error) => {
          console.error('Failed to load narrators', error)
          return []
        })
      this.$eventBus.$emit('bookshelf-total-entities', this.narrators.length)
      this.loading = false
    },
    libraryChanged(libraryId) {
      if (libraryId !== this.loadedLibraryId) {
        if (this.$store.getters['libraries/getCurrentLibraryMediaType'] === 'book') {
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
