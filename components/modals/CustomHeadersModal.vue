<template>
  <modals-modal v-model="show" :width="'90%'" :max-width="'420px'" height="100%">
    <template #outer>
      <div class="absolute top-5 left-4 z-40">
        <p class="text-white text-2xl truncate">Custom Headers</p>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div ref="container" class="w-full rounded-lg bg-primary border border-white border-opacity-20 overflow-y-auto overflow-x-hidden" style="max-height: 80vh" @click.stop>
        <div class="w-full h-full p-4" v-if="showAddHeader">
          <div class="mb-4">
            <ui-icon-btn icon="arrow_back" borderless @click="showAddHeader = false" />
          </div>
          <form @submit.prevent="submitForm">
            <ui-text-input-with-label v-model="newHeaderKey" label="Name" class="mb-2" />
            <ui-text-input-with-label v-model="newHeaderValue" label="Value" class="mb-4" />
            <p v-if="formError" class="text-sm text-error mb-4">{{ formError }}</p>

            <ui-btn type="submit" class="w-full">Submit</ui-btn>
          </form>
        </div>
        <div class="w-full h-full p-4" v-else>
          <template v-for="[key, value] in Object.entries(headersCopy)">
            <div :key="key" class="w-full rounded-lg bg-white bg-opacity-5 py-2 pl-4 pr-12 relative mb-2">
              <p class="text-base font-semibold text-gray-200 leading-5">{{ key }}</p>
              <p class="text-sm text-gray-400 truncate">{{ revealed[key] ? value : maskValue(value) }}</p>

              <div class="absolute top-0 bottom-0 right-0 h-full p-4 flex items-center justify-center space-x-3">
                <button @click="$set(revealed, key, !revealed[key])"><span class="material-symbols text-lg text-gray-300">{{ revealed[key] ? 'visibility_off' : 'visibility' }}</span></button>
                <button class="text-error" @click="removeHeader(key)"><span class="material-symbols text-lg">delete</span></button>
              </div>
            </div>
          </template>
          <p v-if="!Object.keys(headersCopy).length" class="py-4 text-center">No Custom Headers</p>

          <div class="w-full flex justify-center pt-4">
            <ui-btn @click="showAddHeader = true" class="w-full">Add Custom Header</ui-btn>
          </div>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    customHeaders: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      newHeaderKey: '',
      newHeaderValue: '',
      headersCopy: {},
      revealed: {},
      formError: '',
      showAddHeader: false
    }
  },
  watch: {
    show(val) {
      if (val) this.init()
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
    }
  },
  methods: {
    removeHeader(key) {
      this.$delete(this.headersCopy, key)
      this.$emit('update:customHeaders', { ...this.headersCopy })
    },
    // Header values can be secrets (CF-Access-Client-Secret), so they're shown only on request
    maskValue(value) {
      return '•'.repeat(Math.min(String(value).length, 12))
    },
    submitForm() {
      // A stray space or non-ASCII character here makes every native request fail, so catch it now
      const name = this.newHeaderKey.trim()
      const value = this.newHeaderValue.trim()
      if (!name) {
        this.formError = 'Enter a header name'
        return
      }
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
        this.formError = 'The name can only contain letters, numbers and - _ . ! # $ % & * + ^ | ~'
        return
      }
      if (!/^[\t\x20-\x7e]*$/.test(value)) {
        this.formError = 'The value can only contain plain ASCII characters'
        return
      }
      // Header names are case-insensitive: adding "x-foo" replaces an existing "X-Foo"
      for (const existing of Object.keys(this.headersCopy)) {
        if (existing.toLowerCase() === name.toLowerCase()) this.$delete(this.headersCopy, existing)
      }
      this.$set(this.headersCopy, name, value)
      this.formError = ''
      this.newHeaderKey = ''
      this.newHeaderValue = ''
      this.showAddHeader = false
      this.$emit('update:customHeaders', { ...this.headersCopy })
    },
    init() {
      this.newHeaderKey = ''
      this.newHeaderValue = ''
      this.formError = ''
      this.revealed = {}
      this.headersCopy = this.customHeaders ? { ...this.customHeaders } : {}
    }
  },
  mounted() {}
}
</script>
