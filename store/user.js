import { Browser } from '@capacitor/browser'
import { AbsLogger } from '@/plugins/capacitor'
import { CapacitorHttp } from '@capacitor/core'

export const state = () => ({
  user: null,
  accessToken: null,
  serverConnectionConfig: null,
  // True when user/serverConnectionConfig were populated from the boot-time
  // local cache (plugins/init.client.js) rather than a real, confirmed login
  // — lets layouts/default.vue tell "optimistic guess, still needs a live
  // attemptConnection()" apart from "already actually connected this
  // session." Cleared the moment a real login (attemptConnection or
  // ServerConnectForm) commits a fresh setUser.
  isHydratedFromCache: false,
  settings: {
    mobileOrderBy: 'addedAt',
    mobileOrderDesc: true,
    mobileFilterBy: 'all',
    playbackRate: 1,
    collapseSeries: false,
    collapseBookSeries: false
  }
})

export const getters = {
  getIsRoot: (state) => state.user && state.user.type === 'root',
  getIsAdminOrUp: (state) => state.user && (state.user.type === 'admin' || state.user.type === 'root'),
  getToken: (state) => {
    return state.accessToken || null
  },
  getServerConnectionConfigId: (state) => {
    return state.serverConnectionConfig?.id || null
  },
  getServerAddress: (state) => {
    return state.serverConnectionConfig?.address || null
  },
  getServerConfigName: (state) => {
    return state.serverConnectionConfig?.name || null
  },
  getUserMediaProgress:
    (state) =>
    (libraryItemId, episodeId = null) => {
      if (!state.user?.mediaProgress) return null
      return state.user.mediaProgress.find((li) => {
        if (episodeId && li.episodeId !== episodeId) return false
        return li.libraryItemId == libraryItemId
      })
    },
  getUserBookmarksForItem: (state) => (libraryItemId) => {
    if (!state?.user?.bookmarks) return []
    return state.user.bookmarks.filter((bm) => bm.libraryItemId === libraryItemId)
  },
  getUserSetting: (state) => (key) => {
    return state.settings?.[key] || null
  },
  getUserCanUpdate: (state) => {
    return !!state.user?.permissions?.update
  },
  getUserCanDelete: (state) => {
    return !!state.user?.permissions?.delete
  },
  getUserCanDownload: (state) => {
    return !!state.user?.permissions?.download
  },
  getUserCanAccessExplicitContent: (state) => {
    return !!state.user?.permissions?.accessExplicitContent
  }
}

export const actions = {
  // When changing libraries make sure sort and filter is still valid
  checkUpdateLibrarySortFilter({ state, dispatch, commit }, mediaType) {
    const settingsUpdate = {}
    if (mediaType == 'podcast') {
      if (state.settings.mobileOrderBy == 'media.metadata.authorName' || state.settings.mobileOrderBy == 'media.metadata.authorNameLF') {
        settingsUpdate.mobileOrderBy = 'media.metadata.author'
      }
      if (state.settings.mobileOrderBy == 'media.duration') {
        settingsUpdate.mobileOrderBy = 'media.numTracks'
      }
      if (state.settings.mobileOrderBy == 'media.metadata.publishedYear') {
        settingsUpdate.mobileOrderBy = 'media.metadata.title'
      }
      const invalidFilters = ['series', 'authors', 'narrators', 'languages', 'progress', 'issues']
      const filterByFirstPart = (state.settings.mobileFilterBy || '').split('.').shift()
      if (invalidFilters.includes(filterByFirstPart)) {
        settingsUpdate.mobileFilterBy = 'all'
      }
    } else {
      if (state.settings.mobileOrderBy == 'media.metadata.author') {
        settingsUpdate.mobileOrderBy = 'media.metadata.authorName'
      }
      if (state.settings.mobileOrderBy == 'media.numTracks') {
        settingsUpdate.mobileOrderBy = 'media.duration'
      }
    }
    if (Object.keys(settingsUpdate).length) {
      dispatch('updateUserSettings', settingsUpdate)
    }
  },
  async updateUserSettings({ state, commit }, payload) {
    if (!payload) return false

    let hasChanges = false
    const existingSettings = { ...state.settings }
    for (const key in existingSettings) {
      if (payload[key] !== undefined && existingSettings[key] !== payload[key]) {
        hasChanges = true
        existingSettings[key] = payload[key]
      }
    }
    if (hasChanges) {
      commit('setSettings', existingSettings)
      await this.$localStore.setUserSettings(existingSettings)
      this.$eventBus.$emit('user-settings', state.settings)
    }
  },
  async loadUserSettings({ state, commit }) {
    const userSettingsFromLocal = await this.$localStore.getUserSettings()

    if (userSettingsFromLocal) {
      const userSettings = { ...state.settings }
      for (const key in userSettings) {
        if (userSettingsFromLocal[key] !== undefined) {
          userSettings[key] = userSettingsFromLocal[key]
        }
      }
      commit('setSettings', userSettings)
      this.$eventBus.$emit('user-settings', state.settings)
    }
  },
  async openWebClient({ getters }, path = null) {
    const serverAddress = getters.getServerAddress
    if (!serverAddress) {
      console.error('openWebClient: No server address')
      return
    }
    try {
      let url = serverAddress.replace(/\/$/, '') // Remove trailing slash
      if (path?.startsWith('/')) url += path

      await Browser.open({ url })
    } catch (error) {
      console.error('Error opening browser', error)
    }
  },
  async logout({ state, commit }, logoutFromServer = false) {
    // Logging out from server deletes the session so the refresh token is no longer valid
    // Currently this is not being used to support switching servers without logging back in (assuming refresh token is still valid)
    // We may want to make this change in the future
    if (state.serverConnectionConfig && logoutFromServer) {
      const refreshToken = await this.$db.getRefreshToken(state.serverConnectionConfig.id)
      const options = {}
      if (refreshToken) {
        // Refresh token is used to delete the session on the server
        options.headers = {
          'x-refresh-token': refreshToken
        }
      }
      // Logout from server
      await this.$nativeHttp.post('/logout', null, options).catch((error) => {
        console.error('Failed to logout', error)
      })
    }

    await this.$db.logout()
    this.$socket.logout()
    this.$localStore.removeLastLibraryId()
    commit('logout')
    commit('libraries/setCurrentLibrary', null, { root: true })
    await AbsLogger.info({ tag: 'user', message: `Logged out from server ${state.serverConnectionConfig?.name || 'Not connected'}` })
  },
  async refreshToken({ getters, commit, state }) {
    // For CF-protected connections: probe for a stale CF session and refresh
    // via WebView before hitting /auth/refresh — expired CF cookies would cause
    // the token endpoint to return a CF login-page redirect instead of a token.
    // On success this commits the updated config (with fresh cookies) to the
    // store, so state.serverConnectionConfig?.customHeaders is current below.
    await this.$nativeHttp.refreshCfSessionIfStale(state.serverConnectionConfig)

    const refreshToken = await this.$db.getRefreshToken(getters.getServerConnectionConfigId)
    if (!refreshToken) {
      console.error('No refresh token found')
      return null
    }

    const serverAddress = getters.getServerAddress

    const response = await CapacitorHttp.post({
      url: `${serverAddress}/auth/refresh`,
      headers: {
        'Content-Type': 'application/json',
        'x-refresh-token': refreshToken,
        ...state.serverConnectionConfig?.customHeaders
      },
      data: {}
    })

    if (response.status !== 200) {
      console.error('[user] Token refresh request failed:', response.status)
      return null
    }

    const userResponseData = response.data
    if (!userResponseData.user?.accessToken) {
      console.error('[user] No access token in refresh response')
      return null
    }

    // Update the config with new tokens
    const updatedConfig = {
      ...state.serverConnectionConfig,
      token: userResponseData.user.accessToken,
      refreshToken: userResponseData.user.refreshToken
    }

    // Save updated config to secure storage, persists refresh token in secure storage
    const savedConfig = await this.$db.setServerConnectionConfig(updatedConfig)

    // Update the store
    commit('setAccessToken', userResponseData.user.accessToken)

    // Re-authenticate socket if necessary
    if (this.$socket?.connected && !this.$socket.isAuthenticated) {
      this.$socket.sendAuthenticate()
    } else if (!this.$socket) {
      console.warn('[user] Socket not available, cannot re-authenticate')
    }

    if (savedConfig) {
      commit('setServerConnectionConfig', savedConfig)
    }

    return userResponseData.user.accessToken
  }
}

// Picks whichever of two mediaProgress records for the same item represents
// more actual listening/reading progress. Deliberately NOT a lastUpdate
// comparison: lastUpdate keeps advancing purely from local playback
// autosaving every few seconds, even when that playback started from an
// already-stale cached position — e.g. you listened further on another
// device, closed the app, then opened this one and hit play immediately
// from the stale cached spot before the live reconnect had a chance to
// land. Within seconds this device's lastUpdate would out-race the other
// device's and "newest lastUpdate wins" would pick the LESS advanced
// record. Actual position can't be raced that way: it only grows when real
// listening/reading time has actually elapsed, so it's what decides here.
function pickFurtherProgress(a, b) {
  if (!a) return b
  if (!b) return a
  if (a.isFinished && !b.isFinished) return a
  if (b.isFinished && !a.isFinished) return b
  const posA = Math.max(a.progress || 0, a.ebookProgress || 0)
  const posB = Math.max(b.progress || 0, b.ebookProgress || 0)
  if (posA !== posB) return posA > posB ? a : b
  // True tie (e.g. both freshly reset to the same spot) — lastUpdate is a
  // reasonable last resort only once position can't tell them apart.
  return (a.lastUpdate || 0) >= (b.lastUpdate || 0) ? a : b
}

// Merges two mediaProgress arrays by id using the above. Used so a fresh
// setUser (e.g. a live reconnect after an offline-cached session was shown,
// or any repeat setUser from a token refresh/socket user_updated event) can
// never silently regress progress that's actually further along than what
// this particular response carries.
function mergeMediaProgressLists(current, incoming) {
  if (!current?.length) return incoming || []
  if (!incoming?.length) return current
  const byId = new Map()
  for (const p of current) {
    if (p?.id) byId.set(p.id, p)
  }
  for (const p of incoming) {
    if (!p?.id) continue
    byId.set(p.id, pickFurtherProgress(byId.get(p.id), p))
  }
  return Array.from(byId.values())
}

export const mutations = {
  logout(state) {
    state.user = null
    state.accessToken = null
    state.serverConnectionConfig = null
  },
  setUser(state, user) {
    if (state.user?.mediaProgress?.length && user?.mediaProgress) {
      user = { ...user, mediaProgress: mergeMediaProgressLists(state.user.mediaProgress, user.mediaProgress) }
    }
    state.user = user
  },
  setAccessToken(state, accessToken) {
    state.accessToken = accessToken
  },
  setIsHydratedFromCache(state, val) {
    state.isHydratedFromCache = val
  },
  removeMediaProgress(state, id) {
    if (!state.user) return
    state.user.mediaProgress = state.user.mediaProgress.filter((mp) => mp.id != id)
  },
  updateUserMediaProgress(state, data) {
    if (!data || !state.user) return
    const mediaProgressIndex = state.user.mediaProgress.findIndex((mp) => mp.id === data.id)
    if (mediaProgressIndex >= 0) {
      state.user.mediaProgress.splice(mediaProgressIndex, 1, data)
    } else {
      state.user.mediaProgress.push(data)
    }
  },
  setServerConnectionConfig(state, serverConnectionConfig) {
    state.serverConnectionConfig = serverConnectionConfig
  },
  setSettings(state, settings) {
    if (!settings) return
    state.settings = settings
  },
  addBookmark(state, bookmark) {
    if (!state.user?.bookmarks) return
    const exists = state.user.bookmarks.some((bm) => bm.libraryItemId === bookmark.libraryItemId && bm.time === bookmark.time)
    if (!exists) state.user.bookmarks.push(bookmark)
  },
  updateBookmark(state, bookmark) {
    if (!state.user?.bookmarks) return
    state.user.bookmarks = state.user.bookmarks.map((bm) => {
      if (bm.libraryItemId === bookmark.libraryItemId && bm.time === bookmark.time) {
        return bookmark
      }
      return bm
    })
  },
  deleteBookmark(state, { libraryItemId, time }) {
    if (!state.user?.bookmarks) return
    state.user.bookmarks = state.user.bookmarks.filter((bm) => {
      if (bm.libraryItemId === libraryItemId && bm.time === time) return false
      return true
    })
  }
}
