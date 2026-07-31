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
        <div v-for="author in authorlessAuthors" :key="author.id" class="flex items-center py-2 border-b border-white border-opacity-5">
          <p class="text-sm truncate flex-grow mr-3">{{ author.name }}</p>
          <ui-btn small color="error" :loading="removingId === author.id" @click="removeAuthor(author)">{{ $strings.ButtonRemove }}</ui-btn>
        </div>
      </template>
    </div>
  </modals-modal>
</template>

<script>
// Ported from NH source: enhancements.js "Tidy authors" admin tool
// (enhancements.js:6812-6861). Confirmed portable — the actual delete call
// is ABS's own native `DELETE /api/authors/:id`, no NH-proxy dependency.
export default {
  props: {
    value: Boolean
  },
  data() {
    return {
      loading: false,
      authors: [],
      removingId: null
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
      this.authors = await this.$nativeHttp
        .get(`/api/libraries/${this.currentLibraryId}/authors`)
        .then((response) => response.authors || [])
        .catch((error) => {
          console.error('Failed to load authors', error)
          return []
        })
      this.loading = false
    },
    async removeAuthor(author) {
      this.removingId = author.id
      const success = await this.$nativeHttp
        .delete(`/api/authors/${author.id}`)
        .then(() => true)
        .catch((error) => {
          console.error('Failed to remove author', error)
          this.$toast.error(this.$strings.ToastFailedToUpdate)
          return false
        })
      this.removingId = null
      if (success) {
        this.authors = this.authors.filter((au) => au.id !== author.id)
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
