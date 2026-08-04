import { registerPlugin, WebPlugin } from '@capacitor/core'

class AbsWidgetUpdaterWeb extends WebPlugin {
  constructor() {
    super()
  }

  async refresh() {}
}

const AbsWidgetUpdater = registerPlugin('AbsWidgetUpdater', {
  web: () => new AbsWidgetUpdaterWeb()
})

export { AbsWidgetUpdater }
