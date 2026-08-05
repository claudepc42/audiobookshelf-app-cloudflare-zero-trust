<template>
  <modals-modal v-model="show" :width="400">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-2/3 overflow-hidden">
        <p class="text-white text-lg truncate">{{ $strings.HeaderTidyAuthors }}</p>
      </div>
    </template>
    <div class="p-4 w-full text-fg rounded-lg bg-bg box-shadow-md max-h-[75vh] overflow-y-auto">
      <div v-if="loading" class="w-full py-8 flex justify-center">
        <ui-loading-indicator />
      </div>
      <template v-else>
        <p v-if="!authorlessAuthors.length" class="text-sm text-fg-muted py-4 text-center">{{ $strings.MessageNoAuthorlessAuthors }}</p>
        <template v-else>
          <!-- NH source: nhAuthorTidy() (enhancements.js:6812-6873) — "this deletes
               records in ABS, so it must never be one careless click." Lists every
               authorless author with no per-row action, then ONE bulk button below
               removes all of them together — the list itself is the confirmation
               step, replacing what used to be an instant per-row delete here. -->
          <div v-for="author in authorlessAuthors" :key="author.id" class="py-2 border-b border-white border-opacity-5">
            <p class="text-sm truncate">{{ author.name }}</p>
          </div>
          <div class="flex items-center pt-4">
            <ui-btn small color="error" :loading="removing" :disabled="removing" @click="removeAll">{{ $strings.ButtonRemove }} ({{ authorlessAuthors.length }})</ui-btn>
            <p v-if="removeStatus" class="text-xs text-fg-muted ml-3">{{ removeStatus }}</p>
          </div>
        </template>
      </template>
    </div>
  </modals-modal>
</template>

<script>
// Ported from NH source: enhancements.js "Tidy authors" admin tool
// (enhancements.js:6812-6873). Confirmed portable — the actual delete call
// is ABS's own native `DELETE /api/authors/:id`, no NH-proxy dependency.
// NH forces a full page reload after removing (its own comment: the only way
// it can be sure to catch up its DOM-scraped author list) — not needed here,
// we just update local state directly, a real platform-enabled improvement
// over the source (see NANOHIVE_STATUS.md).
export default {
  props: {
    value: Boolean
  },
  data() {
    return {
      loading: false,
      authors: [],
      removing: false,
      removeStatus: ''
    }
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    },
    authorlessAuthors() {
      return this.authors.filter((au) => !au.numBooks)
    }
  },
  methods: {
    async init() {
      if (!this.currentLibraryId) return
      this.loading = true
      this.removeStatus = ''
      this.authors = await this.$nativeHttp
        .get(`/api/libraries/${this.currentLibraryId}/authors`)
        .then((response) => response.authors || [])
        .catch((error) => {
          console.error('Failed to load authors', error)
          return []
        })
      this.loading = false
    },
    async removeAll() {
      const targets = this.authorlessAuthors
      if (!targets.length || this.removing) return
      this.removing = true
      this.removeStatus = this.$strings.LabelRemovingEllipsis
      const removedIds = new Set()
      await Promise.all(
        targets.map((author) =>
          this.$nativeHttp
            .delete(`/api/authors/${author.id}`)
            .then(() => {
              removedIds.add(author.id)
            })
            .catch((error) => {
              console.error('Failed to remove author', error)
            })
        )
      )
      this.removing = false
      this.removeStatus = this.$getString('LabelRemovedCount', [removedIds.size, targets.length])
      // Only drop the ones that actually succeeded — anything that failed
      // stays visible so it isn't silently lost from the list.
      this.authors = this.authors.filter((au) => !removedIds.has(au.id))
      if (removedIds.size < targets.length) {
        this.$toast.error(this.$strings.ToastFailedToUpdate)
      }
    }
  },
  watch: {
    value(newVal) {
      if (newVal) this.init()
    }
  }
}
</script>
