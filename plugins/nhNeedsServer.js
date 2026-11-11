import Vue from 'vue'
import NeedsServerToast from '@/components/nh/NeedsServerToast.vue'

// Servers already told about during this session; the message is shown once per server
const told = new Set()

// $nhNeedsServer(): a NanoHive feature was used on a server with no NanoHive backend. Says so, with a
// button to the setting that hides these features.
export default ({ app, store }, inject) => {
  inject('nhNeedsServer', () => {
    const key = store.getters['user/getServerAddress'] || ''
    if (told.has(key)) return
    told.add(key)
    Vue.prototype.$toast(
      {
        component: NeedsServerToast,
        listeners: { open: () => app.router.push('/settings-nanohive?section=server') }
      },
      { timeout: 8000, closeOnClick: false }
    )
  })
}
