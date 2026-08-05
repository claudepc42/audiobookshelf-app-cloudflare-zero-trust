<template>
  <modals-modal v-model="show" :width="400" height="100%">
    <template #outer>
      <div class="absolute top-11 left-4 z-40">
        <p class="text-white text-2xl truncate">{{ $strings.HeaderListeningHistory }}</p>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div class="w-full rounded-lg bg-primary border border-border overflow-y-auto overflow-x-hidden relative mt-16" style="max-height: 80vh" @click.stop.prevent>
        <div class="w-full h-full">
          <template v-for="session in sortedSessions">
            <modals-session-history-session-history-item :key="session.startTime" :session="session" :playback-rate="_playbackRate" @click="clickSession" />
          </template>
          <div v-if="!sessions.length" class="flex h-32 items-center justify-center px-6 text-center">
            <p class="text-lg text-fg-muted">{{ $strings.MessageNoListeningHistory }}</p>
          </div>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    sessions: {
      type: Array,
      default: () => []
    },
    playbackRate: {
      type: Number,
      default: 1
    }
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
    // Most recent first — sessions are appended in chronological order as they're logged.
    sortedSessions() {
      return [...this.sessions].sort((a, b) => b.startTime - a.startTime)
    },
    _playbackRate() {
      if (!this.playbackRate || isNaN(this.playbackRate)) return 1
      return this.playbackRate
    }
  },
  methods: {
    async clickSession(session) {
      await this.$hapticsImpact()
      this.$emit('select', session)
    }
  }
}
</script>
