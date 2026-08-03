<template>
  <div v-if="slides.length" id="nh-hero-carousel" class="relative w-full">
  <div class="relative w-full overflow-hidden" style="min-height: 310px" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd">
    <!-- Blurred cinematic background per slide -->
    <div
      v-for="(slide, i) in slides"
      :key="`bg-${slide.id}`"
      class="nh-slide-bg absolute inset-0 transition-opacity duration-700"
      :style="{
        backgroundImage: `url(${coverSrc(slide)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: activeIndex === i ? 1 : 0,
        pointerEvents: 'none'
      }"
    />

    <!-- Gradient overlay -->
    <div class="nh-slide-gradient absolute inset-0 z-10 pointer-events-none" />

    <!-- Slide content. ref="slideEl" (same static name on every v-for
         iteration) gives onTouchMove a plain array of the live DOM nodes so
         it can write transform directly during a drag, bypassing Vue's
         reactive :style binding entirely — see the drag methods below for
         why. -->
    <div
      v-for="(slide, i) in slides"
      :key="`content-${slide.id}`"
      ref="slideEl"
      class="absolute inset-0 z-20 flex flex-col px-5 pt-5 pb-5"
      :style="slideStyle(i)"
    >
      <!-- Amber label — small caps. NH source: t.pickup (enhancements.js:1977) —
           "Your books are waiting", not "Pick up where you left off" (that string
           is actually t.fallbackDesc, a different string entirely, used for the
           description text when an item has none of its own). -->
      <p class="text-xs font-semibold flex-shrink-0" style="color: var(--nh-amber); text-transform: uppercase; letter-spacing: 0.13em">Your books are waiting</p>

      <!-- Main row: text LEFT, cover RIGHT -->
      <div class="flex gap-4 mt-2 flex-1 min-h-0" @click="openItem(slide)">

        <!-- Text column (left) -->
        <div class="flex-1 min-w-0 flex flex-col">
          <!-- Big Spectral title — outer wrapper reserves the full 2-line-clamp
               height (4.25rem = title's 1.7rem font-size * leading-tight's 1.25
               * 2 lines — must be rem, not em, since the wrapper's own font-size
               is the default 1rem, not the title's 1.7rem) so every card keeps
               the same fixed shape regardless of title length, and vertically
               centers its content so a 1-line title sits centered in that
               reserved space (half a line down from the top) instead of pinned
               to the top with all the blank space below it. The min-height/
               centering lives on the wrapper rather than the <p> itself so
               line-clamp-2's own display:-webkit-box (needed for 2-line
               truncation of genuinely long titles) isn't overridden by a
               conflicting display:flex on the same element. -->
          <div class="flex-shrink-0" style="min-height: 4.25rem; display: flex; align-items: center">
            <p class="leading-tight line-clamp-2" style="font-family: var(--nh-serif); font-size: 1.70rem; font-weight: 700; color: #f4eee2; letter-spacing: -0.01em; margin-top: 4px">{{ itemTitle(slide) }}</p>
          </div>
          <!-- Author -->
          <p class="text-xs mt-1 truncate flex-shrink-0" style="color: #9a9085">by {{ itemAuthor(slide) }}</p>

          <!-- Metadata pills — each pill is capped and truncated with an
               ellipsis so a long value (e.g. a metadata provider dumping a
               whole "Category:Subcategory:Sub-subcategory" chain into one
               genre string) can never wrap to a second line inside the pill
               itself and blow out the card's fixed-height layout. The row
               as a whole can still wrap onto a new line if needed — this
               only prevents a single pill's own text from wrapping. -->
          <div class="flex flex-wrap gap-1.5 mt-2 flex-shrink-0">
            <span v-if="itemDuration(slide)" class="text-xs px-2 py-0.5 rounded-full truncate max-w-[45%]" style="background: rgba(255,255,255,0.10); color: #9a9085; border: 1px solid rgba(255,255,255,0.18)">{{ itemDuration(slide) }}</span>
            <span v-if="itemNarrator(slide)" class="text-xs px-2 py-0.5 rounded-full truncate max-w-[45%]" style="background: rgba(255,255,255,0.10); color: #9a9085; border: 1px solid rgba(255,255,255,0.18)">Narrated by {{ itemNarrator(slide) }}</span>
            <span class="text-xs px-2 py-0.5 rounded-full truncate max-w-[45%]" style="background: rgba(255,255,255,0.10); color: #9a9085; border: 1px solid rgba(255,255,255,0.18)">{{ itemGenre(slide) }}</span>
          </div>

          <!-- Description — min-height reserves the full 3-line-clamp height
               (4.875em = leading-relaxed's 1.625 * 3 lines) for the same
               reason as the title above. Reserved even when there's no
               description at all, so Continue/the bar land in the same spot
               either way instead of the card losing its shape. -->
          <p class="text-xs mt-2 line-clamp-3 leading-relaxed flex-shrink-0" style="color: rgba(154,144,133,0.80); min-height: 4.875em">{{ itemDescription(slide) }}</p>

          <!-- Continue + progress bar, sharing one row. The row is widened via
               calc() by exactly (gap-4 + cover width) so its right edge lands
               precisely on the cover's right edge — the bar keeps its original
               width unchanged (100% of the row minus that same 144px, which
               algebraically reconstructs the original text-column width) and
               centers in the leftover space via two equal flex-grow spacers,
               with align-items:flex-end bottom-aligning it to Continue using
               real rendered heights, not estimated ones. margin-top is one
               description line-height (12px * 1.625) below the description. -->
          <div class="flex items-end flex-shrink-0" style="margin-top: 19.5px; width: calc(100% + 144px)">
            <!-- NH source: hasAudio/hasEbook conditional buttons (enhancements.js:2417-2422) —
                 an ebook-only continue-listening item gets a Read button instead of a Play/
                 Continue button that would try to play audio that doesn't exist. -->
            <button
              v-if="hasAudio(slide)"
              class="flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs flex-shrink-0"
              style="background: rgba(var(--nh-amber-rgb), 0.14); border: 1px solid rgba(var(--nh-amber-rgb), 0.50); color: var(--nh-amber); height: 38px; padding: 0 18px"
              @click.stop="continueItem(slide)"
            >
              <span class="material-symbols fill" style="font-size: 1.05rem">play_arrow</span>
              Continue
            </button>
            <button
              v-else-if="hasEbook(slide)"
              class="flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs flex-shrink-0"
              style="background: rgba(var(--nh-amber-rgb), 0.14); border: 1px solid rgba(var(--nh-amber-rgb), 0.50); color: var(--nh-amber); height: 38px; padding: 0 18px"
              @click.stop="readItem(slide)"
            >
              <span class="material-symbols fill" style="font-size: 1.05rem">auto_stories</span>
              Read
            </button>
            <div class="flex-1" />
            <div class="flex-shrink-0" style="width: calc(100% - 144px)">
              <div class="h-0.5 w-full rounded-full overflow-hidden mb-1" style="background: rgba(244,238,226,0.15)">
                <div class="h-full rounded-full transition-all duration-300" style="background: var(--nh-amber)" :style="{ width: itemProgress(slide) + '%' }" />
              </div>
              <p class="text-xs" style="color: rgba(154,144,133,0.9)">{{ itemProgressLabel(slide) }}</p>
            </div>
            <div class="flex-1" />
          </div>
        </div>

        <!-- Cover (right) — fixed width, natural height via aspect ratio.
             margin-top is a fixed constant now that title/description reserve
             fixed heights above (see those comments) — every slide's content
             stack is the same height regardless of actual text length, so
             the cover's position relative to the bar is fixed too: computed
             for the reserved stack (label+gap+title+author+pills+description
             +gap+Continue) so the cover's bottom lands 10px above the bar. -->
        <img
          :src="coverSrc(slide)"
          class="object-cover flex-shrink-0"
          style="width: 128px; height: 205px; border-radius: 14px; box-shadow: 0 14px 44px rgba(0,0,0,0.72); align-self: flex-start; margin-top: 7px"
          :alt="itemTitle(slide)"
          loading="lazy"
        />
      </div>

    </div>
  </div>

    <!-- Nav row: arrows + dots. NH source: enhancements.js lines 1410-1420 —
         a sibling of the slide track (#nh-hero-nav next to #nh-hero-viewport),
         not nested inside a slide, so it stays put while slides transform. -->
    <div v-if="slides.length > 1" class="relative z-20 flex items-center justify-center flex-shrink-0" style="gap: 18px; margin-top: 10px; margin-bottom: 24px">
      <button
        type="button"
        class="flex items-center justify-center rounded-full"
        style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); width: 40px; height: 40px"
        @click.stop="prev"
      >
        <span class="material-symbols" style="font-size: 1.5rem; color: #d8cfc2">chevron_left</span>
      </button>
      <div class="flex items-center" style="gap: 10px">
        <button
          v-for="(_, di) in slides"
          :key="`dot-${di}`"
          type="button"
          class="rounded-full transition-all duration-300"
          :style="{
            width: activeIndex === di ? '24px' : '8px',
            height: '8px',
            background: activeIndex === di ? 'var(--nh-amber)' : 'rgba(255,255,255,0.2)'
          }"
          @click.stop="goTo(di)"
        />
      </div>
      <button
        type="button"
        class="flex items-center justify-center rounded-full"
        style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); width: 40px; height: 40px"
        @click.stop="next"
      >
        <span class="material-symbols" style="font-size: 1.5rem; color: #d8cfc2">chevron_right</span>
      </button>
      <!-- NH source: #nh-hero-pause (enhancements.js:2748-2750, 2907-2926) — a
           manual pause persisted via localStorage so it survives leaving and
           returning to Home, not just a per-visit toggle. -->
      <button
        type="button"
        class="flex items-center justify-center rounded-full"
        style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); width: 40px; height: 40px"
        :aria-pressed="heroPaused ? 'true' : 'false'"
        :aria-label="heroPaused ? 'Play' : 'Pause'"
        :title="heroPaused ? 'Play' : 'Pause'"
        @click.stop="toggleHeroPause"
      >
        <span class="material-symbols" style="font-size: 1.35rem; color: #d8cfc2">{{ heroPaused ? 'play_arrow' : 'pause' }}</span>
      </button>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    slides: {
      type: Array,
      default: () => []
    },
    // NH source: enhancements.js carouselTiming setting — seconds between
    // auto-advance slides, 0 disables it entirely.
    advanceSeconds: {
      type: Number,
      default: 15
    }
  },
  data() {
    return {
      activeIndex: 0,
      // Drag state. Only isDragging/dragLocked/dragMoved live here — they
      // change once or twice per gesture, so reactivity on them is free.
      // dragStartX/dragOffset/etc. are deliberately NOT reactive (see
      // created()) since they're written on every touchmove event; making
      // them reactive data properties would trigger a full Vue re-render
      // per pixel of finger movement (they're read inside slideStyle(),
      // which is template-bound), which is what was causing the drag to
      // feel laggy instead of tracking the finger 1:1.
      isDragging: false,
      dragLocked: null, // 'horizontal' | 'vertical' | null
      dragMoved: false,
      // Set on release to the drag's last offset (as % of card width) so the
      // settle transition can be timed to the distance actually remaining,
      // instead of always using the full-traversal duration. Cleared after
      // the settle animation finishes.
      releaseOffsetPercent: null,
      releaseClearTimeout: null,
      // Auto-advance state
      firstTouchTime: 0,
      lastUserTouchTime: 0,
      lastAdvanceTime: 0,
      advanceInterval: null,
      // NH source: nh-hero-paused (enhancements.js:2896-2897, 2920-2925) — a
      // manual pause is a persisted PREFERENCE, not per-visit state (the
      // carousel rebuilds on every return to Home, so a component-local
      // variable alone would silently un-pause itself on navigation).
      heroPaused: false
    }
  },
  watch: {
    slides(newVal) {
      if (this.activeIndex >= newVal.length) this.activeIndex = 0
      this.restartTimer()
      this.publishActiveCover()
    },
    activeIndex() {
      this.publishActiveCover()
    }
  },
  created() {
    // Non-reactive drag-tracking state (see the comment in data() for why
    // this lives outside it). rafId coalesces onTouchMove's raw DOM writes
    // to the display's actual refresh rate instead of writing on every
    // touch event, some of which can fire faster than the screen repaints.
    this.dragStartX = null
    this.dragStartY = null
    this.dragOffset = 0
    this.lastTouchX = null
    this.lastTouchTime = null
    // Rolling ~80ms window of {x, t} samples used to compute flick velocity
    // on release. A single last-sample delta was noisy — a touchmove right
    // before touchend could land with a tiny dt (spurious high velocity) or
    // a tiny dx (spurious near-zero velocity) independent of the actual
    // flick speed, which is why a real flick would sometimes fail to
    // register and snap back instead of advancing.
    this.velocitySamples = []
    this.rafId = null
    this.dragMovedClearTimeout = null
  },
  methods: {
    publishActiveCover() {
      const slide = this.slides[this.activeIndex]
      if (!slide) return
      const url = this.coverSrc(slide)
      if (url) this.$store.commit('setNhHomeCoverUrl', url)
    },
    slideStyle(i) {
      const diff = i - this.activeIndex
      const px = this.isDragging ? this.dragOffset : 0

      let transition
      if (this.isDragging) {
        transition = 'none'
      } else if (this.releaseOffsetPercent !== null) {
        // Scale the settle duration to how far this slide's transform still
        // has to travel from where the drag left off, so a fast-but-short
        // flick (velocity-triggered, not distance-triggered) doesn't have to
        // cover most of the card's width in the same fixed duration a
        // full-traversal animation uses.
        const remainingFraction = Math.min(1, Math.abs(diff * 100 - this.releaseOffsetPercent) / 100)
        const duration = Math.max(0.12, remainingFraction * 0.35).toFixed(2)
        transition = `transform ${duration}s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.5s`
      } else {
        transition = 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.5s'
      }

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
      const raw = item.media?.metadata?.description || ''
      if (!raw) {
        // NH source: t.fallbackDesc ("Pick up right where you left off."), with
        // an ebook-only special case using t.pickup instead (enhancements.js:2274,
        // "Your books are waiting." — avoids "pick up... left off" reading oddly
        // for a book with no audio to physically pick back up).
        return this.isEbookOnly(item) ? 'Your books are waiting.' : 'Pick up right where you left off.'
      }
      // Some ABS descriptions contain literal HTML (e.g. stray <p> tags) that
      // used to show up as visible tag text with plain interpolation. Parsing
      // with DOMParser and reading textContent consumes the markup as
      // structure instead of literal characters, without ever inserting the
      // raw HTML into the live document — DOMParser's parsed document is
      // inert, so embedded scripts/event handlers never execute.
      const doc = new DOMParser().parseFromString(raw, 'text/html')
      return doc.body.textContent || ''
    },
    itemDuration(item) {
      const dur = item.media?.duration
      if (!dur) return ''
      const h = Math.floor(dur / 3600)
      const m = Math.floor((dur % 3600) / 60)
      return h > 0 ? `${h}h ${m}m` : `${m}m`
    },
    itemNarrator(item) {
      const narrators = item.media?.metadata?.narrators
      if (narrators?.length) return narrators[0]
      return item.media?.metadata?.narrator || ''
    },
    itemGenre(item) {
      const genres = item.media?.metadata?.genres
      if (genres?.length) {
        // Some metadata providers store a whole category hierarchy as one
        // genre string (e.g. "Science Fiction & Fantasy:Science Fiction:
        // Military") instead of separate genre entries — show just the
        // most specific (last) segment rather than the full chain.
        const segments = genres[0].split(':')
        return segments[segments.length - 1].trim()
      }
      return item.mediaType === 'podcast' ? 'Podcast' : 'Audiobook'
    },
    // NH source: hasAudio/hasEbook detection (enhancements.js:2242-2244), values
    // ported exactly — audio needs a real duration, not just "has tracks".
    hasAudio(item) {
      return Number(item.media?.duration) > 0
    },
    hasEbook(item) {
      return !!(item.media?.ebookFormat || item.media?.ebookFile?.ebookFormat)
    },
    isEbookOnly(item) {
      return !this.hasAudio(item) && this.hasEbook(item)
    },
    itemProgress(item) {
      const prog = this._getProgress(item)
      if (!prog) return 0
      // NH source: isEbookOnly reads ebookProgress instead of the audio progress
      // field (enhancements.js:2250).
      const raw = this.isEbookOnly(item) ? prog.ebookProgress : prog.progress
      return Math.round((raw || 0) * 100)
    },
    itemProgressLabel(item) {
      const prog = this._getProgress(item)
      if (!prog) return ''
      if (this.isEbookOnly(item)) {
        // No audio duration to compute a time-remaining label from for an
        // ebook-only item — percentage only (NH source: same gap, its
        // rightSideText stays a placeholder for ebook-only slides too).
        return `${Math.round((prog.ebookProgress || 0) * 100)}%`
      }
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
    // Ebook-only items have no audio to hand to the play-item event bus at
    // all — route to the item page instead, where the real Read button
    // already correctly loads a full libraryItem before opening the reader
    // (a shelf-entity slide here may be minified and missing what the reader
    // component needs).
    readItem(item) {
      this.$router.push(`/item/${item.id}`)
    },
    goTo(i) {
      this.activeIndex = i
      this.restartTimer()
    },
    toggleHeroPause() {
      this.heroPaused = !this.heroPaused
      try {
        localStorage.setItem('nh-hero-paused', this.heroPaused ? '1' : '0')
      } catch (e) {
        // localStorage unavailable — pause still works for this session
      }
    },
    next() {
      this.activeIndex = (this.activeIndex + 1) % this.slides.length
      this.restartTimer()
    },
    prev() {
      this.activeIndex = (this.activeIndex - 1 + this.slides.length) % this.slides.length
      this.restartTimer()
    },
    restartTimer() {
      // Manual navigation (arrows/dots — mouse clicks, not touch) doesn't
      // touch the touch-based idle tracking below, so without this a manual
      // click could be immediately followed by an unrelated auto-advance
      // tick landing right after it.
      this.lastAdvanceTime = Date.now()
      this.firstTouchTime = 0
      this.lastUserTouchTime = 0
    },
    checkAutoAdvance() {
      if (this.heroPaused) return
      if (!this.advanceSeconds || this.advanceSeconds <= 0) return
      if (this.slides.length <= 1 || this.isDragging) return
      const intervalMs = this.advanceSeconds * 1000
      const now = Date.now()
      if (this.firstTouchTime) {
        if (now - this.firstTouchTime < 30000) return
        if (now - this.lastUserTouchTime < intervalMs) return
      }
      if (now - this.lastAdvanceTime < intervalMs) return
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
      this.velocitySamples = [{ x: touch.clientX, t: Date.now() }]
      this.dragMoved = false
      clearTimeout(this.dragMovedClearTimeout)
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
        } else {
          return
        }
      }

      if (this.dragLocked === 'vertical') {
        // Vertical scroll — cancel drag and let browser handle it
        this.isDragging = false
        this.dragOffset = 0
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId)
          this.rafId = null
        }
        return
      }

      // Horizontal drag — prevent page scroll AND the ghost click Chrome
      // synthesizes after touchend when no touchmove in the gesture called
      // preventDefault. This must run on the SAME event that just decided
      // dragLocked (falling through from above, not an early return before
      // it) — a short, fast flick can produce only one or two touchmove
      // samples, and skipping preventDefault on the lock-deciding one meant
      // that kind of gesture could reach touchend having never called it at
      // all, letting the synthetic click through to open the book instead
      // of registering the swipe.
      e.preventDefault()

      const now = Date.now()
      this.velocitySamples.push({ x, t: now })
      while (this.velocitySamples.length > 1 && now - this.velocitySamples[0].t > 80) {
        this.velocitySamples.shift()
      }
      this.lastTouchX = x
      this.lastTouchTime = now
      this.dragOffset = dx
      if (Math.abs(dx) > 8) this.dragMoved = true

      // Coalesce raw touch samples (which can fire faster than the screen
      // repaints) into one DOM write per frame, and write it straight to
      // the element instead of through a reactive Vue property — see the
      // data()/created() comments for why going through Vue here caused
      // visible drag lag and a hitch right when the finger lifted.
      if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null
          this.applyDragTransform()
        })
      }
    },
    applyDragTransform() {
      if (!this.isDragging) return
      const els = this.$refs.slideEl
      if (!els) return
      const cardWidth = this.$el ? this.$el.offsetWidth : 300
      const px = this.dragOffset
      this.slides.forEach((_, i) => {
        const diff = i - this.activeIndex
        if (Math.abs(diff) > 1) return // stays hidden/untouched, per slideStyle()
        const el = els[i]
        if (!el) return
        el.style.transition = 'none'
        el.style.transform = `translateX(calc(${diff * 100}% + ${px}px))`
        el.style.opacity = diff !== 0 ? Math.min(1, Math.abs(px) / cardWidth * 1.5) : 1
      })
    },
    onTouchEnd(e) {
      if (!this.isDragging) return
      this.isDragging = false
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }

      // A fast/short flick can end without ever firing a touchmove (some
      // devices/WebViews batch or drop intermediate samples under ~100-150ms
      // of contact) — dragLocked staying null is how we know that happened.
      // Without this fallback, dragOffset would still be 0 here: the swipe
      // wouldn't just fail to register, it would leave the browser's
      // ghost-click free to fire (nothing ever called preventDefault, since
      // that only happens inside onTouchMove) and openItem() would wrongly
      // treat the flick as a tap and navigate into the book. changedTouches
      // still has the lift-off position even though the touch point is
      // gone from `touches`, so we can reconstruct start-to-end displacement
      // and direction from touchstart/touchend alone.
      if (this.dragLocked === null && e?.changedTouches?.length && this.dragStartX !== null) {
        const touch = e.changedTouches[0]
        const dx = touch.clientX - this.dragStartX
        const dy = touch.clientY - this.dragStartY
        if (Math.abs(dx) > 6 && Math.abs(dx) >= Math.abs(dy)) {
          e.preventDefault()
          this.dragOffset = dx
          this.dragMoved = true
          this.velocitySamples.push({ x: touch.clientX, t: Date.now() })
        }
      }

      const offset = this.dragOffset
      let velocity = 0
      if (this.velocitySamples.length >= 2) {
        const first = this.velocitySamples[0]
        const last = this.velocitySamples[this.velocitySamples.length - 1]
        const dt = last.t - first.t
        if (dt > 0) velocity = (last.x - first.x) / dt
      }
      this.velocitySamples = []

      const cardWidth = this.$el ? this.$el.offsetWidth : 300
      const threshold = cardWidth * 0.30

      this.releaseOffsetPercent = (offset / cardWidth) * 100
      clearTimeout(this.releaseClearTimeout)
      this.releaseClearTimeout = setTimeout(() => {
        this.releaseOffsetPercent = null
      }, 400)

      if (offset < -threshold || velocity < -0.4) {
        this.next()
      } else if (offset > threshold || velocity > 0.4) {
        this.prev()
      }

      this.dragOffset = 0
      this.dragStartX = null
      this.dragStartY = null
      this.dragLocked = null

      // Deliberately a short delay, not $nextTick: some WebView versions
      // still fire a delayed synthetic "click" after a real drag despite
      // preventDefault having been called during the gesture. $nextTick
      // resolves in under a frame, so it would clear dragMoved well before
      // that ghost click lands, letting openItem() wrongly treat the drag
      // as a tap and navigate into the book. 350ms comfortably outlasts the
      // ~300ms delayed-click quirk.
      clearTimeout(this.dragMovedClearTimeout)
      this.dragMovedClearTimeout = setTimeout(() => {
        this.dragMoved = false
      }, 350)
    }
  },
  mounted() {
    try {
      this.heroPaused = localStorage.getItem('nh-hero-paused') === '1'
    } catch (e) {
      // localStorage unavailable — default to not paused
    }
    this.lastAdvanceTime = Date.now()
    this.advanceInterval = setInterval(this.checkAutoAdvance, 1000)
    this.publishActiveCover()
  },
  beforeDestroy() {
    clearInterval(this.advanceInterval)
    clearTimeout(this.releaseClearTimeout)
    clearTimeout(this.dragMovedClearTimeout)
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
  }
}
</script>
