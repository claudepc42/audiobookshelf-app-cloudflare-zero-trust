<template>
  <div class="fixed top-0 left-0 right-0 layout-wrapper w-full z-50 overflow-hidden pointer-events-none">
    <div class="absolute top-0 left-0 w-full h-full bg-black transition-opacity duration-200" :class="show ? 'bg-opacity-60 pointer-events-auto' : 'bg-opacity-0'" @click="clickBackground" />
    <div id="nh-side-drawer" class="absolute top-0 right-0 w-64 h-full bg-bg transform transition-transform py-6 pointer-events-auto" :class="show ? '' : 'translate-x-64'" @click.stop>
      <div class="px-6 mb-4">
        <p v-if="user" class="text-base" v-html="$getString('HeaderWelcome', [username])" />
      </div>

      <div class="w-full overflow-y-auto">
        <template v-for="item in navItems">
          <button v-if="item.action" :key="item.text" :tabindex="show ? 0 : -1" class="w-full hover:bg-bg/60 flex items-center py-3 px-6 text-fg-muted" @click="clickAction(item.action)">
            <span class="material-symbols fill text-lg">{{ item.icon }}</span>
            <p class="pl-4">{{ item.text }}</p>
          </button>
          <nuxt-link v-else :to="item.to" :key="item.text" :tabindex="show ? 0 : -1" class="w-full hover:bg-bg/60 flex items-center py-3 px-6 text-fg" :class="currentRoutePath.startsWith(item.to) ? 'bg-bg-hover/50' : 'text-fg-muted'">
            <span class="material-symbols fill text-lg">{{ item.icon }}</span>
            <p class="pl-4">{{ item.text }}</p>
          </nuxt-link>
        </template>
      </div>
      <div class="absolute bottom-0 left-0 w-full py-6 px-6 text-fg">
        <!-- NanoHive / Stock UI toggle -->
        <div class="mb-4 flex items-center justify-between px-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs" :class="nhThemeActive ? 'text-fg' : 'text-fg-muted'">NanoHive</span>
          </div>
          <button
            type="button"
            :aria-label="nhThemeActive ? 'Switch to stock UI' : 'Switch to NanoHive UI'"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 focus:outline-none"
            :class="nhThemeActive ? 'bg-fg/70' : 'bg-fg-muted/30'"
            @click="toggleNhTheme"
          >
            <span
              class="pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition-transform duration-200"
              :class="nhThemeActive ? 'translate-x-[18px] bg-secondary' : 'translate-x-0.5 bg-fg-muted'"
            />
          </button>
        </div>
        <div v-if="serverConnectionConfig" class="mb-4 flex items-center justify-center gap-2">
          <template v-if="!serverConnectionConfig.localAddress">
            <p :class="['text-xs', socketConnected ? 'text-fg/80' : 'text-fg-muted']">{{ socketConnected ? 'Cloudflare Connected' : 'Cloudflare Disconnected' }}</p>
          </template>
          <template v-else>
            <p :class="['text-xs', !isOnLan && socketConnected ? 'text-fg/80' : 'text-fg-muted']">Cloudflare</p>
            <p class="text-xs text-fg-muted">|</p>
            <p :class="['text-xs', isOnLan ? 'text-fg/80' : 'text-fg-muted']">LAN</p>
          </template>
        </div>
        <div class="flex items-center">
          <div class="flex flex-col">
            <p class="text-xs">{{ $config.version }}</p>
            <p class="text-xs text-fg-muted">CF-ZT {{ $config.cfztVersion }}</p>
          </div>
          <div class="flex-grow" />
          <div v-if="user" class="flex items-center" @click="disconnect">
            <p class="text-xs pr-2">{{ $strings.ButtonDisconnect }}</p>
            <i class="material-symbols text-sm -mb-0.5">cloud_off</i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import TouchEvent from '@/objects/TouchEvent'
import { AbsCfZeroTrust } from '../../plugins/capacitor/AbsCfZeroTrust'

export default {
  data() {
    return {
      touchEvent: null,
      effectiveAddress: null
    }
  },
  watch: {
    $route: {
      handler() {
        this.show = false
      }
    },
    show: {
      handler(newVal) {
        if (newVal) {
          this.registerListener()
          this.refreshEffectiveAddress()
        } else {
          this.removeListener()
        }
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.showSideDrawer
      },
      set(val) {
        this.$store.commit('setShowSideDrawer', val)
      }
    },
    user() {
      return this.$store.state.user.user
    },
    serverConnectionConfig() {
      return this.$store.state.user.serverConnectionConfig
    },
    serverSettings() {
      return this.$store.state.serverSettings || {}
    },
    username() {
      return this.user?.username || ''
    },
    userIsAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    socketConnected() {
      return this.$store.state.socketConnected
    },
    isOnLan() {
      return !!this.effectiveAddress && !!this.serverConnectionConfig?.localAddress && this.effectiveAddress === this.serverConnectionConfig.localAddress
    },
    hasCfCookies() {
      return this.$platform === 'android' && !!(this.serverConnectionConfig?.isSsoAuth)
    },
    navItems() {
      var items = [
        {
          icon: 'home',
          text: this.$strings.ButtonHome,
          to: '/bookshelf'
        }
      ]
      if (!this.serverConnectionConfig) {
        items = [
          {
            icon: 'cloud_off',
            text: this.$strings.ButtonConnectToServer,
            to: '/connect'
          }
        ].concat(items)
      } else {
        items.push({
          icon: 'person',
          text: this.$strings.HeaderAccount,
          to: '/account'
        })
        items.push({
          icon: 'equalizer',
          text: this.$strings.ButtonUserStats,
          to: '/stats'
        })
      }

      if (this.$platform !== 'ios') {
        items.push({
          icon: 'folder',
          iconOutlined: true,
          text: this.$strings.ButtonLocalMedia,
          to: '/localMedia/folders'
        })
      } else {
        items.push({
          icon: 'download',
          iconOutlined: false,
          text: this.$strings.HeaderDownloads,
          to: '/downloads'
        })
      }
      items.push({
        icon: 'settings',
        text: this.$strings.HeaderSettings,
        to: '/settings'
      })

      items.push({
        icon: 'bug_report',
        iconOutlined: true,
        text: this.$strings.ButtonLogs,
        to: '/logs'
      })

      if (this.serverConnectionConfig) {
        items.push({
          icon: 'language',
          text: this.$strings.ButtonGoToWebClient,
          action: 'openWebClient'
        })

        items.push({
          icon: 'login',
          text: this.$strings.ButtonSwitchServerUser,
          action: 'logout'
        })

        if (this.hasCfCookies) {
          items.push({
            icon: 'cloud_sync',
            text: 'Refresh Cloudflare Login',
            action: 'refreshCf'
          })
        }
      }

      return items
    },
    currentRoutePath() {
      return this.$route.path
    },
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    }
  },
  methods: {
    async clickAction(action) {
      await this.$hapticsImpact()
      if (action === 'logout') {
        await this.logout()
        this.$router.push('/connect')
      } else if (action === 'openWebClient') {
        this.show = false
        let path = `/library/${this.$store.state.libraries.currentLibraryId}`
        await this.$store.dispatch('user/openWebClient', path)
      } else if (action === 'refreshCf') {
        await this.refreshCfLogin()
      }
    },
    clickBackground() {
      this.show = false
    },
    async logout() {
      await this.$store.dispatch('user/logout')
    },
    async refreshCfLogin() {
      const address = this.serverConnectionConfig?.address
      if (!address) return
      this.show = false
      try {
        const result = await AbsCfZeroTrust.openCfWebView({ serverAddress: address })
        if (result?.cookieHeader) {
          const updatedConfig = {
            ...this.serverConnectionConfig,
            customHeaders: { Cookie: result.cookieHeader },
            isSsoAuth: true
          }
          const savedConfig = await this.$db.setServerConnectionConfig(updatedConfig)
          this.$store.commit('user/setServerConnectionConfig', savedConfig || updatedConfig)
          this.$toast.success('Cloudflare session refreshed')
        }
      } catch (e) {
        if (e?.message !== 'cancelled') {
          this.$toast.error('Cloudflare authentication failed')
        }
      }
    },
    async disconnect() {
      await this.$hapticsImpact()
      await this.logout()

      // Redirect to home page
      if (this.$route.name !== 'bookshelf') {
        this.$router.replace('/bookshelf')
      }

      // If player is open and not playing locally, then close the player
      if (this.$store.getters['getIsPlayerOpen']) {
        this.$eventBus.$emit('close-stream')
      }

      // Close side drawer
      this.show = false
    },
    async toggleNhTheme() {
      const newVal = !this.nhThemeActive
      this.$store.commit('setNhThemeActive', newVal)
      if (newVal) {
        document.documentElement.dataset.theme = 'nanohive'
        this._loadNhFont()
      } else {
        // Restore whatever stock theme was set before NH; fall back to default (no attribute)
        const previousTheme = await this.$localStore.getTheme()
        if (previousTheme) {
          document.documentElement.dataset.theme = previousTheme
        } else {
          delete document.documentElement.dataset.theme
        }
      }
      await this.$localStore.setNhSettings({ active: newVal })
    },
    _loadNhFont() {
      if (document.getElementById('nh-spectral-font')) return
      const link = document.createElement('link')
      link.id = 'nh-spectral-font'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap'
      document.head.appendChild(link)
    },
    touchstart(e) {
      this.touchEvent = new TouchEvent(e)
    },
    touchend(e) {
      if (!this.touchEvent) return
      this.touchEvent.setEndEvent(e)
      if (this.touchEvent.isSwipeRight()) {
        this.show = false
      }
      this.touchEvent = null
    },
    async refreshEffectiveAddress() {
      if (this.$platform !== 'android' || !this.serverConnectionConfig?.localAddress) {
        this.effectiveAddress = null
        return
      }
      try {
        this.effectiveAddress = await this.$db.getEffectiveAddress()
        await this.$db.resolveEndpoint()
        this.effectiveAddress = await this.$db.getEffectiveAddress()
      } catch (e) {
        this.effectiveAddress = null
      }
    },
    registerListener() {
      document.addEventListener('touchstart', this.touchstart)
      document.addEventListener('touchend', this.touchend)
    },
    removeListener() {
      document.removeEventListener('touchstart', this.touchstart)
      document.removeEventListener('touchend', this.touchend)
    }
  },
  mounted() {},
  beforeDestroy() {
    this.show = false
  }
}
</script>
