import { registerPlugin, WebPlugin } from '@capacitor/core'

// The home-screen icons the app can switch between (Android only). `id` must match the ids in
// LauncherIcons (AbsLauncherIcon.kt); `label` is a key in strings/en-us.json. Adding one here and in
// the Kotlin list is all the settings page needs.
export const LAUNCHER_ICONS = [
  { id: 'default', label: 'LabelAppIconDefault' },
  { id: 'nanohive', label: 'LabelAppIconNanoHive' },
  { id: 'dark', label: 'LabelAppIconDark' },
  { id: 'gold', label: 'LabelAppIconGold' },
  { id: 'midnight', label: 'LabelAppIconMidnight' }
]

class AbsLauncherIconWeb extends WebPlugin {
  constructor() {
    super()
  }

  async getIcon() {
    return { id: 'default' }
  }

  async setIcon({ id }) {
    return { id }
  }
}

const AbsLauncherIcon = registerPlugin('AbsLauncherIcon', {
  web: () => new AbsLauncherIconWeb()
})

export { AbsLauncherIcon }
