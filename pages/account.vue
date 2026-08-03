<template>
  <div class="w-full h-full p-4">
    <ui-text-input-with-label :value="serverAddress" :label="$strings.LabelHost" disabled class="my-2" />

    <ui-text-input-with-label :value="username" :label="$strings.LabelUsername" disabled class="my-2" />

    <div v-if="serverVersion" class="text-sm text-fg">
      <p>Server version: v{{ serverVersion }}</p>
    </div>

    <ui-btn v-if="isAdminOrUp" color="bg bg-opacity-50 flex items-center justify-between gap-2 ml-auto text-base mt-8" @click="showTidyAuthors = true">{{ $strings.HeaderTidyAuthors }}<span class="material-symbols" style="font-size: 1.1rem">group_remove</span></ui-btn>

    <!-- NH source: nhReportsAdminRender (enhancements.js:6875-6927) — admin queue for
         reports submitted via the item-page "Report a problem" flow. Silently absent
         if there's no NanoHive backend to talk to (nhThemeActive gate + graceful fetch
         failure inside the modal). -->
    <ui-btn v-if="isAdminOrUp && nhThemeActive" color="bg bg-opacity-50 flex items-center justify-between gap-2 ml-auto text-base mt-4" @click="showReportQueue = true">
      Reported Problems<span class="material-symbols" style="font-size: 1.1rem">flag</span>
    </ui-btn>

    <!-- NH source: nhAvatarSave/nhAvatarPut (enhancements.js:8161-8194) — the server
         enforces forUser as admin-only even for setting your OWN photo, so this is
         gated behind isAdminOrUp same as everything else here. NOT end-to-end tested
         against a real NanoHive server yet (only the JSON-based endpoints built this
         session were) — see NANOHIVE_MANIFEST_DECISIONS.md for why. -->
    <div v-if="isAdminOrUp && nhThemeActive" class="flex items-center gap-3 mt-4">
      <img v-if="myAvatarUrl" :src="myAvatarUrl" alt="" class="w-10 h-10 rounded-full object-cover" />
      <ui-btn color="bg bg-opacity-50 flex items-center justify-between gap-2 flex-1 text-base" :loading="avatarSaving" @click="pickAvatar">
        My Photo<span class="material-symbols" style="font-size: 1.1rem">photo_camera</span>
      </ui-btn>
      <button v-if="myAvatarUrl" type="button" class="text-fg-muted" :disabled="avatarSaving" @click="clearAvatar">
        <span class="material-symbols" style="font-size: 1.3rem">close</span>
      </button>
      <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="onAvatarPicked" />
    </div>

    <ui-btn color="primary flex items-center justify-between gap-2 ml-auto text-base mt-8" @click="logout">{{ $strings.ButtonSwitchServerUser }}<span class="material-symbols" style="font-size: 1.1rem">logout</span></ui-btn>

    <modals-tidy-authors-modal v-model="showTidyAuthors" />
    <modals-report-queue-modal v-model="showReportQueue" />

    <div class="flex justify-center items-center my-4 left-0 right-0 bottom-0 absolute">
      <p class="text-sm text-fg">{{ $strings.MessageReportBugsAndContribute }} <a class="underline" href="https://github.com/advplyr/audiobookshelf-app" target="_blank">GitHub</a></p>
      <a href="https://github.com/advplyr/audiobookshelf-app" target="_blank" class="text-fg hover:scale-150 hover:rotate-6 transform duration-500 ml-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" width="24" height="24" viewBox="0 0 24 24">
          <path
            d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
          />
        </svg>
      </a>
    </div>
  </div>
</template>

<script>
import nhSeriesMeta from '@/mixins/nhSeriesMeta'

export default {
  mixins: [nhSeriesMeta],
  asyncData({ redirect, store }) {
    if (!store.state.socketConnected) {
      return redirect('/connect')
    }
    return {}
  },
  data() {
    return {
      showTidyAuthors: false,
      showReportQueue: false,
      avatarSaving: false
    }
  },
  computed: {
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    },
    username() {
      if (!this.user) return ''
      return this.user.username
    },
    user() {
      return this.$store.state.user.user
    },
    isAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    serverConnectionConfig() {
      return this.$store.state.user.serverConnectionConfig || {}
    },
    serverAddress() {
      return this.serverConnectionConfig.address
    },
    serverVersion() {
      // Saved in server connection config after 0.9.81
      return this.serverConnectionConfig.version
    },
    myAvatarUrl() {
      return this.user ? this.nhAvatarUrl(this.user.id) : null
    }
  },
  methods: {
    async logout() {
      await this.$hapticsImpact()
      await this.$store.dispatch('user/logout')
      this.$router.push('/connect')
    },
    pickAvatar() {
      this.$refs.avatarInput.click()
    },
    onAvatarPicked(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = ''
      if (!file) return
      if (file.size > 2 * 1024 * 1024) {
        this.$toast.error('Photo must be under 2MB')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        // Capacitor's documented binary-upload pattern: base64 payload with
        // Content-Type: application/octet-stream, which its native HTTP layer
        // decodes before sending the real bytes over the wire (not verified
        // end-to-end against a real NanoHive server yet — see note above).
        const base64 = reader.result.split(',')[1]
        this.saveAvatar(base64)
      }
      reader.readAsDataURL(file)
    },
    async saveAvatar(base64) {
      this.avatarSaving = true
      try {
        const res = await this.$nativeHttp.post(`/_nh/api/avatar-admin?forUser=${encodeURIComponent(this.user.id)}`, base64, { headers: { 'Content-Type': 'application/octet-stream' } })
        if (res && res.ext) {
          this.$store.commit('setNhSeriesMeta', {
            covers: this.$store.state.nhSeriesCovers,
            descs: this.$store.state.nhSeriesDescs,
            avatars: { ...(this.$store.state.nhAvatars || {}), [this.user.id]: res.ext }
          })
        }
      } catch (e) {
        this.$toast.error('Failed to save photo')
      }
      this.avatarSaving = false
    },
    async clearAvatar() {
      this.avatarSaving = true
      try {
        await this.$nativeHttp.delete(`/_nh/api/avatar-admin?forUser=${encodeURIComponent(this.user.id)}`)
        const avatars = { ...(this.$store.state.nhAvatars || {}) }
        delete avatars[this.user.id]
        this.$store.commit('setNhSeriesMeta', { covers: this.$store.state.nhSeriesCovers, descs: this.$store.state.nhSeriesDescs, avatars })
      } catch (e) {
        this.$toast.error('Failed to remove photo')
      }
      this.avatarSaving = false
    }
  },
  mounted() {
    if (this.nhThemeActive) this.ensureNhSeriesMeta()
  }
}
</script>
