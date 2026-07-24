<template>
  <div class="w-full bg-bg relative" :style="nhThemeActive ? 'height:56px' : 'height:36px'">
    <div id="bookshelf-navbar" class="absolute z-10 top-0 left-0 w-full h-full flex bg-secondary">
      <nuxt-link v-for="item in items" :key="item.to" :to="item.to" class="h-full flex-grow flex items-center justify-center" :class="routeName === item.routeName ? 'bg-primary' : 'text-fg-muted'">
        <!-- NH theme: material-symbols icons matching NanoHive server, with label -->
        <template v-if="nhThemeActive">
          <span class="material-symbols text-xl">{{ nhIconMap[item.routeName] || item.icon }}</span>
          <span class="nh-nav-label">{{ item.text }}</span>
        </template>
        <!-- Default theme: active = text only, inactive = icon only -->
        <template v-else>
          <p v-if="routeName === item.routeName" class="text-sm font-semibold">{{ item.text }}</p>
          <span v-else-if="item.iconPack === 'abs-icons'" class="abs-icons" :class="`icon-${item.icon} ${item.iconClass || ''}`"></span>
          <span v-else :class="`${item.iconPack} ${item.iconClass || ''}`">{{ item.icon }}</span>
        </template>
      </nuxt-link>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      // NH source of truth for these is enhancements.js's RAIL_ICONS remap table
      // (line 987), NOT ABS's native SideRail.vue — NH overrides the stock icons.
      // /library/[^/]+$ (library root) -> home, /bookshelf$ (library listing) ->
      // menu_book (superseding ABS's own per-library custom icon), /series ->
      // layers, /collections -> collections_bookmark, /authors -> groups.
      // playlists/latest/add-podcast have no RAIL_ICONS entry — no source to
      // check against, left as our own reasonable choices.
      nhIconMap: {
        bookshelf: 'home',
        'bookshelf-library': 'menu_book',
        'bookshelf-series': 'layers',
        'bookshelf-collections': 'collections_bookmark',
        'bookshelf-authors': 'groups',
        'bookshelf-playlists': 'queue_music',
        'bookshelf-latest': 'schedule',
        'bookshelf-add-podcast': 'podcasts'
      }
    }
  },
  computed: {
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    },
    nhSettings() {
      return this.$store.state.nhSettings
    },
    currentLibrary() {
      return this.$store.getters['libraries/getCurrentLibrary']
    },
    currentLibraryIcon() {
      return this.currentLibrary?.icon || 'database'
    },
    userHasPlaylists() {
      return this.$store.state.libraries.numUserPlaylists
    },
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    items() {
      let items = []
      if (this.isPodcast) {
        items = [
          {
            to: '/bookshelf',
            routeName: 'bookshelf',
            iconPack: 'abs-icons',
            icon: 'home',
            iconClass: 'text-xl',
            text: this.$strings.ButtonHome
          },
          {
            to: '/bookshelf/latest',
            routeName: 'bookshelf-latest',
            iconPack: 'abs-icons',
            icon: 'list',
            iconClass: 'text-xl',
            text: this.$strings.ButtonLatest
          },
          {
            to: '/bookshelf/library',
            routeName: 'bookshelf-library',
            iconPack: 'abs-icons',
            icon: this.currentLibraryIcon,
            iconClass: 'text-lg',
            text: this.$strings.ButtonLibrary
          }
        ]

        if (this.userIsAdminOrUp) {
          items.push({
            to: '/bookshelf/add-podcast',
            routeName: 'bookshelf-add-podcast',
            iconPack: 'material-symbols',
            icon: 'podcasts',
            iconClass: 'text-xl',
            text: this.$strings.ButtonAdd
          })
        }
      } else {
        items = [
          {
            to: '/bookshelf',
            routeName: 'bookshelf',
            iconPack: 'abs-icons',
            icon: 'home',
            iconClass: 'text-xl',
            text: this.$strings.ButtonHome
          },
          {
            to: '/bookshelf/library',
            routeName: 'bookshelf-library',
            iconPack: 'abs-icons',
            icon: this.currentLibraryIcon,
            iconClass: 'text-lg',
            text: this.$strings.ButtonLibrary
          },
          {
            to: '/bookshelf/series',
            routeName: 'bookshelf-series',
            iconPack: 'abs-icons',
            icon: 'columns',
            iconClass: 'text-lg pt-px',
            text: this.$strings.ButtonSeries
          },
          {
            to: '/bookshelf/collections',
            routeName: 'bookshelf-collections',
            iconPack: 'material-symbols',
            icon: 'collections_bookmark',
            iconClass: 'text-xl',
            text: this.$strings.ButtonCollections
          },
          {
            to: '/bookshelf/authors',
            routeName: 'bookshelf-authors',
            iconPack: 'abs-icons',
            icon: 'authors',
            iconClass: 'text-2xl',
            text: this.$strings.ButtonAuthors
          }
        ]
      }

      if (this.userHasPlaylists) {
        items.push({
          to: '/bookshelf/playlists',
          routeName: 'bookshelf-playlists',
          iconPack: 'material-symbols',
          icon: 'queue_music',
          iconClass: 'text-2xl',
          text: this.$strings.ButtonPlaylists
        })
      }

      // NH settings: Sidebar Menus visibility toggles (NH source: enhancements.js
      // hideRailSeries/hideRailCollections/hideRailAuthors — applied here since
      // this nav bar is our equivalent of NH's left rail)
      if (this.nhThemeActive) {
        const hiddenRouteNames = new Set()
        if (this.nhSettings.hideRailSeries) hiddenRouteNames.add('bookshelf-series')
        if (this.nhSettings.hideRailCollections) hiddenRouteNames.add('bookshelf-collections')
        if (this.nhSettings.hideRailAuthors) hiddenRouteNames.add('bookshelf-authors')
        if (hiddenRouteNames.size) items = items.filter((item) => !hiddenRouteNames.has(item.routeName))
      }

      return items
    },
    routeName() {
      return this.$route.name
    },
    isPodcast() {
      return this.libraryMediaType == 'podcast'
    },
    libraryMediaType() {
      return this.$store.getters['libraries/getCurrentLibraryMediaType']
    }
  },
  methods: {
    isSelected(item) {}
  },
  mounted() {}
}
</script>

<style>
#bookshelf-navbar {
  box-shadow: 0px 5px 5px #11111155;
}
#bookshelf-navbar a {
  font-size: 0.9rem;
}
</style>
