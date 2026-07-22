<template>
  <div v-if="slides.length" id="nh-hero-carousel" class="relative w-full overflow-hidden" style="min-height: 300px">
    <!-- Blurred cinematic background per slide -->
    <div
      v-for="(slide, i) in slides"
      :key="`bg-${slide.id}`"
      class="absolute inset-0 transition-opacity duration-700"
      :style="{
        backgroundImage: `url(${coverSrc(slide)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(24px) brightness(0.25)',
        transform: 'scale(1.12)',
        opacity: activeIndex === i ? 1 : 0,
        pointerEvents: 'none'
      }"
    />

    <!-- Gradient overlay -->
    <div class="absolute inset-0 z-10 pointer-events-none" style="background: linear-gradient(to bottom, rgba(24,21,18,0.10) 0%, rgba(24,21,18,0.80) 75%, rgba(24,21,18,1) 100%)" />

    <!-- Slide content -->
    <div
      v-for="(slide, i) in slides"
      :key="`content-${slide.id}`"
      class="absolute inset-0 z-20 flex flex-col justify-between px-5 pt-5 pb-4 transition-opacity duration-500"
      :style="{ opacity: activeIndex === i ? 1 : 0, pointerEvents: activeIndex === i ? 'auto' : 'none' }"
    >
      <!-- Amber label -->
      <p class="text-xs font-semibold tracking-widest" style="color: #e0c27a; text-transform: uppercase; letter-spacing: 0.12em">Pick up where you left off</p>

      <!-- Cover + text row -->
      <div class="flex items-start gap-4 mt-3 flex-1" @click="openItem(slide)">
        <img
          :src="coverSrc(slide)"
          class="shrink-0 object-cover shadow-2xl"
          style="height: 150px; width: auto; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.60)"
          :alt="itemTitle(slide)"
          loading="lazy"
        />
        <div class="flex-1 min-w-0 flex flex-col justify-between h-full" style="min-height: 150px">
          <div>
            <p class="font-medium leading-snug line-clamp-3" style="font-family: 'Spectral', Georgia, serif; font-size: 1.05rem; color: #f4eee2">{{ itemTitle(slide) }}</p>
            <p class="text-xs mt-1 truncate" style="color: #9a9085">by {{ itemAuthor(slide) }}</p>
          </div>
          <div class="mt-auto pt-3">
            <div class="h-0.5 w-full rounded-full overflow-hidden mb-1" style="background: rgba(244,238,226,0.15)">
              <div class="h-full rounded-full transition-all duration-300" style="background: #e0c27a" :style="{ width: itemProgress(slide) + '%' }" />
            </div>
            <p class="text-xs" style="color: rgba(154,144,133,0.9)">{{ itemProgressLabel(slide) }}</p>
          </div>
        </div>
      </div>

      <!-- Book description excerpt -->
      <p v-if="itemDescription(slide)" class="text-xs mt-2 line-clamp-2 leading-relaxed" style="color: rgba(154,144,133,0.85)">{{ itemDescription(slide) }}</p>

      <!-- Continue button -->
      <button
        class="mt-4 w-full flex items-center justify-center gap-2 rounded-xl font-semibold text-sm"
        style="background: #e0c27a; color: #1a1610; height: 44px; box-shadow: 0 4px 20px rgba(224,194,122,0.30)"
        @click.stop="continueItem(slide)"
      >
        <span class="material-symbols fill" style="font-size: 1.2rem">play_arrow</span>
        Continue
      </button>

      <!-- Dot indicators -->
      <div v-if="slides.length > 1" class="flex justify-center items-center gap-1.5 mt-3">
        <div
          v-for="(_, i) in slides"
          :key="`dot-${i}`"
          class="rounded-full transition-all duration-300 cursor-pointer"
          :style="{
            width: activeIndex === i ? '14px' : '5px',
            height: '5px',
            background: activeIndex === i ? '#e0c27a' : 'rgba(154,144,133,0.45)'
          }"
          @click.stop="goTo(i)"
        />
      </div>
    </div>
  </div>
</template>

<script>
import TouchEvent from '@/objects/TouchEvent'

export default {
  props: {
    slides: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      activeIndex: 0,
      timer: null,
      touchEvent: null
    }
  },
  watch: {
    slides(newVal) {
      if (this.activeIndex >= newVal.length) this.activeIndex = 0
      this.restartTimer()
    }
  },
  methods: {
    coverSrc(item) {
      return this.$store.getters['globals/getLibraryItemCoverSrc'](item) || ''
    },
    itemTitle(item) {
      return item.media?.metadata?.title || item.media?.metadata?.podcastTitle || ''
    },
    itemAuthor(item) {
      return item.media?.metadata?.authorName || item.media?.metadata?.author || ''
    },
    itemProgress(item) {
      const prog = this._getProgress(item)
      return Math.round((prog?.progress || 0) * 100)
    },
    itemProgressLabel(item) {
      const prog = this._getProgress(item)
      if (!prog) return ''
      const pct = Math.round((prog.progress || 0) * 100)
      const dur = item.media?.duration || 0
      if (!dur) return `${pct}%`
      const remaining = Math.max(0, dur - (prog.currentTime || 0))
      return `${pct}% · ${this.$elapsedPretty(remaining)} left`
    },
    itemDescription(item) {
      return item.media?.metadata?.description || ''
    },
    _getProgress(item) {
      return this.$store.getters['user/getUserMediaProgress'](item.id) || item.userMediaProgress || null
    },
    openItem(item) {
      this.$router.push(`/item/${item.id}`)
    },
    continueItem(item) {
      this.$eventBus.$emit('play-item', { libraryItemId: item.id })
    },
    goTo(i) {
      this.activeIndex = i
      this.restartTimer()
    },
    next() {
      this.activeIndex = (this.activeIndex + 1) % this.slides.length
      this.restartTimer()
    },
    prev() {
      this.activeIndex = (this.activeIndex - 1 + this.slides.length) % this.slides.length
      this.restartTimer()
    },
    startTimer() {
      if (this.slides.length <= 1) return
      this.timer = setInterval(() => {
        this.activeIndex = (this.activeIndex + 1) % this.slides.length
      }, 15000)
    },
    restartTimer() {
      clearInterval(this.timer)
      this.startTimer()
    },
    onTouchStart(e) {
      this.touchEvent = new TouchEvent(e)
    },
    onTouchEnd(e) {
      if (!this.touchEvent) return
      this.touchEvent.setEndEvent(e)
      if (this.touchEvent.isSwipeLeft()) this.next()
      else if (this.touchEvent.isSwipeRight()) this.prev()
      this.touchEvent = null
    }
  },
  mounted() {
    this.startTimer()
    this.$el.addEventListener('touchstart', this.onTouchStart, { passive: true })
    this.$el.addEventListener('touchend', this.onTouchEnd, { passive: true })
  },
  beforeDestroy() {
    clearInterval(this.timer)
    this.$el.removeEventListener('touchstart', this.onTouchStart)
    this.$el.removeEventListener('touchend', this.onTouchEnd)
  }
}
</script>
