<template>
  <div v-if="nhThemeActive" class="w-full px-4 py-4">
    <div class="flex items-center mb-3">
      <h1 class="text-2xl flex-grow">{{ $strings.HeaderServerRanking }}</h1>
      <div v-if="rows.length" class="flex gap-1">
        <button v-for="opt in periods" :key="opt.value" type="button" class="px-2.5 py-1 rounded-lg text-xs" :style="periodBtnStyle(opt.value)" @click="period = opt.value">{{ opt.text }}</button>
      </div>
    </div>

    <!-- Non-admin, not yet sharing: explain + offer the opt-in. NH source:
         fsJoin/fsWaiting copy (enhancements.js:9556-9559). -->
    <div v-if="!isAdminOrUp && !settings.familyStats" class="text-sm text-fg-muted py-4">
      <p class="mb-2">{{ $strings.MessageShareStatsPrompt }}</p>
      <ui-btn small color="primary" :loading="joining" @click="joinSharing">{{ $strings.ButtonShareListeningStats }}</ui-btn>
    </div>
    <div v-else-if="!isAdminOrUp && settings.familyStats && !rows.length && !loading" class="text-sm text-fg-muted py-4">
      <p>{{ $strings.MessageWaitingForOthers }}</p>
      <button type="button" class="text-xs underline mt-2" @click="leaveSharing">{{ $strings.ButtonStopSharing }}</button>
    </div>

    <div v-if="loading" class="text-sm text-fg-muted py-4">{{ $strings.MessageLoading }}</div>

    <template v-else-if="rows.length">
      <div class="flex flex-wrap gap-3 mb-4">
        <div class="px-4 py-2 rounded-lg bg-primary text-center">
          <p class="text-lg font-bold">{{ fmt(totalSecs) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelTotal }}</p>
        </div>
        <div class="px-4 py-2 rounded-lg bg-primary text-center">
          <p class="text-lg font-bold">{{ activeCount }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelActiveListeners }}</p>
        </div>
        <div class="px-4 py-2 rounded-lg bg-primary text-center">
          <p class="text-lg font-bold">{{ fmt(avgSecs) }}</p>
          <p class="text-xs text-fg-muted">{{ $strings.LabelAverage }}</p>
        </div>
      </div>

      <div v-for="(row, i) in rows" :key="row.user.id" class="flex items-center py-2 border-b border-white border-opacity-5 last:border-none">
        <p class="text-sm text-fg-muted w-8 min-w-8">#{{ i + 1 }}</p>
        <img v-if="nhAvatarUrl(row.user.id)" :src="nhAvatarUrl(row.user.id)" alt="" class="w-8 h-8 rounded-full object-cover mr-3" />
        <div v-else class="w-8 h-8 rounded-full bg-bg-hover flex items-center justify-center mr-3 text-sm">{{ (row.user.username || '?').charAt(0).toUpperCase() }}</div>
        <p class="text-sm flex-grow truncate">{{ row.user.username }}</p>
        <p class="text-sm font-bold">{{ fmt(row.secs) }}</p>
      </div>

      <button v-if="!isAdminOrUp && settings.familyStats" type="button" class="text-xs underline mt-3 text-fg-muted" @click="leaveSharing">{{ $strings.ButtonStopSharing }}</button>
    </template>
  </div>
</template>

<script>
import nhSeriesMeta from '@/mixins/nhSeriesMeta'

// NH source: nhStatsScoreboard() (enhancements.js:9438-9636) — condensed to a
// plain ranked list rather than NH's podium-plus-tile-grid layout (simpler,
// same underlying data/math). Admin auto-seeding of the shared store for every
// user (nhFsAdminSeed, enhancements.js:9681+) and the per-user drill-down modal
// are left out — this covers the core "see where you rank" value.
export default {
  mixins: [nhSeriesMeta],
  data() {
    return {
      loading: false,
      joining: false,
      period: 'week',
      users: null,
      stats: {}
    }
  },
  computed: {
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    },
    settings() {
      return this.$store.state.nhSettings
    },
    isAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    periods() {
      return [
        { value: 'week', text: this.$strings.LabelWeek },
        { value: 'month', text: this.$strings.LabelMonth },
        { value: 'year', text: this.$strings.LabelYear },
        { value: 'all', text: this.$strings.LabelAll }
      ]
    },
    rows() {
      if (!this.users) return []
      return this.users
        .map((u) => ({ user: u, secs: this.periodTotal(this.stats[u.id]) }))
        .sort((a, b) => b.secs - a.secs)
    },
    totalSecs() {
      return this.rows.reduce((s, r) => s + r.secs, 0)
    },
    activeCount() {
      return this.rows.filter((r) => r.secs > 0).length
    },
    avgSecs() {
      return this.activeCount ? this.totalSecs / this.activeCount : 0
    }
  },
  watch: {
    period() {
      this.load()
    }
  },
  methods: {
    periodBtnStyle(value) {
      const on = this.period === value
      return { color: on ? '#e0c27a' : '#9a9085', background: on ? 'rgba(224,194,122,0.12)' : 'transparent', border: on ? '1px solid #e0c27a' : '1px solid rgba(255,255,255,0.10)' }
    },
    // NH source: nhSbFmt (enhancements.js:8064-8073), values ported exactly.
    fmt(secs) {
      let m = Math.round(Math.max(0, secs || 0) / 60)
      const d = Math.floor(m / 1440)
      m -= d * 1440
      const h = Math.floor(m / 60)
      m -= h * 60
      if (d > 0) return `${d}d ${h}h`
      if (h > 0) return `${h}h ${m}m`
      return `${m}m`
    },
    // NH source: nhSbPeriodTotal (enhancements.js:8081-8089), values ported exactly.
    periodTotal(stats) {
      if (!stats) return 0
      if (this.period === 'all') return stats.totalTime || 0
      const days = stats.days || {}
      const n = this.period === 'week' ? 7 : this.period === 'month' ? 30 : 365
      const now = Date.now()
      let sum = 0
      for (let i = 0; i < n; i++) {
        const ds = new Date(now - i * 86400000).toISOString().slice(0, 10)
        sum += days[ds] || 0
      }
      return sum
    },
    async load() {
      if (!this.nhThemeActive) return
      this.ensureNhSeriesMeta()
      this.loading = true
      try {
        if (this.isAdminOrUp) {
          const [usersRes, statsRes] = await Promise.all([this.$nativeHttp.get('/api/users').catch(() => null), this.$nativeHttp.get('/_nh/api/stats').catch(() => null)])
          const shared = statsRes?.users || {}
          const optedOut = {}
          Object.keys(shared).forEach((id) => {
            if (shared[id]?.out) optedOut[id] = true
          })
          const all = usersRes?.users || usersRes || []
          this.users = all.filter((u) => u.isActive !== false && !optedOut[u.id]).map((u) => ({ id: u.id, username: u.username }))
          this.loading = false
          await Promise.all(
            this.users.map((u) =>
              this.$nativeHttp
                .get(`/api/users/${u.id}/listening-stats`)
                .then((st) => {
                  if (st) this.$set(this.stats, u.id, st)
                })
                .catch(() => {})
            )
          )
        } else {
          const res = await this.$nativeHttp.get('/_nh/api/stats')
          const recs = res?.users || {}
          this.users = Object.keys(recs)
            .filter((id) => recs[id] && !recs[id].out)
            .map((id) => ({ id, username: recs[id].user || '?' }))
          this.users.forEach((u) => {
            const rec = recs[u.id]
            this.$set(this.stats, u.id, { totalTime: rec.total || 0, days: rec.days || {} })
          })
          this.loading = false
        }
      } catch (e) {
        this.loading = false
        this.users = this.users || []
      }
    },
    // NH source: nhFsSave() (enhancements.js:9736-9761) — rounds/summarizes own
    // stats client-side before sharing, values ported exactly (last 400 days).
    async joinSharing() {
      this.joining = true
      try {
        const st = await this.$nativeHttp.get('/api/me/listening-stats')
        const days = {}
        Object.keys(st?.days || {})
          .sort()
          .slice(-400)
          .forEach((k) => {
            if (st.days[k] > 0) days[k] = Math.round(st.days[k])
          })
        await this.$nativeHttp.post('/_nh/api/stats', { total: Math.round(st?.totalTime || 0), days })
        this.$store.commit('setNhSetting', { key: 'familyStats', value: true })
        const saved = (await this.$localStore.getNhSettings()) || {}
        await this.$localStore.setNhSettings({ ...saved, ...this.$store.state.nhSettings })
        this.load()
      } catch (e) {
        this.$toast.error(this.$strings.ToastShareStatsFailed)
      }
      this.joining = false
    },
    async leaveSharing() {
      try {
        await this.$nativeHttp.delete('/_nh/api/stats')
      } catch (e) {
        // ignore — still clear the local flag
      }
      this.$store.commit('setNhSetting', { key: 'familyStats', value: false })
      const saved = (await this.$localStore.getNhSettings()) || {}
      await this.$localStore.setNhSettings({ ...saved, ...this.$store.state.nhSettings })
      this.users = null
      this.load()
    }
  },
  mounted() {
    this.load()
  }
}
</script>
