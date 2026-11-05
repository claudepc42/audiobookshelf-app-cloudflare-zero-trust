<template>
  <div class="flex items-center px-4 py-3 relative" @click="click">
    <p class="text-sm text-fg-muted w-12">{{ $formatDate(evt.timestamp, 'HH:mm') }}</p>
    <span class="material-symbols fill px-2" :class="`text-${eventColor}`">{{ eventIcon }}</span>
    <div class="flex-grow overflow-hidden px-1">
      <div class="flex items-center">
        <p class="text-sm text-fg px-1">{{ evt.name }}</p>
        <span v-if="evt.serverSyncAttempted && evt.serverSyncSuccess" class="material-symbols px-1 text-base text-success">cloud_done</span>
        <span v-if="evt.serverSyncAttempted && !evt.serverSyncSuccess" class="material-symbols px-1 text-base text-error">error_outline</span>
        <p v-if="evt.num" class="text-sm text-fg-muted italic px-1">+{{ evt.num }}</p>
      </div>
      <p v-if="listenedLabel" class="text-xs text-fg-muted italic px-1">{{ listenedLabel }}</p>
    </div>
    <p class="text-base text-fg">{{ $secondsToTimestampFull(evt.currentTime) }}</p>
  </div>
</template>

<script>
export default {
  props: {
    evt: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    eventIcon() {
      switch (this.evt.name) {
        case 'Play':
          return 'play_circle'
        case 'Pause':
          return 'pause_circle'
        case 'Stop':
          return 'stop_circle'
        case 'Save':
          return 'sync'
        case 'Seek':
          return 'commit'
        case 'Sync':
          return 'cloud_download'
        default:
          return 'info'
      }
    },
    eventColor() {
      switch (this.evt.name) {
        case 'Play':
          return 'success'
        case 'Pause':
          return 'gray-300'
        case 'Stop':
          return 'error'
        case 'Save':
          return 'info'
        case 'Seek':
          return 'gray-200'
        case 'Sync':
          return 'accent'
        default:
          return 'info'
      }
    },
    // On a Pause or Stop: where that stretch of listening began and how long it lasted
    listenedLabel() {
      if (this.evt.listenedFrom == null) return ''
      const seconds = Math.max(0, Math.round(this.evt.listenedSeconds))
      const length = seconds < 1 ? 'under a second' : this.$elapsedPrettyExtended(seconds, false)
      return `Listened ${length}, from ${this.$secondsToTimestampFull(this.evt.listenedFrom)}`
    }
  },
  methods: {
    click() {
      this.$emit('click', this.evt)
    }
  }
}
</script>
