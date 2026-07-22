<template>
  <div v-if="slides.length" id="nh-hero-carousel" class="relative w-full overflow-hidden" style="min-height: 300px" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
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
      class="absolute inset-0 z-20 flex flex-col px-5 pt-5 pb-4"
      :style="slideStyle(i)"
    >
      <!-- Amber label -->
      <p class="text-xs font-semibold tracking-widest flex-shrink-0" style="color: #e0c27a; text-transform: uppercase; letter-spacing: 0.12em">Pick up where you left off</p>

      <!-- Cover + text row — fixed height, no flex-1 so it won't squeeze other items -->
      <div class="flex items-start gap-4 mt-3 flex-shrink-0" style="height: 150px" @click="openItem(slide)">
        <img
          :src="coverSrc(slide)"
          class="shrink-0 object-cover"
          style="height: 150px; width: auto; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.60)"
          :alt="itemTitle(slide)"
          loading="lazy"
        />
        <!-- Text column: title + author at top, description in middle, progress at bottom -->
        <div class="flex-1 min-w-0 flex flex-col h-full">
          <div class="flex-shrink-0">
            <p class="font-medium leading-snug line-clamp-2" style="font-family: 'Spectral', Georgia, serif; font-size: 1.05rem; color: #f4eee2">{{ itemTitle(slide) }}</p>
            <p class="text-xs mt-0.5 truncate" style="color: #9a9085">by {{ itemAuthor(slide) }}</p>
          </div>
          <p v-if="itemDescription(slide)" class="text-xs mt-1.5 line-clamp-2 leading-relaxed flex-shrink-0" style="color: rgba(154,144,133,0.80)">{{ itemDescription(slide) }}</p>
          <div class="mt-auto flex-shrink-0">
            <div class="h-0.5 w-full rounded-full overflow-hidden mb-1" style="background: rgba(244,238,226,0.15)">
              <div class="h-full rounded-full transition-all duration-300" style="background: #e0c27a" :style="{ width: itemProgress(slide) + '%' }" />
            </div>
            <p class="text-xs" style="color: rgba(154,144,133,0.9)">{{ itemProgressLabel(slide) }}</p>
          </div>
        </div>
      </div>

      <!-- Spacer pushes Continue button to bottom -->
      <div class="flex-1" />

      <!-- Continue button — flex-shrink-0 so it never compresses -->
      <button
        class="w-full flex items-center justify-center gap-2 rounded-xl font-semibold text-sm flex-shrink-0"
        style="background: #e0c27a; color: #1a1610; height: 44px; box-shadow: 0 4px 20px rgba(224,194,122,0.30)"
        @click.stop="continueItem(slide)"
      >
        <span class="material-symbols fill" style="font-size: 1.2rem">play_arrow</span>
        Continue
      </button>

      <!-- Dot indicators — flex-shrink-0 -->
      <div v-if="slides.length > 1" class="flex justify-center items-center gap-1.5 mt-3 flex-shrink-0">
        <div
          v-for="(_, di) in slides"
          :key="`dot-${di}`"
          class="rounded-full transition-all duration-300 cursor-pointer"
          :style="{
            width: activeIndex === di ? '14px' : '5px',
            height: '5px',
            background: activeIndex === di ? '#e0c27a' : 'rgba(154,144,133,0.45)'
          }"
          @click.stop="goTo(di)"
        />
      </div>
    </div>
  </div>
</template>

<script>
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
      // Drag state
      dragStartX: null,
      dragStartY: null,
      dragOffset: 0,
      isDragging: false,
      dragLocked: null, // 'horizontal' | 'vertical' | null
      dragVelocity: 0,
      lastTouchX: null,
      lastTouchTime: null,
      dragMoved: false,
      // Auto-advance state
      firstTouchTime: 0,
      lastUserTouchTime: 0,
      lastAdvanceTime: 0,
      advanceInterval: null
    }
  },
  watch: {
    slides(newVal) {
      if (this.activeIndex >= newVal.length) this.activeIndex = 0
      this.restartTimer()
    }
  },
  methods: {
    slideStyle(i) {
      const isActive = this.activeIndex === i
      const transition = this.isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.5s'

      if (!isActive && !this.isDragging) {
        return { opacity: 0, pointerEvents: 'none', transform: 'translateX(0)', transition }
      }

      const diff = i - this.activeIndex
      const px = this.isDragging ? this.dragOffset : 0

      if (Math.abs(diff) > 1) {
        return { opacity: 0, pointerEvents: 'none', transform: `translateX(${diff * 100}%)`, transition }
      }

      const cardWidth = this.$el ? this.$el.offsetWidth : 300
      const adjacentOpacity = diff !== 0 ? Math.min(1, Math.abs(px) / cardWidth * 1.5) : 1

      return {
        opacity: diff === 0 ? 1 : adjacentOpacity,
        pointerEvents: diff === 0 ? 'auto' : 'none',
        transform: `translateX(calc(${diff * 100}% + ${px}px))`,
        transition
      }
    },
    coverSrc(item) {
      return this.$store.getters['globals/getLibraryItemCoverSrc'](item) || ''
    },
    itemTitle(item) {
      return item.media?.metadata?.title || item.media?.metadata?.podcastTitle || ''
    },
    itemAuthor(item) {
      return item.media?.metadata?.authorName || item.media?.metadata?.author || ''
    },
    itemDescription(item) {
      return item.media?.metadata?.description || ''
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
    _getProgress(item) {
      return this.$store.getters['user/getUserMediaProgress'](item.id) || item.userMediaProgress || null
    },
    openItem(item) {
      if (this.dragMoved) return
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
    restartTimer() {},
    checkAutoAdvance() {
      if (this.slides.length <= 1 || this.isDragging) return
      const now = Date.now()
      if (this.firstTouchTime) {
        if (now - this.firstTouchTime < 30000) return
        if (now - this.lastUserTouchTime < 15000) return
      }
      if (now - this.lastAdvanceTime < 15000) return
      this.activeIndex = (this.activeIndex + 1) % this.slides.length
      this.lastAdvanceTime = now
      this.firstTouchTime = 0
      this.lastUserTouchTime = 0
    },
    onTouchStart(e) {
      const touch = e.touches[0]
      this.dragStartX = touch.clientX
      this.dragStartY = touch.clientY
      this.lastTouchX = touch.clientX
      this.lastTouchTime = Date.now()
      this.dragOffset = 0
      this.dragVelocity = 0
      this.dragMoved = false
      this.dragLocked = null
      this.isDragging = true
      const now = Date.now()
      if (!this.firstTouchTime) this.firstTouchTime = now
      this.lastUserTouchTime = now
    },
    onTouchMove(e) {
      if (!this.isDragging || this.dragStartX === null) return

      const touch = e.touches[0]
      const x = touch.clientX
      const y = touch.clientY
      const dx = x - this.dragStartX
      const dy = y - this.dragStartY

      // Lock direction on first significant movement
      if (!this.dragLocked) {
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          this.dragLocked = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical'
        }
        return
      }

      if (this.dragLocked === 'vertical') {
        // Vertical scroll — cancel drag and let browser handle it
        this.isDragging = false
        this.dragOffset = 0
        return
      }

      // Horizontal drag — prevent page scroll and track position
      e.preventDefault()

      const now = Date.now()
      const dt = now - this.lastTouchTime
      if (dt > 0) this.dragVelocity = (x - this.lastTouchX) / dt
      this.lastTouchX = x
      this.lastTouchTime = now
      this.dragOffset = dx
      if (Math.abs(dx) > 8) this.dragMoved = true
    },
    onTouchEnd() {
      if (!this.isDragging) return
      this.isDragging = false

      const offset = this.dragOffset
      const velocity = this.dragVelocity
      const threshold = (this.$el ? this.$el.offsetWidth : 300) * 0.30

      if (offset < -threshold || velocity < -0.4) {
        this.next()
      } else if (offset > threshold || velocity > 0.4) {
        this.prev()
      }

      this.dragOffset = 0
      this.dragStartX = null
      this.dragStartY = null
      this.dragLocked = null

      this.$nextTick(() => { this.dragMoved = false })
    }
  },
  mounted() {
    this.lastAdvanceTime = Date.now()
    this.advanceInterval = setInterval(this.checkAutoAdvance, 1000)
  },
  beforeDestroy() {
    clearInterval(this.advanceInterval)
  }
}
</script>
