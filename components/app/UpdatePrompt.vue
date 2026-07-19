<template>
  <transition name="slide-up">
    <div v-if="visible" class="fixed left-2 right-2 z-40" :style="bottomStyle">
      <div class="bg-bg-hover rounded-lg shadow-xl p-4 border border-fg/10">
        <div class="flex items-start">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold">Update available: CF-ZT {{ latestTag }}</p>
            <p class="text-xs text-fg-muted mt-0.5">A newer version of this app is ready.</p>
          </div>
          <button class="ml-3 p-0.5 text-fg-muted shrink-0" @click="onDismiss">
            <span class="material-symbols text-base">close</span>
          </button>
        </div>
        <div class="flex items-center mt-3 gap-4">
          <button class="text-xs text-fg/80 underline underline-offset-2" @click="onSilence">Remind me next version</button>
          <div class="flex-grow" />
          <button class="text-xs px-3 py-1.5 rounded bg-primary text-white font-medium" @click="onOpenReleases">What's new</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
export default {
  props: {
    latestTag: { type: String, required: true },
    latestUrl: { type: String, required: true },
    isPlayerOpen: { type: Boolean, default: false }
  },
  data() {
    return {
      visible: false,
      hideTimer: null
    }
  },
  computed: {
    bottomStyle() {
      return { bottom: this.isPlayerOpen ? '104px' : '16px' }
    }
  },
  methods: {
    onDismiss() {
      this.clearTimer()
      this.visible = false
      this.$emit('dismiss')
    },
    onSilence() {
      this.clearTimer()
      this.visible = false
      this.$emit('silence')
    },
    onOpenReleases() {
      window.open(this.latestUrl, '_blank')
      this.clearTimer()
      this.visible = false
      this.$emit('dismiss')
    },
    clearTimer() {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer)
        this.hideTimer = null
      }
    }
  },
  mounted() {
    this.visible = true
    this.hideTimer = setTimeout(() => {
      this.visible = false
      this.$emit('auto-hide')
    }, 30000)
  },
  beforeDestroy() {
    this.clearTimer()
  }
}
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
