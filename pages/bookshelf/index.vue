<template>
  <div class="w-full h-full min-h-full relative">
    <div v-if="attemptingConnection" class="w-full pt-4 flex items-center justify-center">
      <widgets-loading-spinner />
      <p class="pl-4">{{ $strings.MessageAttemptingServerConnection }}</p>
    </div>
    <div v-if="shelves.length && isLoading" class="w-full pt-4 flex items-center justify-center">
      <widgets-loading-spinner />
      <p class="pl-4">{{ $strings.MessageLoadingServerData }}</p>
    </div>

    <div class="w-full" :class="{ 'py-6': altViewEnabled }">
      <div v-if="nhThemeActive && !currentLibraryIsPodcast" id="nh-welcome" class="px-5 pt-6 pb-3">
        <p class="text-xs font-semibold tracking-widest" style="color: var(--nh-amber); text-transform: uppercase; letter-spacing: 0.12em">{{ greetingLine }}</p>
        <h2 class="mt-1 text-2xl font-medium leading-tight" style="font-family: var(--nh-serif); color: var(--nh-text-1)">Welcome back, {{ username }}</h2>
      </div>
      <nh-hero-carousel v-if="nhThemeActive && !currentLibraryIsPodcast && nhSettings.showHeroCarousel" :slides="continueListeningItems" :advance-seconds="nhSettings.carouselTiming" />
      <nh-recent-series-shelf v-if="showRecentSeriesShelf" />
      <template v-for="(shelf, index) in displayShelves">
        <bookshelf-shelf :key="shelf.id" :label="getShelfLabel(shelf)" :entities="shelf.entities" :type="shelf.type" :style="{ zIndex: displayShelves.length - index }" />
      </template>
    </div>

    <div v-if="!shelves.length && !isLoading" class="absolute top-0 left-0 w-full h-full flex items-center justify-center">
      <div>
        <p class="mb-4 text-center text-xl">
          {{ $strings.MessageBookshelfEmpty }}
        </p>
        <div class="w-full" v-if="!user">
          <div class="flex justify-center items-center mb-3">
            <span class="material-symbols text-error text-lg">cloud_off</span>
            <p class="pl-2 text-error text-sm">{{ $strings.MessageAudiobookshelfServerNotConnected }}</p>
          </div>
        </div>
        <div class="flex justify-center">
          <ui-btn v-if="!user" small @click="$router.push('/connect')" class="w-32">{{ $strings.ButtonConnect }}</ui-btn>
        </div>
      </div>
    </div>
    <div v-else-if="!shelves.length && isLoading && !attemptingConnection" class="absolute top-0 left-0 z-50 w-full h-full flex items-center justify-center">
      <ui-loading-indicator :text="$strings.MessageLoading" />
    </div>
  </div>
</template>

<script>
export default {
  props: {},
  data() {
    return {
      shelves: [],
      isFirstNetworkConnection: true,
      lastServerFetch: 0,
      lastServerFetchLibraryId: null,
      lastLocalFetch: 0,
      localLibraryItems: [],
      isLoading: false
    }
  },
  watch: {
    networkConnected(newVal) {
      // Update shelves when network connect status changes
      console.log(`[categories] Network changed to ${newVal} - fetch categories. ${this.lastServerFetch}/${this.lastLocalFetch}`)

      if (newVal) {
        // Fetch right away the first time network connects
        if (this.isFirstNetworkConnection) {
          this.isFirstNetworkConnection = false
          console.log(`[categories] networkConnected true first network connection. lastServerFetch=${this.lastServerFetch}`)
          this.fetchCategories()
          return
        }

        setTimeout(() => {
          // Using timeout because making this fetch as soon as network gets connected will often fail on Android
          console.log(`[categories] networkConnected true so fetching categories. lastServerFetch=${this.lastServerFetch}`)
          this.fetchCategories()
        }, 4000)
      } else {
        console.log(`[categories] networkConnected false so fetching categories`)
        this.fetchCategories()
      }
    },
    user(newVal, oldVal) {
      if ((newVal && !oldVal) || (!newVal && oldVal)) {
        console.log(`[categories] user changed so fetching categories`)
        this.fetchCategories()
      }
    }
  },
  computed: {
    user() {
      return this.$store.state.user.user
    },
    networkConnected() {
      return this.$store.state.networkConnected
    },
    isIos() {
      return this.$platform === 'ios'
    },
    currentLibraryName() {
      return this.$store.getters['libraries/getCurrentLibraryName']
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    currentLibraryMediaType() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType']
    },
    currentLibraryIsPodcast() {
      return this.currentLibraryMediaType === 'podcast'
    },
    altViewEnabled() {
      return this.$store.getters['getAltViewEnabled']
    },
    localMediaProgress() {
      return this.$store.state.globals.localMediaProgress
    },
    attemptingConnection() {
      return this.$store.state.attemptingConnection
    },
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    },
    nhSettings() {
      return this.$store.state.nhSettings
    },
    // NH source: enhancements.js manageRecentSeries() gate (line 1832) — shown
    // whenever the custom shelf is enabled and not stock-series/explicitly hidden.
    showRecentSeriesShelf() {
      return this.nhThemeActive && !this.currentLibraryIsPodcast && this.nhSettings.showCustomRecentSeries && this.nhSettings.customSeriesCards !== false && !this.nhSettings.hideHomeRecentSeries
    },
    username() {
      return this.$store.state.user.user?.username || ''
    },
    greetingLine() {
      const hour = new Date().getHours()
      const time = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      return `${days[new Date().getDay()]} · ${time}`
    },
    displayShelves() {
      if (!this.nhThemeActive) return this.shelves

      // NH source: enhancements.js continueReadingMode — 'combine' folds the
      // continue-listening shelf into the hero carousel (default), 'separate'
      // keeps it as its own shelf, 'hidden' drops it entirely.
      let list = this.nhSettings.continueReadingMode === 'separate' ? this.shelves : this.shelves.filter((s) => s.id !== 'continue-listening')

      // NH source: enhancements.js applySettings() shelf title matching (lines 204-210).
      // Recent Series: hidden whenever hideHomeRecentSeries is set, OR whenever the
      // synthetic expanded shelf is showing in its place (showCustomRecentSeries &&
      // customSeriesCards !== false) — same combined condition as source, so the
      // native and custom shelves never both render at once.
      const s = this.nhSettings
      const hideRecentSeries = s.hideHomeRecentSeries || (s.showCustomRecentSeries && s.customSeriesCards !== false)
      list = list.filter((shelf) => {
        const title = (this.getShelfLabel(shelf) || '').toLowerCase()
        if (s.hideHomeRecentlyAdded && title.includes('recently added')) return false
        if (hideRecentSeries && title.includes('recent series')) return false
        if (s.hideHomeContinueSeries && title.includes('continue series')) return false
        if (s.hideHomeListenAgain && title.includes('listen again')) return false
        if (s.hideHomeDiscover && title.includes('discover')) return false
        if (s.hideHomeNewAuthors && title.includes('authors')) return false
        return true
      })

      return list
    },
    continueListeningItems() {
      if (this.nhThemeActive && this.nhSettings.continueReadingMode !== 'combine') return []
      const shelf = this.shelves.find((s) => s.id === 'continue-listening')
      if (!shelf) return []
      return shelf.entities.slice(0, 8)
    }
  },
  methods: {
    getShelfLabel(shelf) {
      if (shelf.labelStringKey && this.$strings[shelf.labelStringKey]) return this.$strings[shelf.labelStringKey]
      return shelf.label
    },
    getLocalMediaItemCategories() {
      const localMedia = this.localLibraryItems
      if (!localMedia?.length) return []

      const categories = []
      const books = []
      const podcasts = []
      const booksContinueListening = []
      const podcastEpisodesContinueListening = []
      localMedia.forEach((item) => {
        if (item.mediaType == 'book') {
          item.progress = this.$store.getters['globals/getLocalMediaProgressById'](item.id)
          if (item.progress && !item.progress.isFinished && item.progress.progress > 0) booksContinueListening.push(item)
          books.push(item)
        } else if (item.mediaType == 'podcast') {
          const podcastEpisodeItemCloner = { ...item }
          item.media.episodes = item.media.episodes.map((ep) => {
            ep.progress = this.$store.getters['globals/getLocalMediaProgressById'](item.id, ep.id)
            if (ep.progress && !ep.progress.isFinished && ep.progress.progress > 0) {
              podcastEpisodesContinueListening.push({
                ...podcastEpisodeItemCloner,
                recentEpisode: ep
              })
            }
            return ep
          })
          podcasts.push(item)
        }
      })

      // Local continue listening shelves, only shown offline
      if (booksContinueListening.length) {
        categories.push({
          id: 'local-books-continue',
          label: this.$strings.LabelContinueBooks,
          type: 'book',
          localOnly: true,
          entities: booksContinueListening.sort((a, b) => {
            if (a.progress && b.progress) {
              return b.progress.lastUpdate > a.progress.lastUpdate ? 1 : -1
            }
            return 0
          })
        })
      }
      if (podcastEpisodesContinueListening.length) {
        categories.push({
          id: 'local-episodes-continue',
          label: this.$strings.LabelContinueEpisodes,
          type: 'episode',
          localOnly: true,
          entities: podcastEpisodesContinueListening.sort((a, b) => {
            if (a.recentEpisode.progress && b.recentEpisode.progress) {
              return b.recentEpisode.progress.lastUpdate > a.recentEpisode.progress.lastUpdate ? 1 : -1
            }
            return 0
          })
        })
      }

      // Local books and local podcast shelves
      if (books.length) {
        categories.push({
          id: 'local-books',
          label: this.$strings.LabelLocalBooks,
          type: 'book',
          entities: books.sort((a, b) => {
            if (a.progress && a.progress.isFinished) return 1
            else if (b.progress && b.progress.isFinished) return -1
            else if (a.progress && b.progress) {
              return b.progress.lastUpdate > a.progress.lastUpdate ? 1 : -1
            }
            return 0
          })
        })
      }
      if (podcasts.length) {
        categories.push({
          id: 'local-podcasts',
          label: this.$strings.LabelLocalPodcasts,
          type: 'podcast',
          entities: podcasts
        })
      }

      return categories
    },
    async fetchCategories() {
      console.log(`[categories] fetchCategories networkConnected=${this.networkConnected}, lastServerFetch=${this.lastServerFetch}, lastLocalFetch=${this.lastLocalFetch}`)

      // TODO: Find a better way to keep the shelf up-to-date with local vs server library because this is a disaster
      const isConnectedToServerWithInternet = this.user && this.currentLibraryId && this.networkConnected
      if (isConnectedToServerWithInternet) {
        if (this.lastServerFetch && Date.now() - this.lastServerFetch < 5000 && this.lastServerFetchLibraryId == this.currentLibraryId) {
          console.log(`[categories] fetchCategories server fetch was ${Date.now() - this.lastServerFetch}ms ago so not doing it.`)
          return
        } else {
          console.log(`[categories] fetchCategories fetching from server. Last was ${this.lastServerFetch ? Date.now() - this.lastServerFetch + 'ms' : 'Never'} ago. lastServerFetchLibraryId=${this.lastServerFetchLibraryId} and currentLibraryId=${this.currentLibraryId}`)
          this.lastServerFetchLibraryId = this.currentLibraryId
          this.lastServerFetch = Date.now()
          this.lastLocalFetch = 0
        }
      } else {
        if (this.lastLocalFetch && Date.now() - this.lastLocalFetch < 5000) {
          console.log(`[categories] fetchCategories local fetch was ${Date.now() - this.lastLocalFetch}ms ago so not doing it.`)
          return
        } else {
          console.log(`[categories] fetchCategories fetching from local. Last was ${this.lastLocalFetch ? Date.now() - this.lastLocalFetch + 'ms' : 'Never'} ago`)
          this.lastServerFetchLibraryId = null
          this.lastServerFetch = 0
          this.lastLocalFetch = Date.now()
        }
      }

      this.isLoading = true

      // Set local library items first
      this.localLibraryItems = await this.$db.getLocalLibraryItems()
      const localCategories = this.getLocalMediaItemCategories()
      this.shelves = localCategories
      console.log('[categories] Local shelves set', this.shelves.length, this.lastLocalFetch)

      if (isConnectedToServerWithInternet) {
        const categories = await this.$nativeHttp.get(`/api/libraries/${this.currentLibraryId}/personalized?minified=1&include=rssfeed,numEpisodesIncomplete`, { connectTimeout: 10000 }).catch((error) => {
          console.error('[categories] Failed to fetch categories', error)
          return []
        })
        if (!categories.length) {
          // Failed to load categories so use local shelves
          console.warn(`[categories] Failed to get server categories so using local categories`)
          this.lastServerFetch = 0
          this.lastLocalFetch = Date.now()
          this.isLoading = false
          console.log('[categories] Local shelves set from failure', this.shelves.length, this.lastLocalFetch)
          return
        }

        this.shelves = categories.map((cat) => {
          if (cat.type == 'book' || cat.type == 'podcast' || cat.type == 'episode') {
            // Map localLibraryItem to entities
            cat.entities = cat.entities.map((entity) => {
              const localLibraryItem = this.localLibraryItems.find((lli) => {
                return lli.libraryItemId == entity.id
              })
              if (localLibraryItem) {
                entity.localLibraryItem = localLibraryItem
              }
              return entity
            })
          }
          return cat
        })

        // Only add the local shelf with the same media type
        const localShelves = localCategories.filter((cat) => cat.type === this.currentLibraryMediaType && !cat.localOnly)
        this.shelves.push(...localShelves)
        console.log('[categories] Server shelves set', this.shelves.length, this.lastServerFetch)
      }

      this.isLoading = false
    },
    libraryChanged() {
      if (this.currentLibraryId) {
        console.log(`[categories] libraryChanged so fetching categories`)
        this.fetchCategories()
      }
    },
    audiobookAdded(audiobook) {
      // TODO: Check if audiobook would be on this shelf
      if (!this.search) {
        this.fetchCategories()
      }
    },
    audiobookUpdated(audiobook) {
      this.shelves.forEach((shelf) => {
        if (shelf.type === 'books') {
          shelf.entities = shelf.entities.map((ent) => {
            if (ent.id === audiobook.id) {
              return audiobook
            }
            return ent
          })
        } else if (shelf.type === 'series') {
          shelf.entities.forEach((ent) => {
            ent.books = ent.books.map((book) => {
              if (book.id === audiobook.id) return audiobook
              return book
            })
          })
        }
      })
    },
    removeBookFromShelf(audiobook) {
      this.shelves.forEach((shelf) => {
        if (shelf.type === 'books') {
          shelf.entities = shelf.entities.filter((ent) => {
            return ent.id !== audiobook.id
          })
        } else if (shelf.type === 'series') {
          shelf.entities.forEach((ent) => {
            ent.books = ent.books.filter((book) => {
              return book.id !== audiobook.id
            })
          })
        }
      })
    },
    initListeners() {
      this.$eventBus.$on('library-changed', this.libraryChanged)
    },
    removeListeners() {
      this.$eventBus.$off('library-changed', this.libraryChanged)
    }
  },
  async mounted() {
    if (this.$route.query.error) {
      this.$toast.error(this.$route.query.error)
    }

    this.initListeners()
    await this.$store.dispatch('globals/loadLocalMediaProgress')
    console.log(`[categories] mounted so fetching categories`)
    this.fetchCategories()
  },
  beforeDestroy() {
    this.removeListeners()
  }
}
</script>
