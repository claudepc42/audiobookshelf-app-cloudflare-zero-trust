<template>
  <modals-modal v-model="show" :width="340">
    <div class="w-full bg-primary rounded-lg border border-border p-5" @click.stop>
      <p class="text-lg font-semibold text-center mb-1">{{ $strings.HeaderServerPosition }}</p>
      <p class="text-sm text-fg-muted text-center mb-4">{{ $strings.MessageServerPositionDiffers }}</p>

      <div class="rounded-lg bg-bg/60 border border-border px-4 py-3 mb-5 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-fg-muted text-sm">{{ $strings.LabelServerPosition }}</span>
          <span class="font-mono text-lg">{{ $secondsToTimestamp(serverTime) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-fg-muted text-sm">{{ $strings.LabelYouStartedAt }}</span>
          <span class="font-mono">{{ $secondsToTimestamp(startTime) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-fg-muted text-sm">{{ difference >= 0 ? $strings.LabelAheadOfStart : $strings.LabelBehindStart }}</span>
          <span class="font-mono" :class="difference >= 0 ? 'text-success' : 'text-warning'">{{ difference >= 0 ? '+' : '-' }}{{ $secondsToTimestamp(Math.abs(difference)) }}</span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <ui-btn color="success" @click="$emit('use-server')">{{ $strings.ButtonUseServerPosition }}</ui-btn>
        <ui-btn @click="$emit('keep-mine')">{{ $strings.ButtonKeepMyPosition }}</ui-btn>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    serverTime: { type: Number, default: 0 },
    startTime: { type: Number, default: 0 }
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
    // Seconds the server position is ahead of (+) or behind (-) where playback started
    difference() {
      return this.serverTime - this.startTime
    }
  }
}
</script>
