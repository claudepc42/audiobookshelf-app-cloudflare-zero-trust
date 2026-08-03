<template>
  <div :style="{ width: width + 'px', height: height + 'px' }" class="bg-primary box-shadow-book rounded-md relative overflow-hidden flex flex-col items-center justify-center">
    <span class="material-symbols text-4xl text-gray-300 mb-2">mic</span>
    <p class="text-center font-semibold truncate px-2 w-full text-white" :style="{ fontSize: sizeMultiplier * 0.75 + 'rem' }">{{ name }}</p>
    <p class="text-center text-gray-300" :style="{ fontSize: sizeMultiplier * 0.65 + 'rem' }">{{ numBooks }} {{ $strings.LabelBooks }}</p>
  </div>
</template>

<script>
// NH source: enhancements.js Narrator card pages (grid + counts). Confirmed
// portable — data comes from ABS's own /api/libraries/:id/narrators, no
// NH-proxy dependency. See NANOHIVE_2.0_UPDATE_PLAN.md section 2.
export default {
  props: {
    narrator: {
      type: Object,
      default: () => {}
    },
    width: Number,
    height: Number,
    sizeMultiplier: {
      type: Number,
      default: 1
    }
  },
  computed: {
    name() {
      return this.narrator?.name || ''
    },
    numBooks() {
      return this.narrator?.numBooks || 0
    }
  }
}
</script>
