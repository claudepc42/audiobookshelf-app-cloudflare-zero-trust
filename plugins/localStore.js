import { Preferences } from '@capacitor/preferences'

class LocalStorage {
  constructor(vuexStore) {
    this.vuexStore = vuexStore
  }

  async setUserSettings(settings) {
    try {
      await Preferences.set({ key: 'userSettings', value: JSON.stringify(settings) })
    } catch (error) {
      console.error('[LocalStorage] Failed to update user settings', error)
    }
  }

  async getUserSettings() {
    try {
      const settingsObj = await Preferences.get({ key: 'userSettings' }) || {}
      return settingsObj.value ? JSON.parse(settingsObj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get user settings', error)
      return null
    }
  }

  async setServerSettings(settings) {
    try {
      await Preferences.set({ key: 'serverSettings', value: JSON.stringify(settings) })
      console.log('Saved server settings', JSON.stringify(settings))
    } catch (error) {
      console.error('[LocalStorage] Failed to update server settings', error)
    }
  }

  async getServerSettings() {
    try {
      var settingsObj = await Preferences.get({ key: 'serverSettings' }) || {}
      return settingsObj.value ? JSON.parse(settingsObj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get server settings', error)
      return null
    }
  }

  async setPlayerSettings(playerSettings) {
    try {
      await Preferences.set({ key: 'playerSettings', value: JSON.stringify(playerSettings) })
    } catch (error) {
      console.error('[LocalStorage] Failed to set player settings', error)
    }
  }

  async getPlayerSettings() {
    try {
      const playerSettingsObj = await Preferences.get({ key: 'playerSettings' }) || {}
      return playerSettingsObj.value ? JSON.parse(playerSettingsObj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get player settings', error)
      return false
    }
  }

  async setBookshelfListView(useIt) {
    try {
      await Preferences.set({ key: 'bookshelfListView', value: useIt ? '1' : '0' })
    } catch (error) {
      console.error('[LocalStorage] Failed to set bookshelf list view', error)
    }
  }

  async getBookshelfListView() {
    try {
      var obj = await Preferences.get({ key: 'bookshelfListView' }) || {}
      return obj.value === '1'
    } catch (error) {
      console.error('[LocalStorage] Failed to get bookshelf list view', error)
      return false
    }
  }

  async setLastLibraryId(libraryId) {
    try {
      await Preferences.set({ key: 'lastLibraryId', value: libraryId })
      console.log('[LocalStorage] Set Last Library Id', libraryId)
    } catch (error) {
      console.error('[LocalStorage] Failed to set last library id', error)
    }
  }

  async removeLastLibraryId() {
    try {
      await Preferences.remove({ key: 'lastLibraryId' })
      console.log('[LocalStorage] Remove Last Library Id')
    } catch (error) {
      console.error('[LocalStorage] Failed to remove last library id', error)
    }
  }

  async getLastLibraryId() {
    try {
      var obj = await Preferences.get({ key: 'lastLibraryId' }) || {}
      return obj.value || null
    } catch (error) {
      console.error('[LocalStorage] Failed to get last library id', error)
      return false
    }
  }

  async setTheme(theme) {
    try {
      await Preferences.set({ key: 'theme', value: theme })
      console.log('[LocalStorage] Set theme', theme)
    } catch (error) {
      console.error('[LocalStorage] Failed to set theme', error)
    }
  }

  async getTheme() {
    try {
      var obj = await Preferences.get({ key: 'theme' }) || {}
      return obj.value || null
    } catch (error) {
      console.error('[LocalStorage] Failed to get theme', error)
      return false
    }
  }

  // Records the app version the NanoHive compatibility warning was last shown for,
  // so it only asks once per install and again after an update (new version string).
  async setNhCompatWarnedVersion(version) {
    try {
      await Preferences.set({ key: 'nh-compat-warned-version', value: version })
    } catch (error) {
      console.error('[LocalStorage] Failed to set nh-compat-warned-version', error)
    }
  }

  async getNhCompatWarnedVersion() {
    try {
      var obj = (await Preferences.get({ key: 'nh-compat-warned-version' })) || {}
      return obj.value || null
    } catch (error) {
      console.error('[LocalStorage] Failed to get nh-compat-warned-version', error)
      return null
    }
  }

  // One-shot marker so the Glass Effect Tuner's default apply (plugins/init.client.js)
  // only ever runs once. Never reset.
  async setHasAppliedGlassEffectDefaults() {
    try {
      await Preferences.set({ key: 'nh-glass-defaults-applied', value: 'true' })
    } catch (error) {
      console.error('[LocalStorage] Failed to set nh-glass-defaults-applied', error)
    }
  }

  async getHasAppliedGlassEffectDefaults() {
    try {
      var obj = (await Preferences.get({ key: 'nh-glass-defaults-applied' })) || {}
      return obj.value === 'true'
    } catch (error) {
      console.error('[LocalStorage] Failed to get nh-glass-defaults-applied', error)
      return false
    }
  }

  // Last-known personalized home shelves (Continue Series, Recently Added, etc.
  // from GET /api/libraries/:id/personalized) per library, so the home page can
  // show the previous result immediately instead of the shelf just being absent
  // while the fresh request is in flight — same reasoning as why "Rate What You
  // Finished" already feels instant (its data is already in memory from login).
  // Purely a display cache; pages/bookshelf/index.vue's fetchCategories() always
  // still fetches fresh data and overwrites this once it arrives.
  // Greptile-found bug: this used to be keyed only by libraryId, so a second
  // account with access to the same library (same server) would hydrate the
  // first account's cached shelves before its own fresh fetch landed — a
  // real cross-account data leak if that fetch then failed. Scoping by
  // server + user id means a different account (or server) always misses
  // the cache entirely instead of ever seeing someone else's data.
  _personalizedShelvesCacheKey(libraryId) {
    const serverId = this.vuexStore.state.user?.serverConnectionConfig?.id
    const userId = this.vuexStore.state.user?.user?.id
    if (!serverId || !userId) return null
    return `personalized-shelves-${serverId}-${userId}-${libraryId}`
  }

  async getPersonalizedShelvesCache(libraryId) {
    if (!libraryId) return null
    const key = this._personalizedShelvesCacheKey(libraryId)
    if (!key) return null
    try {
      var obj = (await Preferences.get({ key })) || {}
      return obj.value ? JSON.parse(obj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get personalized-shelves cache', error)
      return null
    }
  }

  async setPersonalizedShelvesCache(libraryId, categories) {
    if (!libraryId) return
    const key = this._personalizedShelvesCacheKey(libraryId)
    if (!key) return
    try {
      await Preferences.set({ key, value: JSON.stringify(categories) })
    } catch (error) {
      console.error('[LocalStorage] Failed to set personalized-shelves cache', error)
    }
  }

  // Last-known NH Recent Series shelf data per library, so the shelf can show
  // immediately on mount instead of being absent while the fresh fetch is in
  // flight (or absent permanently if the fetch fails). Same pattern and same
  // scoping rationale as personalized-shelves above: keyed by server+user+lib
  // so a second account on the same server never sees the first account's data.
  _nhRecentSeriesCacheKey(libraryId) {
    const serverId = this.vuexStore.state.user?.serverConnectionConfig?.id
    const userId = this.vuexStore.state.user?.user?.id
    if (!serverId || !userId) return null
    return `nh-recent-series-${serverId}-${userId}-${libraryId}`
  }

  async getNhRecentSeriesCache(libraryId) {
    if (!libraryId) return null
    const key = this._nhRecentSeriesCacheKey(libraryId)
    if (!key) return null
    try {
      var obj = (await Preferences.get({ key })) || {}
      return obj.value ? JSON.parse(obj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get nh-recent-series cache', error)
      return null
    }
  }

  async setNhRecentSeriesCache(libraryId, series) {
    if (!libraryId) return
    const key = this._nhRecentSeriesCacheKey(libraryId)
    if (!key) return
    try {
      await Preferences.set({ key, value: JSON.stringify(series) })
    } catch (error) {
      console.error('[LocalStorage] Failed to set nh-recent-series cache', error)
    }
  }

  async setLanguage(lang) {
    try {
      await Preferences.set({ key: 'lang', value: lang })
      console.log('[LocalStorage] Set lang', lang)
    } catch (error) {
      console.error('[LocalStorage] Failed to set lang', error)
    }
  }

  async getLanguage() {
    try {
      var obj = await Preferences.get({ key: 'lang' }) || {}
      return obj.value || null
    } catch (error) {
      console.error('[LocalStorage] Failed to get lang', error)
      return false
    }
  }

  /**
   * Get preference value by key
   * 
   * @param {string} key 
   * @returns {Promise<string>}
   */
  // NH source: nh-settings:<uid> localStorage namespacing (nh-early.js) — on a
  // shared browser, NH found its theme/settings leaking from whoever saved them
  // last to the next person who opens the app. This app has the same exposure:
  // "Switch Server/User" (account.vue's logout) signs a different ABS user in
  // on the same device without ever touching the nhSettings Preferences key, so
  // without this, User B would see User A's theme/accent/font picks immediately.
  // Unlike NH (whose early-boot shim has to parse a JWT before Vuex exists),
  // this plugin already holds the real Vuex store, so it can just read the
  // actual logged-in user id directly — no token-parsing workaround needed.
  nhSettingsKey() {
    const userId = this.vuexStore?.state?.user?.user?.id
    return userId ? `nhSettings:${userId}` : 'nhSettings'
  }

  async setNhSettings(settings) {
    try {
      await Preferences.set({ key: this.nhSettingsKey(), value: JSON.stringify(settings) })
    } catch (error) {
      console.error('[LocalStorage] Failed to set NH settings', error)
    }
  }

  async getNhSettings() {
    try {
      const key = this.nhSettingsKey()
      const obj = (await Preferences.get({ key })) || {}
      if (obj.value) return JSON.parse(obj.value)
      // Migration: a per-user key with nothing saved yet falls back to the
      // old shared key once, so an existing single-user install doesn't see
      // its settings silently reset the first time this ships.
      if (key !== 'nhSettings') {
        const legacy = (await Preferences.get({ key: 'nhSettings' })) || {}
        if (legacy.value) return JSON.parse(legacy.value)
      }
      return null
    } catch (error) {
      console.error('[LocalStorage] Failed to get NH settings', error)
      return null
    }
  }

  // Last-known logged-in user object (includes mediaProgress) per server, so
  // app boot can hydrate the store with a real user/progress snapshot before
  // the live /api/authorize round-trip resolves (or at all, if offline) —
  // instead of the bookshelf rendering a blank "not connected" state until
  // that request finishes. Scoped per server only (not per user): this is a
  // single-slot "whoever is currently signed into this server on this
  // device" cache, overwritten on every real login — same lifetime as the
  // device's own saved server connection config, which is also single-slot
  // per server. A stale previous account's cache is only ever visible for
  // the few hundred ms before setUser's mediaProgress merge or a fresh
  // attemptConnection replaces it; a genuine account switch always goes
  // through a real (networked) login first, which immediately overwrites it.
  async setCachedUser(serverId, user) {
    if (!serverId || !user) return
    try {
      await Preferences.set({ key: `cached-user-${serverId}`, value: JSON.stringify(user) })
    } catch (error) {
      console.error('[LocalStorage] Failed to set cached user', error)
    }
  }

  async getCachedUser(serverId) {
    if (!serverId) return null
    try {
      const obj = (await Preferences.get({ key: `cached-user-${serverId}` })) || {}
      return obj.value ? JSON.parse(obj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get cached user', error)
      return null
    }
  }

  // Last-known libraries list, so boot hydration (above) has something to set
  // currentLibraryId against before /api/libraries has actually responded.
  // Scoped by server+user like the other per-account caches above, since
  // librariesAccessible differs per user.
  _cachedLibrariesKey(serverId, userId) {
    if (!serverId || !userId) return null
    return `cached-libraries-${serverId}-${userId}`
  }

  async setCachedLibraries(serverId, userId, libraries) {
    const key = this._cachedLibrariesKey(serverId, userId)
    if (!key) return
    try {
      await Preferences.set({ key, value: JSON.stringify(libraries) })
    } catch (error) {
      console.error('[LocalStorage] Failed to set cached libraries', error)
    }
  }

  async getCachedLibraries(serverId, userId) {
    const key = this._cachedLibrariesKey(serverId, userId)
    if (!key) return null
    try {
      const obj = (await Preferences.get({ key })) || {}
      return obj.value ? JSON.parse(obj.value) : null
    } catch (error) {
      console.error('[LocalStorage] Failed to get cached libraries', error)
      return null
    }
  }

  async getPreferenceByKey(key) {
    try {
      const obj = await Preferences.get({ key }) || {}
      return obj.value || null
    } catch (error) {
      console.error(`[LocalStorage] Failed to get preference "${key}"`, error)
      return null
    }
  }
}


export default ({ app, store }, inject) => {
  inject('localStore', new LocalStorage(store))
}
