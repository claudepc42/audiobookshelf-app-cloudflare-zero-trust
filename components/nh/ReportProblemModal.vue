<template>
  <div id="nh-rp-modal" @keydown.esc="close" @click.self="close">
    <div class="nh-rt-modal-bg" @click="close"></div>
    <div class="nh-rt-modal-box">
      <div class="nh-rt-modal-head">
        <span>{{ strings.title }}</span>
        <button type="button" class="nh-rt-modal-x" @click="close">×</button>
      </div>
      <p class="nh-rp-book">{{ title }}</p>
      <p class="nh-rp-lbl">{{ strings.what }}</p>
      <div class="nh-rp-reasons" role="radiogroup" :aria-label="strings.what">
        <label v-for="reason in reasons" :key="reason" class="nh-rp-reason" :for="`nh-rp-r-${reason}`">
          <input :id="`nh-rp-r-${reason}`" v-model="chosen" type="radio" name="nh-rp-reason" :value="reason" />
          <span>{{ strings[reason] }}</span>
        </label>
      </div>
      <textarea id="nh-rp-note" v-model="note" maxlength="600" :placeholder="strings.note"></textarea>
      <div class="nh-rt-actions">
        <button type="button" class="nh-rt-btn" :disabled="sending" @click="send">{{ strings.send }}</button>
        <span class="nh-rt-status">{{ status }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { NH_REPORT_REASONS, nhReportStrings } from '@/store/index'

export default {
  props: {
    itemId: { type: String, required: true },
    title: { type: String, default: '' }
  },
  data() {
    return {
      reasons: NH_REPORT_REASONS,
      chosen: NH_REPORT_REASONS[0],
      note: '',
      sending: false,
      status: ''
    }
  },
  computed: {
    strings() {
      return nhReportStrings(this.$languageCodes?.current)
    }
  },
  methods: {
    close() {
      this.$emit('close')
    },
    async send() {
      this.sending = true
      this.status = '…'
      try {
        await this.$nativeHttp.post('/_nh/api/reports', { itemId: this.itemId, title: this.title, reason: this.chosen, note: this.note })
        this.status = this.strings.sent
        setTimeout(() => this.close(), 1100)
      } catch (e) {
        this.sending = false
        this.status = this.strings.fail
      }
    }
  }
}
</script>
