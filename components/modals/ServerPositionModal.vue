<template>
  <modals-modal v-model="show" :width="340">
    <div class="w-full bg-primary rounded-lg border border-border p-5" @click.stop>
      <p class="text-lg font-semibold text-center mb-3">{{ $strings.HeaderServerPosition }}</p>

      <!-- The answer at a glance: where this phone is compared with the server -->
      <div class="text-center mb-4">
        <p class="font-mono text-4xl font-bold leading-none" :class="offset >= 0 ? 'text-success' : 'text-warning'">{{ offset >= 0 ? '+' : '-' }}{{ $secondsToTimestamp(Math.abs(offset)) }}</p>
        <p class="text-sm text-fg-muted mt-2">{{ offset >= 0 ? $getString('MessageYouAreAheadServer', [$secondsToTimestamp(Math.abs(offset))]) : $getString('MessageYouAreBehindServer', [$secondsToTimestamp(Math.abs(offset))]) }}</p>
      </div>

      <div class="rounded-lg bg-bg/60 border border-border px-4 py-3 mb-2 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-fg-muted text-sm">{{ $strings.LabelThisPhone }}</span>
          <span class="font-mono text-lg">{{ $secondsToTimestamp(startTime) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-fg-muted text-sm">{{ $strings.LabelServerPosition }}</span>
          <span class="font-mono text-lg">{{ $secondsToTimestamp(serverTime) }}</span>
        </div>
      </div>

      <!-- Why this is being asked: another device updated the server after this phone last saved -->
      <p v-if="serverUpdatedAt" class="text-xs text-fg-muted text-center mb-4">{{ $getString('MessageServerUpdatedAgo', [$dateDistanceFromNow(serverUpdatedAt)]) }}</p>

      <div class="flex flex-col gap-2">
        <ui-btn color="success" @click="$emit('use-server')">{{ $getString('ButtonUseServerPositionAt', [$secondsToTimestamp(serverTime)]) }}</ui-btn>
        <ui-btn @click="$emit('keep-mine')">{{ $getString('ButtonKeepMyPositionAt', [$secondsToTimestamp(startTime)]) }}</ui-btn>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    serverTime: { type: Number, default: 0 },
    startTime: { type: Number, default: 0 },
    serverUpdatedAt: { type: Number, default: 0 }
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
    // Seconds this phone's position is ahead of (+) or behind (-) the server's
    offset() {
      return this.startTime - this.serverTime
    }
  }
}
</script>
