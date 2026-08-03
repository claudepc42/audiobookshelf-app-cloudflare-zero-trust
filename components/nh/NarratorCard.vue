<template>
  <nuxt-link :to="href" class="nh-nr-card" :style="{ background: tint }">
    <div class="nh-nr-covers">
      <span class="nh-nr-ph">{{ initial }}</span>
      <span v-for="(id, idx) in coverIds" v-show="!failedIdx[idx]" :key="id" class="nh-nr-cbox" :class="`nh-nr-c${idx}`">
        <img :src="coverUrl(id)" loading="lazy" @error="onCoverError(idx)" @load="idx === 0 && onFirstCoverLoad(id)" />
      </span>
    </div>
    <p class="nh-nr-name">{{ narrator.name }}</p>
    <p class="nh-nr-count2">{{ bookCountText }}</p>
  </nuxt-link>
</template>

<script>
// NH source: narrators page card (enhancements.js:6746-6793) — cover collage
// (up to 3 stacked covers over an initials medallion base layer) plus an
// average-color tint sampled from the first cover. Adapted from NH's raw
// canvas pixel-sampling to this app's existing getAverageColorFromCoverUrl
// utility (utils/coverAverageColor.js), which already handles native
// cross-origin cover fetching the same way AudioPlayer.vue's cinematic
// background does — a plain <canvas>.drawImage() would fail on native for a
// cross-origin cover the WebView can't read pixels from.
import { getAverageColorFromCoverUrl } from '@/utils/coverAverageColor'
import { nhRatingWord } from '@/store/index'

export default {
  props: {
    narrator: { type: Object, required: true },
    libraryId: { type: String, required: true },
    coverIds: { type: Array, default: () => [] },
    bookForms: { type: Array, default: () => ['book', 'books'] }
  },
  data() {
    return {
      failedIdx: {},
      tint: null
    }
  },
  computed: {
    initial() {
      return (this.narrator.name || '?').trim().charAt(0).toUpperCase()
    },
    href() {
      return `/bookshelf/library?filter=narrators.${this.$encode(this.narrator.name)}`
    },
    bookCountText() {
      const n = this.narrator.numBooks || 0
      return `${n} ${nhRatingWord(n, this.bookForms)}`
    }
  },
  methods: {
    coverUrl(id) {
      return this.$store.getters['globals/getLibraryItemCoverSrcById'](id)
    },
    onCoverError(idx) {
      this.$set(this.failedIdx, idx, true)
    },
    async onFirstCoverLoad(id) {
      const avg = await getAverageColorFromCoverUrl(this, this.coverUrl(id))
      if (!avg) return
      const rgb = avg.rgba
        .replace(/rgba?\(|\)/g, '')
        .split(',')
        .slice(0, 3)
        .map((v) => v.trim())
        .join(',')
      this.tint = `linear-gradient(160deg, rgba(${rgb},0.26) 0%, rgba(${rgb},0.07) 70%)`
    }
  }
}
</script>

<style>
/* NH source: .nh-nr-* card/collage rules (core.js:1383-1395). Ported class
   names unchanged so this stays easy to diff against NH's real CSS later. */
.nh-nr-card {
  display: block;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 70%);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  padding: 16px;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.18s ease, border-color 0.18s ease;
}
.nh-nr-card:hover {
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.2);
}
.nh-nr-covers {
  position: relative;
  height: 118px;
  margin-bottom: 14px;
  overflow: hidden;
  border-radius: 8px;
}
.nh-nr-cbox {
  position: absolute;
  top: 0;
  display: block;
  width: 112px;
  height: 112px;
  border-radius: 7px;
  overflow: hidden;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
  background: rgba(0, 0, 0, 0.25);
}
.nh-nr-cbox img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.nh-nr-covers .nh-nr-c0 {
  left: 0;
  z-index: 3;
}
.nh-nr-covers .nh-nr-c1 {
  left: 34%;
  top: 3px;
  z-index: 2;
  filter: brightness(0.85);
}
.nh-nr-covers .nh-nr-c2 {
  left: 64%;
  top: 6px;
  z-index: 1;
  filter: brightness(0.7);
}
.nh-nr-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.09);
  font-family: var(--nh-serif, 'Spectral', serif);
  font-size: 2.4rem;
  color: var(--nh-amber, #e0c27a);
}
.nh-nr-name {
  font-family: var(--nh-serif, 'Spectral', serif);
  font-size: 1.05rem;
  font-weight: 500;
  color: #efe9dd;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nh-nr-count2 {
  font-family: var(--nh-sans, system-ui);
  font-size: 0.78rem;
  color: var(--nh-muted-2, #9a9085);
  margin: 3px 0 0;
}
</style>
