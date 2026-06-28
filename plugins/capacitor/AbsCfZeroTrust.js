import { registerPlugin, WebPlugin } from '@capacitor/core'

class AbsCfZeroTrustWeb extends WebPlugin {
  constructor() {
    super()
  }

  async openCfWebView({ serverAddress }) {
    throw new Error('CF Zero Trust WebView is not supported on web')
  }
}

export const AbsCfZeroTrust = registerPlugin('AbsCfZeroTrust', {
  web: () => new AbsCfZeroTrustWeb()
})
