<template>
  <div v-if="showShelf" class="nh-rf-row">
    <h2 class="nh-rf-heading">{{ strings.title }}</h2>
    <div class="nh-rf-scroll">
      <button v-for="row in rows" :key="row.id" type="button" class="nh-rf-card" @click="openSheet(row)">
        <div class="nh-rf-cover" :style="{ backgroundImage: `url(${coverUrl(row.id)})` }" />
        <p class="nh-rf-title">{{ row.info.title }}</p>
        <p class="nh-rf-cta">
          <span class="nh-rt-stars">★★★★★</span>
          <span>{{ strings.rate }}</span>
        </p>
      </button>
    </div>

    <div v-if="activeRow" id="nh-rf-sheet" @click.self="closeSheet">
      <div class="nh-rt-modal-bg" @click="closeSheet"></div>
      <div class="nh-rt-modal-box">
        <div class="nh-rt-modal-head">
          <span>{{ strings.sheetTitle }}</span>
          <button type="button" class="nh-rt-modal-x" @click="closeSheet">×</button>
        </div>
        <div class="nh-rf-sheet-top">
          <div class="nh-rf-sheet-cover" :style="{ backgroundImage: `url(${coverUrl(activeRow.id)})` }" />
          <div class="nh-rf-sheet-meta">
            <p class="nh-rf-sheet-t">{{ activeRow.info.title }}</p>
            <p class="nh-rf-sheet-a">{{ activeRow.info.author }}</p>
          </div>
        </div>
        <div class="nh-rf-pick" @mousemove="onPickerMove" @mouseleave="previewValue = null" @click="onPickerClick" @touchstart.passive="onPickerMove" @touchend.passive="onPickerClick">
          <span class="nh-rt-stars">
            <span>★★★★★</span>
            <span class="nh-rt-fill" :style="{ width: fillPercent(previewValue !== null ? previewValue : pickedValue) + '%' }">★★★★★</span>
          </span>
        </div>
        <p class="nh-rf-val">{{ pickedValue ? starText(pickedValue) : strings.pickHint }}</p>
        <nuxt-link :to="`/item/${activeRow.id}`" class="nh-rt-link" @click.native="closeSheet">{{ strings.openBook }}</nuxt-link>
      </div>
    </div>
  </div>
</template>

<script>
// NH source: "Rate what you finished" home shelf (enhancements.js nhRateFinished,
// lines 10770-10959) — books you finished but never rated, sourced from the
// user's own mediaProgress + the bulk ratings cache to filter out anything
// already rated. NH resolves library membership via one POST /api/items/batch/get
// for up to 60 candidates; adapted here to this app's existing per-item
// `/api/items/:id?minified=1` + in-memory cache pattern (same one
// components/stats/FinishedBookTools.vue already uses for its own recently-
// finished list) rather than adding a new batch-endpoint call path, at the cost
// of a smaller resolved-candidate window (20 vs NH's 60) — plenty for the common
// case of a handful of recently finished books.
import { nhRateFinishedStrings, nhRatingsLibOn, nhStarText } from '@/store/index'
import nhRatingsBulk from '@/mixins/nhRatingsBulk'

export default {
  mixins: [nhRatingsBulk],
  data() {
    return {
      itemInfo: {},
      fetching: {},
      activeRow: null,
      pickedValue: 0,
      previewValue: null
    }
  },
  computed: {
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    },
    nhSettings() {
      return this.$store.state.nhSettings
    },
    currentLibrary() {
      return this.$store.getters['libraries/getCurrentLibrary']
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    lang() {
      return this.$languageCodes?.current || 'en'
    },
    strings() {
      return nhRateFinishedStrings(this.lang)
    },
    starStep() {
      return this.nhSettings.starStep
    },
    me() {
      return this.$store.state.user.user
    },
    finishedIds() {
      const mediaProgress = this.me?.mediaProgress || []
      return mediaProgress
        .filter((p) => p?.isFinished && p.libraryItemId)
        .sort((a, b) => (b.finishedAt || b.lastUpdate || 0) - (a.finishedAt || a.lastUpdate || 0))
        .map((p) => p.libraryItemId)
    },
    unratedIds() {
      const myId = this.me?.id ? String(this.me.id) : null
      return this.finishedIds
        .filter((id) => {
          const r = this.nhRatingsBulk && this.nhRatingsBulk[id]
          return !(myId && r && r[myId])
        })
        .slice(0, 20)
    },
    rows() {
      return this.unratedIds
        .map((id) => ({ id, info: this.itemInfo[id] }))
        .filter((r) => r.info && r.info.libraryId === this.currentLibraryId)
        .slice(0, 10)
    },
    showShelf() {
      return (
        this.nhThemeActive &&
        !this.$store.state.nhRatingsDead &&
        this.nhSettings.showRateFinished !== false &&
        nhRatingsLibOn(this.nhSettings.ratingLibs, this.currentLibrary) &&
        this.rows.length > 0
      )
    }
  },
  watch: {
    unratedIds: {
      immediate: true,
      handler(ids) {
        ids.forEach((id) => this.fetchItemInfo(id))
      }
    }
  },
  methods: {
    coverUrl(id) {
      return this.$store.getters['globals/getLibraryItemCoverSrcById'](id)
    },
    fillPercent(v) {
      return (Math.max(0, Math.min(5, v || 0)) / 5) * 100
    },
    starText(v) {
      return nhStarText(v, this.starStep)
    },
    async fetchItemInfo(id) {
      if (this.itemInfo[id] || this.fetching[id]) return
      this.$set(this.fetching, id, true)
      const item = await this.$nativeHttp.get(`/api/items/${id}?minified=1`).catch(() => null)
      this.$set(this.fetching, id, false)
      if (!item) return
      const md = item.media?.metadata || {}
      this.$set(this.itemInfo, id, {
        title: md.title || '',
        author: md.authorName || (md.authors || []).map((a) => a.name).join(', ') || '',
        libraryId: item.libraryId
      })
    },
    valueFromPointer(e) {
      const picker = e.currentTarget.querySelector('.nh-rt-stars')
      const rect = picker.getBoundingClientRect()
      const point = e.touches && e.touches[0] ? e.touches[0] : e
      const st = this.starStep
      const v = Math.ceil(((point.clientX - rect.left) / rect.width) * (5 / st)) * st
      return Math.max(st, Math.min(5, v))
    },
    onPickerMove(e) {
      this.previewValue = this.valueFromPointer(e)
    },
    async onPickerClick(e) {
      const v = this.valueFromPointer(e)
      this.pickedValue = v
      const row = this.activeRow
      if (!row) return
      try {
        const res = await this.$nativeHttp.post('/_nh/api/ratings', { itemId: row.id, stars: v, review: '' })
        const ratings = (res && res.items && res.items[row.id]) || {}
        this.$store.commit('patchNhRatingsBulkItem', { itemKey: row.id, ratings })
        setTimeout(() => this.closeSheet(), 400)
      } catch (err) {
        // Silent — the sheet just stays open so the user can try again.
      }
    },
    openSheet(row) {
      this.activeRow = row
      this.pickedValue = 0
      this.previewValue = null
    },
    closeSheet() {
      this.activeRow = null
    }
  },
  mounted() {
    this.ensureNhRatingsBulk()
  }
}
</script>

<style>
/* NH source: .nh-rf-* row/card/sheet rules (adjacent to nh-rt-* in core.js,
   ported unchanged for class names so this stays diffable against NH's CSS). */
html[data-theme='nanohive'] .nh-rf-heading {
  font-family: var(--nh-serif), 'Spectral', serif;
  font-size: 1.15rem;
  color: var(--nh-text-1);
  margin: 0 0 10px;
  padding: 0 16px;
}
html[data-theme='nanohive'] .nh-rf-row {
  margin: 18px 0;
}
html[data-theme='nanohive'] .nh-rf-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 0 16px 4px;
  -webkit-overflow-scrolling: touch;
}
html[data-theme='nanohive'] .nh-rf-card {
  flex: 0 0 auto;
  width: 118px;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}
html[data-theme='nanohive'] .nh-rf-cover {
  width: 118px;
  height: 118px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  background-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.4);
}
html[data-theme='nanohive'] .nh-rf-title {
  font-size: 0.8rem;
  color: var(--nh-text-2);
  margin: 6px 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
html[data-theme='nanohive'] .nh-rf-cta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.72rem;
  color: var(--nh-muted-2);
}
html[data-theme='nanohive'] .nh-rf-cta .nh-rt-stars {
  color: rgba(255, 255, 255, 0.22);
  font-size: 0.85rem;
}
#nh-rf-sheet {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}
html[data-theme='nanohive'] .nh-rf-sheet-top {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
html[data-theme='nanohive'] .nh-rf-sheet-cover {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
html[data-theme='nanohive'] .nh-rf-sheet-t {
  color: var(--nh-text-1);
  font-family: var(--nh-serif), 'Spectral', serif;
  margin: 0 0 2px;
}
html[data-theme='nanohive'] .nh-rf-sheet-a {
  color: var(--nh-muted-2);
  font-size: 0.85rem;
  margin: 0;
}
html[data-theme='nanohive'] .nh-rf-pick {
  cursor: pointer;
  padding: 8px 0;
}
html[data-theme='nanohive'] .nh-rf-pick .nh-rt-stars {
  font-size: 2.1rem;
  letter-spacing: 3px;
}
html[data-theme='nanohive'] .nh-rf-val {
  color: var(--nh-muted-2);
  font-size: 0.85rem;
  min-height: 1.2em;
  margin: 4px 0 12px;
}
</style>
