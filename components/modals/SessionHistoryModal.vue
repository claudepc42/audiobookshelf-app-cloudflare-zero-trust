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
          <template v-for="session in sessions">
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
import { AbsAudioPlayer } from '@/plugins/capacitor'

export default {
  props: {
    value: Boolean,
    mediaId: {
      type: String,
      default: null
    },
    playbackRate: {
      type: Number,
      default: 1
    }
  },
  data() {
    return {
      rawEvents: [],
      historyListener: null
    }
  },
  computed: {
    show: {
      get() { return this.value },
      set(val) { this.$emit('input', val) }
    },
    _playbackRate() {
      if (!this.playbackRate || isNaN(this.playbackRate)) return 1
      return this.playbackRate
    },
    // Pair Play events with the next Pause/Stop to form clean listening sessions.
    // Events come in with no guaranteed sort order so sort ascending first.
    // An open Play (no following Pause/Stop yet — currently in progress) is
    // included with stopTime null so the current session shows immediately.
    sessions() {
      const playEvents = ['Play']
      const stopEvents = ['Pause', 'Stop']

      const sorted = [...this.rawEvents].sort((a, b) => a.timestamp - b.timestamp)
      const result = []

      for (let i = 0; i < sorted.length; i++) {
        const evt = sorted[i]
        if (!playEvents.includes(evt.name)) continue

        // Find the next pause/stop after this play
        let stopEvt = null
        for (let j = i + 1; j < sorted.length; j++) {
          if (stopEvents.includes(sorted[j].name)) {
            stopEvt = sorted[j]
            break
          }
          // Another play before a stop means the previous session was interrupted
          if (playEvents.includes(sorted[j].name)) break
        }

        result.push({
          startTime: evt.timestamp,
          startPosition: evt.currentTime,
          stopTime: stopEvt ? stopEvt.timestamp : null,
          stopPosition: stopEvt ? stopEvt.currentTime : null
        })
      }

      // Most recent first, cap at 20
      return result.reverse().slice(0, 20)
    }
  },
  methods: {
    async clickSession(session) {
      await this.$hapticsImpact()
      this.$emit('select', session)
    },
    async loadHistory() {
      if (!this.mediaId) {
        this.rawEvents = []
        return
      }
      try {
        const history = await this.$db.getMediaItemHistory(this.mediaId)
        this.rawEvents = history?.events || []
      } catch (e) {
        console.error('[SessionHistoryModal] loadHistory failed', e)
        this.rawEvents = []
      }
    },
    onHistoryUpdated(history) {
      if (!history || history.id !== this.mediaId) return
      this.rawEvents = history.events || []
    }
  },
  watch: {
    value(open) {
      if (open) this.loadHistory()
    },
    mediaId(id) {
      if (this.show && id) this.loadHistory()
    }
  },
  async mounted() {
    this.historyListener = await AbsAudioPlayer.addListener('onMediaItemHistoryUpdated', this.onHistoryUpdated)
  },
  beforeDestroy() {
    this.historyListener?.remove()
  }
}
</script>
