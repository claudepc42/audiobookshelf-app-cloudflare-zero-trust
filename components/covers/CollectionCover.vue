<template>
  <div class="relative rounded-sm overflow-hidden" :style="{ width: width + 'px', height: height + 'px' }">
    <div v-if="books.length" class="flex justify-center h-full relative bg-primary bg-opacity-95 rounded-sm">
      <div class="absolute top-0 left-0 w-full h-full bg-gray-400 bg-opacity-5" />

      <covers-book-cover :library-item="books[0]" :width="width / 2" :book-cover-aspect-ratio="bookCoverAspectRatio" />
      <covers-book-cover v-if="books.length > 1" :library-item="books[1]" :width="width / 2" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>
    <div v-else class="relative w-full h-full flex items-center justify-center p-2 bg-primary rounded-sm">
      <div class="absolute top-0 left-0 w-full h-full bg-gray-400 bg-opacity-5" />

      <p class="text-fg-muted text-center" :style="{ fontSize: Math.min(1, sizeMultiplier) + 'rem' }">Empty Collection</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    bookItems: {
      type: Array,
      default: () => []
    },
    width: Number,
    height: Number,
    bookCoverAspectRatio: Number
  },
  computed: {
    sizeMultiplier() {
      if (this.bookCoverAspectRatio === 1) return this.width / (120 * 1.6 * 2)
      return this.width / 240
    },
    books() {
      return this.bookItems || []
    }
  },
  mounted() {}
}
</script>