<template>
  <div class="fixed top-0 left-0 right-0 layout-wrapper w-full z-50 overflow-hidden pointer-events-none">
    <div class="absolute top-0 left-0 w-full h-full bg-black transition-opacity duration-200" :class="show ? 'bg-opacity-60 pointer-events-auto' : 'bg-opacity-0'" @click="clickBackground" />
    <div id="nh-side-drawer" class="absolute top-0 right-0 w-64 h-full bg-bg transform transition-transform py-6 pointer-events-auto" :class="show ? '' : 'translate-x-64'" @click.stop>
      <div class="px-6 mb-4">
        <!-- nh-drawer-greeting: a dedicated hook for nh-theme.css's greeting
             style. It used to be targeted via "#nh-side-drawer .px-6 > p",
             a structural match against the wrapping div's padding class —
             which also matched every nav-item <p> below, since their
             <button>/<nuxt-link> parents carry px-6 too (for their own
             padding, unrelated to this element). That meant the greeting's
             own !important font-size/color silently overrode any styling
             attempted on the nav items, including the text-sm class added
             earlier for the oversized-menu-text fix — which never actually
             took effect because of this. -->
        <p v-if="user" class="text-base nh-drawer-greeting" v-html="$getString('HeaderWelcome', [username])" />
      </div>

      <div class="w-full overflow-y-auto">
        <template v-for="item in navItems">
          <button v-if="item.action" :key="item.text" :tabindex="show ? 0 : -1" class="w-full hover:bg-bg/60 flex items-center py-3 px-6 text-fg-muted" @click="clickAction(item.action)">
            <span class="material-symbols fill text-lg">{{ item.icon }}</span>
            <!-- text-sm's actual rem value (0.875rem), reproduced via calc()
                 instead of the class so the dedicated drawer-only font
                 scale setting (Settings > NanoHive UI > Menu Text Size) can
                 apply on top of it — still layers on the app-wide Font Size
                 Scale too, since that one scales the root rem this is
                 based on. -->
            <p class="pl-4" style="font-size: calc(0.875rem * var(--nh-drawer-font-scale, 1))">{{ item.text }}</p>
          </button>
          <nuxt-link v-else :to="item.to" :key="item.text" :tabindex="show ? 0 : -1" class="w-full hover:bg-bg/60 flex items-center py-3 px-6 text-fg" :class="currentRoutePath.startsWith(item.to) ? 'bg-bg-hover/50' : 'text-fg-muted'">
            <span class="material-symbols fill text-lg">{{ item.icon }}</span>
            <!-- text-sm's actual rem value (0.875rem), reproduced via calc()
                 instead of the class so the dedicated drawer-only font
                 scale setting (Settings > NanoHive UI > Menu Text Size) can
                 apply on top of it — still layers on the app-wide Font Size
                 Scale too, since that one scales the root rem this is
                 based on. -->
            <p class="pl-4" style="font-size: calc(0.875rem * var(--nh-drawer-font-scale, 1))">{{ item.text }}</p>
          </nuxt-link>
        </template>
      </div>
      <div class="absolute bottom-0 left-0 w-full py-6 px-6 text-fg">
        <!-- NH UI Tuner (dev tool) -->
        <button
          v-if="nhThemeActive"
          class="w-full flex items-center gap-2 rounded-xl mb-4 px-3"
          style="height: 38px; background: rgba(224,194,122,0.10); border: 1px solid rgba(224,194,122,0.25); color: #e0c27a"
          @click="openDevPanel"
        >
          <span class="material-symbols" style="font-size: 1rem">tune</span>
          <span style="font-size: 0.8rem; font-weight: 600">NH UI Tuner</span>
        </button>
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
          <!-- connectionLabel: "Cloudflare" only when isSsoAuth confirms the
               actual Cloudflare Access login flow was used; "Custom Headers"
               when headers exist but weren't set via that flow (someone using
               a different reverse-proxy auth scheme via the Custom Headers
               modal); "Primary" when nothing's configured at all — as
               opposed to hardcoding "Cloudflare" regardless. -->
          <template v-if="!serverConnectionConfig.localAddress">
            <p :class="['text-xs', socketConnected ? 'text-fg/80' : 'text-fg-muted/50']">{{ connectionLabel }} {{ socketConnected ? 'Connected' : 'Disconnected' }}</p>
          </template>
          <template v-else>
            <!-- LAN's highlight used to be just "isOnLan" (whichever address
                 was last resolved to try), with no socketConnected check —
                 unlike the other side's condition. That meant if the last
                 resolved address happened to be the LAN one but the
                 connection actually failed, LAN would render fully lit up
                 as if genuinely connected while nothing was connected at
                 all. Both sides now require socketConnected too, so
                 "lit up" always means "actually connected", not just
                 "attempted". -->
            <p :class="['text-xs', !isOnLan && socketConnected ? 'text-fg/80' : 'text-fg-muted/50']">{{ connectionLabel }}</p>
            <p class="text-xs text-fg-muted/50">|</p>
            <p :class="['text-xs', isOnLan && socketConnected ? 'text-fg/80' : 'text-fg-muted/50']">LAN</p>
            <!-- With the fix above, "neither lit up" is now the correct and
                 only way both-disconnected renders — but that alone was
                 easy to miss (just two dim labels, no wording change,
                 unlike the singular branch above which spells out
                 "Disconnected"). This makes it explicit here too. -->
            <p v-if="!socketConnected" class="text-xs text-fg-muted/50">(Disconnected)</p>
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
    hasCustomHeaders() {
      return !!Object.keys(this.serverConnectionConfig?.customHeaders || {}).length
    },
    connectionLabel() {
      if (this.serverConnectionConfig?.isSsoAuth) return 'Cloudflare'
      if (this.hasCustomHeaders) return 'Custom Headers'
      return 'Primary'
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
        if (!this.nhThemeActive || !this.nhSettings.hideRailStats) {
          // NH source (enhancements.js RAIL_ICONS, line 993) remaps stats to
          // 'bar_chart'; stock theme keeps ABS's native 'equalizer'.
          items.push({
            icon: this.nhThemeActive ? 'bar_chart' : 'equalizer',
            text: this.$strings.ButtonUserStats,
            to: '/stats'
          })
        }
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

      if (this.nhThemeActive) {
        items.push({
          icon: 'tune',
          text: 'Customizations',
          to: '/settings-nanohive'
        })
      }

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
    },
    nhSettings() {
      return this.$store.state.nhSettings
    }
  },
  methods: {
    openDevPanel() {
      this.show = false
      this.$nextTick(() => {
        this.$eventBus.$emit('open-nh-dev-panel')
      })
    },
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
      const savedSettings = (await this.$localStore.getNhSettings()) || {}
      await this.$localStore.setNhSettings({ ...savedSettings, active: newVal })
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
