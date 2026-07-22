<template>
  <div v-if="slides.length" id="nh-hero-carousel" class="relative w-full overflow-hidden" style="height: 240px">
    <!-- Blurred cinematic background per slide -->
    <div
      v-for="(slide, i) in slides"
      :key="`bg-${slide.id}`"
      class="absolute inset-0 transition-opacity duration-700"
      :style="{
        backgroundImage: `url(${coverSrc(slide)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(24px) brightness(0.28)',
        transform: 'scale(1.12)',
        opacity: activeIndex === i ? 1 : 0,
        pointerEvents: 'none'
      }"
    />

    <!-- Gradient overlay so bottom content is always readable -->
    <div class="absolute inset-0 z-10 pointer-events-none" style="background: linear-gradient(to bottom, rgba(24,21,18,0.15) 0%, rgba(24,21,18,0.85) 70%, rgba(24,21,18,1) 100%)" />

    <!-- Slide content -->
    <div
      v-for="(slide, i) in slides"
      :key="`content-${slide.id}`"
      class="absolute inset-0 z-20 flex items-end px-5 pb-6 transition-opacity duration-500"
      :style="{ opacity: activeIndex === i ? 1 : 0, pointerEvents: activeIndex === i ? 'auto' : 'none' }"
      @click="openItem(slide)"
    >
      <img
        :src="coverSrc(slide)"
        class="h-28 w-20 object-cover rounded-lg shadow-2xl shrink-0"
        :alt="itemTitle(slide)"
        loading="lazy"
      />
      <div class="pl-4 flex-1 min-w-0">
        <p class="text-sm font-semibold text-fg leading-snug line-clamp-2">{{ itemTitle(slide) }}</p>
        <p class="text-xs text-fg-muted mt-0.5 truncate">{{ itemAuthor(slide) }}</p>
        <div class="mt-3 h-0.5 w-full rounded-full overflow-hidden" style="background: rgba(244,238,226,0.15)">
          <div class="h-full rounded-full transition-all duration-300" style="background: #e0c27a" :style="{ width: itemProgress(slide) + '%' }" />
        </div>
        <p class="text-xs mt-1" style="color: rgba(154,144,133,0.8)">{{ itemProgressLabel(slide) }}</p>
      </div>
    </div>

    <!-- Tap zones for prev / next -->
    <button
      v-if="slides.length > 1"
      class="absolute left-0 top-0 bottom-0 w-1/3 z-30"
      aria-label="Previous"
      @click.stop="prev"
    />
    <button
      v-if="slides.length > 1"
      class="absolute right-0 top-0 bottom-0 w-1/3 z-30"
      aria-label="Next"
      @click.stop="next"
    />

    <!-- Dot indicators -->
    <div v-if="slides.length > 1" class="absolute bottom-2 left-0 right-0 z-30 flex justify-center items-center gap-1.5 pointer-events-none">
      <div
        v-for="(_, i) in slides"
        :key="`dot-${i}`"
        class="rounded-full transition-all duration-300"
        :style="{
          width: activeIndex === i ? '14px' : '5px',
          height: '5px',
          background: activeIndex === i ? '#e0c27a' : 'rgba(154,144,133,0.45)'
        }"
      />
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
  computed: {
    serverAddress() {
      return this.$store.getters['user/getServerAddress']
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
      const prog = item.userMediaProgress?.progress || 0
      return Math.round(prog * 100)
    },
    itemProgressLabel(item) {
      const prog = item.userMediaProgress
      if (!prog) return ''
      const pct = Math.round((prog.progress || 0) * 100)
      const dur = item.media?.duration || 0
      if (!dur) return `${pct}%`
      const remaining = Math.max(0, dur - (prog.currentTime || 0))
      return `${pct}% · ${this.$elapsedPretty(remaining)} left`
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
    openItem(item) {
      this.$router.push(`/item/${item.id}`)
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
