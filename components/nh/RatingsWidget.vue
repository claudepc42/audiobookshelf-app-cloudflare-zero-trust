<template>
  <div v-if="!dead" id="nh-ratings">
    <div class="nh-rt-main">
      <span id="nh-rt-picker" class="nh-rt-stars" @mousemove="onPickerMove" @mouseleave="onPickerLeave" @click="onPickerClick" @touchstart.passive="onPickerMove" @touchend.passive="onPickerClick">
        <span>★★★★★</span>
        <span class="nh-rt-fill" :style="{ width: fillPercent(previewValue !== null ? previewValue : avg) + '%' }">★★★★★</span>
      </span>
      <span class="nh-rt-score" :class="{ 'nh-rt-score-preview': previewValue !== null }">{{ scoreText }}</span>
      <button v-if="entries.length" type="button" class="nh-rt-link" @click="modalOpen = true">
        {{ countsText }}
      </button>
      <span v-if="!mine" class="nh-rt-status">{{ status }}</span>
    </div>

    <div v-if="me && mine" class="nh-rt-your">
      <span class="nh-rt-your-label">{{ strings.yourLabel }}</span>
      <span class="nh-rt-stars">
        <span>★★★★★</span>
        <span class="nh-rt-fill" :style="{ width: fillPercent(mine.stars) + '%' }">★★★★★</span>
      </span>
      <span class="nh-rt-avg">{{ starText(mine.stars) }}</span>
      <button type="button" class="nh-rt-link" @click="toggleEditor">{{ mine.review ? strings.editReview : strings.addReview }}</button>
      <button type="button" class="nh-rt-link" @click="clearMine">{{ strings.clear }}</button>
      <span class="nh-rt-status">{{ status }}</span>
    </div>

    <div v-if="me && editorOpen" id="nh-rt-editor">
      <textarea id="nh-rt-review" v-model="draft" maxlength="1500" :placeholder="strings.ph"></textarea>
      <div class="nh-rt-actions">
        <button type="button" class="nh-rt-btn" @click="saveReview">{{ strings.save }}</button>
      </div>
    </div>

    <div v-if="modalOpen && entries.length" id="nh-rt-modal" @click.self="modalOpen = false">
      <div class="nh-rt-modal-bg" @click="modalOpen = false"></div>
      <div class="nh-rt-modal-box">
        <div class="nh-rt-modal-head">
          <span>{{ countsText }}</span>
          <button type="button" class="nh-rt-modal-x" @click="modalOpen = false">×</button>
        </div>
        <div v-for="entry in entries" :key="entry.uid" class="nh-rt-row">
          <div class="nh-rt-row-top">
            <!-- NH source: nhAvatarInto (enhancements.js:8095-8107) — served from
                 /_nh/user-avatars via the proxy; simply doesn't render if unset. -->
            <img v-if="nhAvatarUrl(entry.uid)" :src="nhAvatarUrl(entry.uid)" alt="" class="nh-rt-avatar" />
            <span class="nh-rt-user">{{ entry.user }}{{ me && entry.uid === me.id ? ` (${strings.you})` : '' }}</span>
            <span class="nh-rt-stars">
              <span>★★★★★</span>
              <span class="nh-rt-fill" :style="{ width: fillPercent(entry.stars) + '%' }">★★★★★</span>
            </span>
            <span class="nh-rt-avg">{{ starText(entry.stars) }}</span>
            <span v-if="entry.ts" class="nh-rt-date">{{ formatDate(entry.ts) }}</span>
            <button v-if="me && me.admin && entry.uid !== me.id" type="button" class="nh-rt-del" @click="adminDelete(entry.uid)">{{ strings.del }}</button>
          </div>
          <p v-if="entry.review" class="nh-rt-text">{{ entry.review }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { nhStarText, nhRatingStrings, nhRatingWord } from '@/store/index'
import nhSeriesMeta from '@/mixins/nhSeriesMeta'

export default {
  mixins: [nhSeriesMeta],
  props: {
    // The book's own libraryItemId, or `series:<seriesId>` for a series page —
    // NH source reuses one widget/endpoint for both (book-details.js:1294-1341).
    itemKey: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      ratings: null,
      fetching: false,
      gone: false,
      tries: 0,
      timer: null,
      editorOpen: false,
      draft: '',
      modalOpen: false,
      previewValue: null,
      status: ''
    }
  },
  computed: {
    nhSettings() {
      return this.$store.state.nhSettings
    },
    dead() {
      return this.$store.state.nhRatingsDead || this.gone
    },
    starStep() {
      return this.nhSettings.starStep
    },
    strings() {
      return nhRatingStrings(this.$languageCodes?.current)
    },
    me() {
      const u = this.$store.state.user.user
      if (!u || !u.id) return null
      return { id: String(u.id), name: u.username || 'me', admin: !!this.$store.getters['user/getIsAdminOrUp'] }
    },
    entries() {
      const ratings = this.ratings || {}
      return Object.keys(ratings)
        .map((k) => Object.assign({ uid: k }, ratings[k]))
        .filter((e) => typeof e.stars === 'number')
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    },
    mine() {
      return this.me ? (this.ratings || {})[this.me.id] || null : null
    },
    avg() {
      if (!this.entries.length) return 0
      return this.entries.reduce((s, e) => s + e.stars, 0) / this.entries.length
    },
    nRev() {
      return this.entries.filter((e) => e.review).length
    },
    scoreText() {
      if (this.previewValue !== null) return this.starText(this.previewValue)
      return this.entries.length ? this.starText(this.avg) : ''
    },
    countsText() {
      const parts = [`${this.entries.length} ${nhRatingWord(this.entries.length, this.strings.ratingWords)}`]
      if (this.nRev) parts.push(`${this.nRev} ${nhRatingWord(this.nRev, this.strings.reviewWords)}`)
      return parts.join(' · ')
    }
  },
  watch: {
    itemKey: {
      immediate: true,
      handler() {
        this.reset()
        this.fetch()
        this.ensureNhSeriesMeta()
      }
    }
  },
  beforeDestroy() {
    clearTimeout(this.timer)
  },
  methods: {
    reset() {
      clearTimeout(this.timer)
      this.ratings = null
      this.fetching = false
      this.gone = false
      this.tries = 0
      this.editorOpen = false
      this.draft = ''
      this.modalOpen = false
      this.previewValue = null
      this.status = ''
    },
    fillPercent(v) {
      return (Math.max(0, Math.min(5, v || 0)) / 5) * 100
    },
    starText(v) {
      return nhStarText(v, this.starStep)
    },
    formatDate(ts) {
      try {
        return new Date(ts).toLocaleDateString(this.$languageCodes?.current)
      } catch (e) {
        return ''
      }
    },
    async fetch() {
      if (this.fetching || this.$store.state.nhRatingsDead) return
      this.fetching = true
      try {
        const res = await this.$nativeHttp.get(`/_nh/api/ratings?item=${encodeURIComponent(this.itemKey)}`)
        this.fetching = false
        this.ratings = (res && res.items && res.items[this.itemKey]) || {}
        this.tries = 0
      } catch (e) {
        this.fetching = false
        this.tries++
        // $nativeHttp's thrown Error only carries a message string (often the raw
        // response body, not the status code), so a reliable 404-vs-transient-error
        // split isn't available here the way NH's own fetch()-based client can do it
        // (book-details.js:992, checking r.status directly). Retry with backoff
        // (mirrors nhRtRetry, book-details.js:974-984) and treat exhausted retries as
        // "unavailable for this item" — scoped to THIS widget instance only (NH
        // source: nhRt.dead is per-instance too), not a global kill switch. Only the
        // shared bulk cache (mixins/nhRatingsBulk.js) sets the session-wide dead flag,
        // matching NH's own nhRs.dead vs. nhRt.dead distinction.
        if (this.tries > 6) {
          this.gone = true
          return
        }
        this.timer = setTimeout(() => this.fetch(), 1200 * this.tries)
      }
    },
    valueFromPointer(e) {
      const picker = e.currentTarget
      const rect = picker.getBoundingClientRect()
      const point = e.touches && e.touches[0] ? e.touches[0] : e
      const st = this.starStep
      const v = Math.ceil(((point.clientX - rect.left) / rect.width) * (5 / st)) * st
      return Math.max(st, Math.min(5, v))
    },
    onPickerMove(e) {
      if (!this.me) return
      this.previewValue = this.valueFromPointer(e)
    },
    onPickerLeave() {
      this.previewValue = null
    },
    onPickerClick(e) {
      if (!this.me) return
      const v = this.valueFromPointer(e)
      this.status = '…'
      this.save(v, this.editorOpen ? this.draft : (this.mine && this.mine.review) || '')
    },
    toggleEditor() {
      this.editorOpen = !this.editorOpen
      if (this.editorOpen && !this.draft) this.draft = (this.mine && this.mine.review) || ''
    },
    saveReview() {
      this.editorOpen = false
      this.save((this.mine && this.mine.stars) || 5, this.draft)
    },
    clearMine() {
      this.editorOpen = false
      this.draft = ''
      this.save(0, '')
    },
    adminDelete(uid) {
      this.save(0, '', uid)
    },
    async save(stars, review, forUser) {
      const body = { itemId: this.itemKey, stars, review: review || '' }
      if (forUser) body.forUser = forUser
      const url = forUser ? '/_nh/api/ratings-admin' : '/_nh/api/ratings'
      try {
        const res = await this.$nativeHttp.post(url, body)
        this.ratings = (res && res.items && res.items[this.itemKey]) || {}
        this.status = ''
        this.$store.commit('patchNhRatingsBulkItem', { itemKey: this.itemKey, ratings: this.ratings })
      } catch (e) {
        this.status = this.strings.err
      }
    }
  }
}
</script>
