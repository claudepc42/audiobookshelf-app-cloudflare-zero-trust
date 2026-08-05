<template>
  <div v-if="showTools && (almostDone.length || recentlyFinished.length)" class="w-full my-6">
    <h1 class="text-xl px-4 mb-2">{{ $strings.HeaderFinishedBookTools }}</h1>

    <div v-if="recentlyFinished.length" class="px-4 mb-4">
      <p class="text-sm text-fg-muted mb-2">{{ $strings.LabelRecentlyFinished }}</p>
      <div v-for="row in recentlyFinished" :key="row.libraryItemId" class="flex items-center py-1.5">
        <div class="w-10 h-10 rounded bg-cover bg-center flex-shrink-0 mr-3" :style="{ backgroundImage: `url(${coverUrl(row.libraryItemId)})` }" />
        <p class="text-sm truncate flex-grow mr-3">{{ row.title }}</p>
        <input type="date" class="nh-fbt-date bg-transparent text-sm text-fg-muted" :value="isoDay(row.finishedAt)" @change="onDateChange(row, $event.target.value)" />
      </div>
    </div>

    <div v-if="almostDone.length" class="px-4">
      <div class="flex items-center justify-between mb-2">
        <p class="text-sm text-fg-muted">{{ $strings.LabelAlmostDone }}</p>
        <!-- Tapping the checkmark to actually finish a book isn't obvious on its
             own — this column label is the whole fix. -->
        <p class="text-xs text-fg-muted">{{ $strings.LabelMarkAsDone }}</p>
      </div>
      <div v-for="row in almostDone" :key="row.libraryItemId" class="flex items-center py-1.5">
        <div class="w-10 h-10 rounded bg-cover bg-center flex-shrink-0 mr-3" :style="{ backgroundImage: `url(${coverUrl(row.libraryItemId)})` }" />
        <p class="text-sm truncate flex-grow mr-3">{{ row.title }}</p>
        <p class="text-xs text-fg-muted mr-3">{{ Math.floor(row.progress * 100) }}%</p>
        <button type="button" class="text-success" :aria-label="$strings.ButtonMarkAsFinished" @click="markFinished(row)">
          <span class="material-symbols text-2xl">check_circle</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// Ported from NH source: enhancements.js "finished-book tools" (nhFdRows,
// nhFdPatch, NH_ALMOST_MIN = 0.97). Both actions go through ABS's own native
// PATCH /api/me/progress/:id — confirmed no NH-proxy dependency, see
// NANOHIVE_2.0_UPDATE_PLAN.md section 2.
const ALMOST_MIN = 0.97

export default {
  data() {
    return {
      titles: {}
    }
  },
  computed: {
    showTools() {
      return this.$store.state.nhSettings?.showFinishedBookTools !== false
    },
    mediaProgress() {
      return this.$store.state.user.user?.mediaProgress || []
    },
    recentlyFinished() {
      return this.mediaProgress
        .filter((p) => p?.isFinished && p.libraryItemId)
        .sort((a, b) => (b.finishedAt || b.lastUpdate || 0) - (a.finishedAt || a.lastUpdate || 0))
        .slice(0, 6)
        .map((p) => ({ libraryItemId: p.libraryItemId, finishedAt: p.finishedAt, title: this.titleFor(p.libraryItemId) }))
    },
    almostDone() {
      return this.mediaProgress
        .filter((p) => p && !p.isFinished && p.libraryItemId && p.progress >= ALMOST_MIN && p.progress < 1)
        .sort((a, b) => (b.progress || 0) - (a.progress || 0))
        .slice(0, 6)
        .map((p) => ({ libraryItemId: p.libraryItemId, progress: p.progress, title: this.titleFor(p.libraryItemId) }))
    }
  },
  methods: {
    coverUrl(libraryItemId) {
      return this.$store.getters['globals/getLibraryItemCoverSrcById'](libraryItemId)
    },
    isoDay(ms) {
      if (!ms) return ''
      const d = new Date(ms)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    },
    titleFor(libraryItemId) {
      if (this.titles[libraryItemId]) return this.titles[libraryItemId]
      this.fetchTitle(libraryItemId)
      return '…'
    },
    async fetchTitle(libraryItemId) {
      if (this.titles[libraryItemId]) return
      const item = await this.$nativeHttp.get(`/api/items/${libraryItemId}?minified=1`).catch(() => null)
      const title = item?.media?.metadata?.title
      if (title) this.$set(this.titles, libraryItemId, title)
    },
    patchProgress(libraryItemId, body, failToast) {
      return this.$nativeHttp.patch(`/api/me/progress/${libraryItemId}`, body).catch((error) => {
        console.error('Failed to patch progress', error)
        this.$toast.error(failToast || this.$strings.ToastFailedToUpdate)
        return null
      })
    },
    async onDateChange(row, dateStr) {
      if (!dateStr) return
      const [y, m, d] = dateStr.split('-')
      const ms = new Date(+y, +m - 1, +d, 12, 0, 0).getTime()
      const res = await this.patchProgress(row.libraryItemId, { finishedAt: ms })
      if (res === null) return
      const mp = this.mediaProgress.find((p) => p.libraryItemId === row.libraryItemId)
      if (mp) mp.finishedAt = ms
    },
    async markFinished(row) {
      const res = await this.patchProgress(row.libraryItemId, { isFinished: true }, this.$strings.ToastItemMarkedAsFinishedFailed)
      if (res === null) return
      const mp = this.mediaProgress.find((p) => p.libraryItemId === row.libraryItemId)
      if (mp) {
        mp.isFinished = true
        mp.progress = 1
        mp.finishedAt = Date.now()
      }
    }
  }
}
</script>

<style>
.nh-fbt-date {
  border: none;
  outline: none;
}
</style>
