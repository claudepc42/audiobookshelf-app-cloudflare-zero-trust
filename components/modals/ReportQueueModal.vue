<template>
  <modals-modal v-model="show" :width="500">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-2/3 overflow-hidden">
        <p class="text-3xl text-white truncate">Reported Problems</p>
      </div>
    </template>
    <div class="p-4 w-full text-sm rounded-lg bg-bg shadow-lg border border-black-300" style="min-height: 200px; max-height: 80vh; overflow-y: auto">
      <p v-if="loading" class="text-center text-fg-muted py-4">Loading…</p>
      <p v-else-if="!rows.length" class="text-center text-fg-muted py-4">No open reports.</p>
      <div v-for="row in rows" :key="row.id" class="flex items-start justify-between gap-3 py-3 border-b border-white border-opacity-5 last:border-none">
        <div class="min-w-0">
          <nuxt-link :to="`/item/${row.itemId}`" class="underline truncate block" @click.native="show = false">{{ row.title || row.itemId }}</nuxt-link>
          <p class="text-xs text-fg-muted">{{ reasonLabel(row.reason) }} · {{ row.user || '?' }}{{ row.ts ? ' · ' + formatDate(row.ts) : '' }}</p>
          <p v-if="row.note" class="text-xs mt-1">{{ row.note }}</p>
        </div>
        <ui-btn small color="bg" :loading="resolvingId === row.id" @click="resolve(row.id)">Resolve</ui-btn>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean
  },
  data() {
    return {
      loading: false,
      rows: [],
      resolvingId: null
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
    }
  },
  methods: {
    reasonLabel(reason) {
      return { missing: 'Missing or incomplete content', quality: 'Bad audio quality', play: 'Will not play', wrong: 'Wrong book, cover or metadata', chapters: 'Chapters are wrong', other: 'Something else' }[reason] || 'Something else'
    },
    formatDate(ts) {
      try {
        return new Date(ts).toLocaleDateString(this.$languageCodes?.current)
      } catch (e) {
        return ''
      }
    },
    async load() {
      this.loading = true
      try {
        const res = await this.$nativeHttp.get('/_nh/api/reports-admin')
        this.rows = res?.reports || []
      } catch (e) {
        this.rows = []
      }
      this.loading = false
    },
    async resolve(id) {
      this.resolvingId = id
      try {
        await this.$nativeHttp.delete(`/_nh/api/reports-admin?id=${encodeURIComponent(id)}`)
        this.rows = this.rows.filter((r) => r.id !== id)
        this.$emit('resolved', this.rows.length)
      } catch (e) {
        this.$toast.error('Failed to resolve report')
      }
      this.resolvingId = null
    }
  },
  watch: {
    value(val) {
      if (val) this.load()
    }
  }
}
</script>
