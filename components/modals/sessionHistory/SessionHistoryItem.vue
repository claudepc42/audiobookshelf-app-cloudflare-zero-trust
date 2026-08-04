<template>
  <div class="flex items-center px-1 py-4 justify-start relative bg-opacity-20" @click="click">
    <div class="flex-grow overflow-hidden px-2">
      <div class="flex items-center mb-0.5">
        <i class="material-symbols text-lg pr-1 -mb-1 text-fg-muted">history</i>
        <p class="truncate text-sm text-fg-muted">{{ startedLabel }}</p>
      </div>
      <p class="text-sm font-mono text-fg-muted flex items-center">
        <span class="material-symbols text-base pl-px pr-1">schedule</span>{{ $secondsToTimestamp(session.startPosition / playbackRate) }}
        <span v-if="session.stopPosition != null" class="pl-2">&rarr; {{ $secondsToTimestamp(session.stopPosition / playbackRate) }}</span>
      </p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    session: {
      type: Object,
      default: () => ({})
    },
    playbackRate: Number
  },
  computed: {
    // Relative-ish and simple on purpose — this is a short rolling list (5-10
    // entries), not a log a user needs to cross-reference against a calendar.
    startedLabel() {
      return this.$formatDate(this.session.startTime, 'MMM dd, HH:mm')
    }
  },
  methods: {
    click() {
      this.$emit('click', this.session)
    }
  }
}
</script>
