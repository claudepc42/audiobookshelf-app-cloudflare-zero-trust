<template>
  <div id="nh-search-page" class="w-full h-full">
    <div class="px-4 py-6">
      <ui-text-input ref="input" v-model="search" @input="updateSearch" borderless :placeholder="$strings.ButtonSearch" bg="white bg-opacity-10" rounded="md" prepend-icon="search" text-size="base" clearable class="w-full text-lg" />
    </div>
    <div class="w-full overflow-x-hidden overflow-y-auto search-content px-4" @click.stop>
      <div v-show="isFetching" class="w-full py-8 flex justify-center">
        <p class="text-lg text-fg-muted">{{ $strings.MessageFetching }}</p>
      </div>
      <div v-if="!isFetching && lastSearch && !totalResults" class="w-full py-8 flex justify-center">
        <p class="text-lg text-fg-muted">{{ $strings.MessageNoItemsFound }}</p>
      </div>
      <p v-if="bookResults.length" class="font-semibold text-sm mb-1">{{ $strings.LabelBooks }}</p>
      <template v-for="item in bookResults">
        <div :key="item.libraryItem.id" class="w-full h-16 py-1 relative">
          <nuxt-link :to="`/item/${item.libraryItem.id}`">
            <cards-item-search-card :library-item="item.libraryItem" :search="lastSearch" />
          </nuxt-link>
          <span v-if="item._libraryName" class="nh-search-lib-badge">{{ item._libraryName }}</span>
        </div>
      </template>

      <p v-if="podcastResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelPodcasts }}</p>
      <template v-for="item in podcastResults">
        <div :key="item.libraryItem.id" class="text-fg select-none relative py-1">
          <nuxt-link :to="`/item/${item.libraryItem.id}`">
            <cards-item-search-card :library-item="item.libraryItem" :search="lastSearch" />
          </nuxt-link>
          <span v-if="item._libraryName" class="nh-search-lib-badge">{{ item._libraryName }}</span>
        </div>
      </template>

      <p v-if="episodeResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.HeaderEpisodes }}</p>
      <template v-for="item in episodeResults">
        <div :key="item.libraryItem.recentEpisode.id" class="text-fg select-none relative py-1">
          <nuxt-link :to="`/item/${item.libraryItem.id}/${item.libraryItem.recentEpisode.id}`">
            <cards-episode-search-card :episode="item.libraryItem.recentEpisode" :library-item="item.libraryItem" />
          </nuxt-link>
          <span v-if="item._libraryName" class="nh-search-lib-badge">{{ item._libraryName }}</span>
        </div>
      </template>

      <p v-if="seriesResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelSeries }}</p>
      <template v-for="seriesResult in seriesResults">
        <div :key="seriesResult.series.id" class="w-full h-16 py-1 relative cursor-pointer" @click="goToFiltered(seriesResult._libraryId, `/bookshelf/series/${seriesResult.series.id}`)">
          <cards-series-search-card :series="seriesResult.series" :book-items="seriesResult.books" />
          <span v-if="seriesResult._libraryName" class="nh-search-lib-badge">{{ seriesResult._libraryName }}</span>
        </div>
      </template>

      <p v-if="authorResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelAuthors }}</p>
      <template v-for="authorResult in authorResults">
        <div :key="authorResult.id" class="w-full h-14 py-1 relative cursor-pointer" @click="goToFiltered(authorResult._libraryId, `/bookshelf/library?filter=authors.${$encode(authorResult.id)}`)">
          <cards-author-search-card :author="authorResult" />
          <span v-if="authorResult._libraryName" class="nh-search-lib-badge">{{ authorResult._libraryName }}</span>
        </div>
      </template>

      <p v-if="narratorResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelNarrators }}</p>
      <template v-for="narrator in narratorResults">
        <div :key="narrator.name" class="w-full h-14 py-1 relative cursor-pointer" @click="goToFiltered(narrator._libraryId, `/bookshelf/library?filter=narrators.${$encode(narrator.name)}`)">
          <cards-narrator-search-card :narrator="narrator.name" />
          <span v-if="narrator._libraryName" class="nh-search-lib-badge">{{ narrator._libraryName }}</span>
        </div>
      </template>

      <p v-if="tagResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelTags }}</p>
      <template v-for="tag in tagResults">
        <div :key="tag.name" class="w-full h-14 py-1 relative cursor-pointer" @click="goToFiltered(tag._libraryId, `/bookshelf/library?filter=tags.${$encode(tag.name)}`)">
          <cards-tag-search-card :tag="tag.name" />
          <span v-if="tag._libraryName" class="nh-search-lib-badge">{{ tag._libraryName }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      search: null,
      searchTimeout: null,
      lastSearch: null,
      isFetching: false,
      bookResults: [],
      podcastResults: [],
      episodeResults: [],
      seriesResults: [],
      authorResults: [],
      narratorResults: [],
      tagResults: []
    }
  },
  computed: {
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    totalResults() {
      return this.bookResults.length + this.seriesResults.length + this.authorResults.length + this.podcastResults.length + this.narratorResults.length + this.tagResults.length + this.episodeResults.length
    },
    // NH source: enhancements.js "Search every library at once — one merged
    // result list with a library badge per hit." Confirmed portable (fans out
    // over ABS's own per-library search endpoint), see
    // NANOHIVE_2.0_UPDATE_PLAN.md section 2.
    crossLibrarySearchEnabled() {
      return this.$store.state.nhThemeActive && this.$store.state.nhSettings?.crossLibrarySearch !== false
    },
    searchLibraries() {
      const all = this.$store.state.libraries.libraries || []
      if (!this.crossLibrarySearchEnabled || all.length < 2) {
        return all.filter((lib) => lib.id === this.currentLibraryId)
      }
      return all
    }
  },
  methods: {
    async runSearch(value) {
      if (this.isFetching && this.lastSearch === value) return

      this.lastSearch = value
      this.$store.commit('globals/setLastSearch', value)

      if (!this.lastSearch) {
        this.bookResults = []
        this.podcastResults = []
        this.episodeResults = []
        this.seriesResults = []
        this.authorResults = []
        this.narratorResults = []
        this.tagResults = []
        return
      }
      this.isFetching = true
      const libraries = this.searchLibraries
      const perLibraryResults = await Promise.all(
        libraries.map((lib) =>
          this.$nativeHttp
            .get(`/api/libraries/${lib.id}/search?q=${value}&limit=5`)
            .then((res) => ({ lib, res }))
            .catch((error) => {
              console.error('Search error', error)
              return { lib, res: null }
            })
        )
      )
      if (value !== this.lastSearch) {
        console.log(`runSearch: New search was made for ${this.lastSearch} - results are from ${value}`)
        return
      }

      this.isFetching = false

      const showBadge = libraries.length > 1
      const tag = (arr, lib) => {
        if (showBadge) {
          arr.forEach((item) => {
            item._libraryName = lib.name
            item._libraryId = lib.id
          })
        }
        return arr
      }
      const merge = (key) => perLibraryResults.flatMap(({ lib, res }) => tag(res?.[key] || [], lib))

      this.bookResults = merge('book')
      this.podcastResults = merge('podcast')
      this.episodeResults = merge('episodes')
      this.seriesResults = merge('series')
      this.authorResults = merge('authors')
      this.narratorResults = merge('narrators')
      this.tagResults = merge('tags')
    },
    updateSearch(val) {
      clearTimeout(this.searchTimeout)
      this.searchTimeout = setTimeout(() => {
        this.runSearch(val)
      }, 500)
    },
    // Filter/series links assume the CURRENT library context — a
    // cross-library result whose _libraryId differs needs the active
    // library switched first, or the destination page would show the
    // wrong library's data (or a series id that doesn't even exist there).
    async goToFiltered(libraryId, path) {
      if (libraryId && libraryId !== this.currentLibraryId) {
        await this.$store.dispatch('libraries/fetch', libraryId)
      }
      this.$router.push(path)
    },
    setFocus() {
      setTimeout(() => {
        if (this.$refs.input) {
          this.$refs.input.focus()
        }
      }, 100)
    }
  },
  mounted() {
    if (this.$store.state.globals.lastSearch) {
      this.search = this.$store.state.globals.lastSearch
      this.runSearch(this.search)
    } else {
      this.$nextTick(this.setFocus())
    }
  }
}
</script>

<style>
.search-content {
  height: calc(100% - 108px);
  max-height: calc(100% - 108px);
}
.nh-search-lib-badge {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 0.65rem;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--nh-muted-2, #9a9085);
  pointer-events: none;
}
</style>
