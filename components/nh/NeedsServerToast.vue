<template>
  <div class="flex items-center gap-3">
    <p class="flex-1 text-sm">{{ $strings.MessageNhNeedsServer }}</p>
    <button type="button" class="px-3 py-1 rounded text-sm font-semibold bg-black bg-opacity-30" @click="$emit('open')">{{ $strings.ButtonNhServerSettings }}</button>
  </div>
</template>

<script>
// Body of the toast shown by $nhNeedsServer (plugins/nhNeedsServer.js)
export default {}
</script>
