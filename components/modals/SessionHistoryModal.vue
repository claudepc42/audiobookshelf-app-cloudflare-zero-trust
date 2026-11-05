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
          <div v-for="group in groupedEvents" :key="group.name" class="py-2">
            <p class="px-4 my-2 text-fg-muted font-semibold">{{ group.name }}</p>
            <modals-session-history-item v-for="(evt, index) in group.events" :key="evt.timestamp + '-' + index" :evt="evt" @click="clickEvent" />
          </div>
          <div v-if="!groupedEvents.length" class="flex h-32 items-center justify-center px-6 text-center">
            <p class="text-lg text-fg-muted">{{ $strings.MessageNoListeningHistory }}</p>
          </div>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script>
import { AbsAudioPlayer } from '@/plugins/capacitor'

// Newest events kept in the list; the full history page has the rest
const MAX_EVENTS = 200

export default {
  props: {
    value: Boolean,
    mediaId: {
      type: String,
      default: null
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
    // Every event, newest first. A Pause or Stop also carries where its stretch of listening began
    // (the Play before it) and how long it lasted. Events come in with no guaranteed sort order, so
    // sort ascending first. A Play with no Pause after it (still playing, or the app was killed)
    // simply has no length.
    events() {
      const sorted = [...this.rawEvents].sort((a, b) => a.timestamp - b.timestamp)
      let openPlay = null
      const annotated = sorted.map((evt) => {
        const copy = { ...evt }
        if (evt.name === 'Play') {
          openPlay = evt
        } else if ((evt.name === 'Pause' || evt.name === 'Stop') && openPlay) {
          copy.listenedFrom = openPlay.currentTime
          copy.listenedSeconds = (evt.timestamp - openPlay.timestamp) / 1000
          openPlay = null
        }
        return copy
      })
      return annotated.reverse().slice(0, MAX_EVENTS)
    },
    // Same day headings and collapsing of repeated Save/Sync events as the full history page
    groupedEvents() {
      const groups = []
      const today = this.$formatDate(new Date(), 'MMM dd, yyyy')
      const yesterday = this.$formatDate(Date.now() - 1000 * 60 * 60 * 24, 'MMM dd, yyyy')

      let numSaves = 0
      let numSyncs = 0
      let lastSaveName = null

      this.events.forEach((evt) => {
        const date = this.$formatDate(evt.timestamp, 'MMM dd, yyyy')
        const name = date === today ? 'Today' : date === yesterday ? 'Yesterday' : date

        let group = groups[groups.length - 1]
        const newGroup = !group || group.name !== name
        if (newGroup) {
          group = { name, events: [] }
          groups.push(group)
        }

        let include = true

        if (evt.name === 'Save') {
          const saveName = evt.name + '-' + evt.serverSyncAttempted + '-' + evt.serverSyncSuccess
          if (lastSaveName === saveName && numSaves > 0 && !newGroup) {
            include = false
            group.events[group.events.length - 1].num = numSaves
            numSaves++
          } else {
            numSaves = 1
          }
          lastSaveName = saveName
        } else {
          numSaves = 0
        }

        if (evt.name === 'Sync') {
          if (numSyncs > 0 && !newGroup) {
            include = false
            group.events[group.events.length - 1].num = numSyncs
            numSyncs++
          } else {
            numSyncs = 1
          }
        } else {
          numSyncs = 0
        }

        if (include) group.events.push(evt)
      })

      return groups
    }
  },
  methods: {
    async clickEvent(evt) {
      await this.$hapticsImpact()
      this.$emit('select', { startPosition: evt.currentTime })
    },
    async loadHistory() {
      if (!this.mediaId) {
        this.rawEvents = []
        return
      }
      try {
        const history = await this.$db.getMediaItemHistory(this.mediaId)
        this.rawEvents = Object.freeze(history?.events || [])
      } catch (e) {
        console.error('[SessionHistoryModal] loadHistory failed', e)
        this.rawEvents = []
      }
    },
    onHistoryUpdated(history) {
      if (!history || history.id !== this.mediaId) return
      // Display-only, so Vue doesn't need to make every event reactive
      this.rawEvents = Object.freeze(history.events || [])
    },
    // The live listener only runs while the modal is open: the history arrives every 15 seconds of
    // playback, and re-sorting it in a hidden modal was background work for nothing. loadHistory()
    // fetches fresh data when it opens.
    async startListening() {
      if (this.historyListener) return
      const listener = await AbsAudioPlayer.addListener('onMediaItemHistoryUpdated', this.onHistoryUpdated)
      if (this.value) this.historyListener = listener
      else listener.remove() // closed again while the listener was being added
    },
    stopListening() {
      this.historyListener?.remove()
      this.historyListener = null
    }
  },
  watch: {
    value(open) {
      if (open) {
        this.loadHistory()
        this.startListening()
      } else {
        this.stopListening()
      }
    },
    mediaId(id) {
      if (this.show && id) this.loadHistory()
    }
  },
  beforeDestroy() {
    this.stopListening()
  }
}
</script>
