<template>
  <modals-modal v-model="show" :width="360" height="unset">
    <div class="w-full bg-primary rounded-lg border border-fg/20 p-5 text-fg">
      <p class="text-lg font-semibold mb-2" style="color: var(--nh-amber, #e0c27a)">Display issue detected</p>
      <p class="text-sm text-fg-muted mb-5">Some visual effects in NanoHive may not display correctly on this device. We recommend turning it off for the best experience.</p>

      <div class="flex items-center justify-between mb-5 px-1">
        <span class="text-sm" :class="nhThemeActive ? 'text-fg' : 'text-fg-muted'">NanoHive</span>
        <button
          type="button"
          :aria-label="nhThemeActive ? 'Switch to stock UI' : 'Switch to NanoHive UI'"
          class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 focus:outline-none"
          :class="nhThemeActive ? 'bg-fg/70' : 'bg-fg-muted/30'"
          @click="turnOffNhTheme"
        >
          <span class="pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition-transform duration-200" :class="nhThemeActive ? 'translate-x-[18px] bg-secondary' : 'translate-x-0.5 bg-fg-muted'" />
        </button>
      </div>

      <button type="button" class="w-full text-center text-sm text-fg-muted py-2" @click="show = false">Keep NanoHive on</button>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    }
  },
  methods: {
    // Mirrors the "turn off" branch of SideDrawer.vue's toggleNhTheme() —
    // this modal only ever offers turning NanoHive off, never on.
    async turnOffNhTheme() {
      this.$store.commit('setNhThemeActive', false)
      const previousTheme = await this.$localStore.getTheme()
      if (previousTheme) {
        document.documentElement.dataset.theme = previousTheme
      } else {
        delete document.documentElement.dataset.theme
      }
      const savedSettings = (await this.$localStore.getNhSettings()) || {}
      await this.$localStore.setNhSettings({ ...savedSettings, active: false })
      this.show = false
    }
  }
}
</script>
