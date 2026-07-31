import { Network } from '@capacitor/network'
import { AbsDatabase } from '@/plugins/capacitor'
import { AbsAudioPlayer } from '@/plugins/capacitor'
import { PlayMethod } from '@/plugins/constants'

// NanoHive customization settings — ported from nanohive-abs-theme/theme/enhancements.js
// defaultSettings (lines 27-53). Fields with no destination in this mobile app
// (appName/showLogoText — no app-name text element in Appbar; hideRailNarrators —
// no Narrators page/tab exists here) are intentionally left out rather than added
// as no-op controls.
export const NH_SETTINGS_DEFAULTS = {
  accentColor: '#e0c27a',
  baseTheme: 'warm',
  mainFont: 'Merriweather',
  fontScale: 1.0,
  // Extra multiplier applied on top of fontScale, for the hamburger drawer's
  // nav-item text only — lets it be tuned independently since it's often
  // the tightest-fitting text in the app (long labels in a narrow drawer).
  drawerFontScale: 1.0,
  // Output of the NH UI Glass Effect Tuner (hamburger menu). nhGlassEffect is
  // whichever snapshot (a slot, most recently) is currently active — restored
  // on next launch. nhGlassEffectSlots holds up to 3 independently named
  // snapshots so a user can A/B between saved looks by tapping between them.
  // Both null/empty means nothing's been saved yet — DevPanel.vue's own
  // hardcoded CONTROLS/panelState defaults apply instead. Snapshot shape:
  // { cssVars: { '--nh-cine-blur': 12, ... }, panel: { bgOpacity, scrimOpacity, blur } }.
  // Tuner adjustments preview live via direct CSS var writes regardless of
  // these settings; they only decide what survives an app restart.
  nhGlassEffect: null,
  nhGlassEffectSlots: { slot1: null, slot2: null, slot3: null },
  carouselTiming: 15,
  logoUrl: '',
  colorizeLogo: false,
  customSeriesCards: true,
  showHeroCarousel: true,
  continueReadingMode: 'combine', // 'combine' | 'separate' | 'hidden'
  hideRailSeries: false,
  hideRailCollections: false,
  hideRailAuthors: false,
  hideRailStats: false,
  hideHomeRecentlyAdded: false,
  hideHomeContinueSeries: false,
  hideHomeListenAgain: false,
  hideHomeDiscover: false,
  hideHomeNewAuthors: false,
  hideHomeRecentSeries: false,
  showCustomRecentSeries: true,
  recentSeriesCount: 12,
  // NH source uses a muted gray (--nh-muted-2) for the home greeting label
  // ("FRIDAY - GOOD EVENING"); default true keeps it on the accent color
  // instead, matching the app's existing look before this toggle was added.
  greetingUsesAccent: true
}

// NH source: enhancements.js baseThemes (lines 67-80)
// NH UI Glass Effect Tuner (components/nh/DevPanel.vue) controls, plus the
// unit each CSS var needs when written directly (e.g. blur values must be
// '<n>px', not a bare number — layouts/default.vue's applyNhCustomizations()
// needs this same metadata to correctly reapply saved values on mount, not
// just DevPanel's own live sliders. Shared here instead of duplicated so
// they can't drift out of sync with each other.
// Defaults tuned live on-device 2026-07-25 and set as the new baseline
// (originally matched NH source exactly: appbar/player rgba(--nh-bg-rgb,
// 0.45/0.4) blur(28px), mobile drawer rgba(--nh-bg-rgb,0.98..0.94)
// blur(24px); cinematic background originally blur(55px) brightness(0.45)
// saturate(1.35), gradient 0.5/0.8/1.0 — ported directly from NH's
// desktop-tuned source before being tuned for a phone viewport).
export const NH_GLASS_EFFECT_CONTROLS = [
  { group: 'Cinematic Background', prop: '--nh-cine-blur', label: 'Blur', default: 12, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Cinematic Background', prop: '--nh-cine-brightness', label: 'Brightness', default: 1.08, min: 0, max: 1.5, step: 0.01, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-saturate', label: 'Saturate', default: 1.9, min: 0, max: 3, step: 0.05, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-grad-top', label: 'Gradient Top', default: 0.77, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-grad-mid', label: 'Gradient Mid', default: 0.8, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-grad-bottom', label: 'Gradient Bottom', default: 1, min: 0, max: 1, step: 0.01, unit: '' },
  // Home page's #nh-home-bg cinematic background (above) and the hero
  // carousel's own per-slide blurred cover background (.nh-slide-bg) are
  // separate elements with separate effects — this used to be hardcoded
  // (filter: blur(28px) brightness(0.5) saturate(1.4) in nh-theme.css) with
  // no way to tune it at all.
  { group: 'Carousel Background', prop: '--nh-carousel-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Carousel Background', prop: '--nh-carousel-brightness', label: 'Brightness', default: 0.5, min: 0, max: 1.5, step: 0.01, unit: '' },
  { group: 'Carousel Background', prop: '--nh-carousel-saturate', label: 'Saturate', default: 1.4, min: 0, max: 3, step: 0.05, unit: '' },
  { group: 'Appbar', prop: '--nh-appbar-opacity', label: 'Opacity', default: 0.41, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Appbar', prop: '--nh-appbar-blur', label: 'Blur', default: 48, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Drawer', prop: '--nh-drawer-opacity', label: 'Opacity', default: 0, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Drawer', prop: '--nh-drawer-blur', label: 'Blur', default: 13, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Mini Player', prop: '--nh-miniplayer-opacity', label: 'Opacity', default: 0.4, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Mini Player', prop: '--nh-miniplayer-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' }
]

export const NH_BASE_THEMES = {
  warm: { name: 'Warm Dark', canvas: '#181512', rail: '#120f0d', raised: '#221e1a', rgb: '24, 21, 18' },
  slate: { name: 'Cool Slate', canvas: '#111625', rail: '#0d111c', raised: '#1a2238', rgb: '17, 22, 37' },
  black: { name: 'True Black', canvas: '#080808', rail: '#050505', raised: '#141414', rgb: '8, 8, 8' },
  navy: { name: 'Deep Navy', canvas: '#0a111a', rail: '#070c12', raised: '#101b29', rgb: '10, 17, 26' },
  mocha: { name: 'Mocha', canvas: '#231c18', rail: '#1c1613', raised: '#2e2520', rgb: '35, 28, 24' },
  pine: { name: 'Deep Pine', canvas: '#121a15', rail: '#0e1410', raised: '#19241d', rgb: '18, 26, 21' },
  plum: { name: 'Plum', canvas: '#1a1320', rail: '#140e19', raised: '#261b2e', rgb: '26, 19, 32' },
  crimson: { name: 'Crimson', canvas: '#1d1212', rail: '#160d0d', raised: '#2b1b1b', rgb: '29, 18, 18' },
  ocean: { name: 'Ocean', canvas: '#0b1618', rail: '#081011', raised: '#122124', rgb: '11, 22, 24' },
  sand: { name: 'Sand', canvas: '#1c1814', rail: '#15120f', raised: '#2a241d', rgb: '28, 24, 20' },
  steel: { name: 'Steel', canvas: '#13171c', rail: '#0e1114', raised: '#1e242b', rgb: '19, 23, 28' },
  wine: { name: 'Wine', canvas: '#1a1014', rail: '#140c0f', raised: '#281820', rgb: '26, 16, 20' }
}

// NH source: enhancements.js GOOGLE_FONTS (line 9)
export const NH_GOOGLE_FONTS = ['Spectral', 'Inter', 'Merriweather', 'Montserrat', 'Playfair Display', 'Oswald', 'Raleway', 'Nunito', 'Ubuntu', 'Lora', 'Work Sans', 'Fira Sans', 'Poppins', 'Cinzel', 'Bitter', 'Quicksand']

// NH source: enhancements.js presetColorsRow1-5 (lines 82-87)
export const NH_PRESET_COLORS = ['#c88d36', '#5b8a62', '#4f728c', '#836589', '#b85b49', '#b5767a', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#f44336', '#e91e63', '#d4b383', '#8c9a83', '#798492', '#9b859d', '#c08779', '#a89f91', '#e0c27a', '#7fa7c4', '#a88bbf', '#d98c7a', '#6fae8e', '#c77fa0', '#ffc107', '#00bcd4', '#673ab7', '#8bc34a', '#ff5722', '#03a9f4']

export const state = () => ({
  deviceData: null,
  currentPlaybackSession: null,
  playerIsPlaying: false,
  playerIsFullscreen: false,
  playerIsStartingPlayback: false, // When pressing play before native play response
  playerStartingPlaybackMediaId: null,
  isCasting: false,
  isCastAvailable: false,
  attemptingConnection: false,
  socketConnected: false,
  networkConnected: false,
  networkConnectionType: null,
  isNetworkUnmetered: true,
  isFirstLoad: true,
  isFirstAudioLoad: true,
  hasStoragePermission: false,
  selectedLibraryItem: null,
  showReader: false,
  ereaderKeepProgress: false,
  ereaderFileId: null,
  showSideDrawer: false,
  nhThemeActive: true,
  nhHomeCoverUrl: null,
  nhSettings: { ...NH_SETTINGS_DEFAULTS },
  isNetworkListenerInit: false,
  serverSettings: null,
  lastBookshelfScrollData: {},
  lastItemScrollData: {}
})

export const getters = {
  getCurrentPlaybackSessionId: (state) => {
    return state.currentPlaybackSession?.id || null
  },
  getIsPlayerOpen: (state) => {
    return !!state.currentPlaybackSession
  },
  getIsCurrentSessionLocal: (state) => {
    return state.currentPlaybackSession?.playMethod == PlayMethod.LOCAL
  },
  getIsMediaStreaming: (state) => (libraryItemId, episodeId) => {
    if (!state.currentPlaybackSession || !libraryItemId) return false

    // Check using local library item id and local episode id
    const isLocalLibraryItemId = libraryItemId.startsWith('local_')
    if (isLocalLibraryItemId) {
      if (state.currentPlaybackSession.localLibraryItem?.id !== libraryItemId) {
        return false
      }
      if (!episodeId) return true
      return state.currentPlaybackSession.localEpisodeId === episodeId
    }

    if (state.currentPlaybackSession.libraryItemId !== libraryItemId) {
      return false
    }
    if (!episodeId) return true
    return state.currentPlaybackSession.episodeId === episodeId
  },
  getServerSetting: (state) => (key) => {
    if (!state.serverSettings) return null
    return state.serverSettings[key]
  },
  getJumpForwardTime: (state) => {
    if (!state.deviceData?.deviceSettings) return 10
    return state.deviceData.deviceSettings.jumpForwardTime || 10
  },
  getJumpBackwardsTime: (state) => {
    if (!state.deviceData?.deviceSettings) return 10
    return state.deviceData.deviceSettings.jumpBackwardsTime || 10
  },
  getAltViewEnabled: (state) => {
    if (!state.deviceData?.deviceSettings) return true
    return state.deviceData.deviceSettings.enableAltView
  },
  getOrientationLockSetting: (state) => {
    return state.deviceData?.deviceSettings?.lockOrientation
  },
  getCanDownloadUsingCellular: (state) => {
    if (!state.deviceData?.deviceSettings?.downloadUsingCellular) return 'ALWAYS'
    return state.deviceData.deviceSettings.downloadUsingCellular || 'ALWAYS'
  },
  getCanStreamingUsingCellular: (state) => {
    if (!state.deviceData?.deviceSettings?.streamingUsingCellular) return 'ALWAYS'
    return state.deviceData.deviceSettings.streamingUsingCellular || 'ALWAYS'
  },
  /**
   * Old server versions require a token for images
   *
   * @param {*} state
   * @returns {boolean} True if server version is less than 2.17
   */
  getDoesServerImagesRequireToken: (state) => {
    const serverVersion = state.serverSettings?.version
    if (!serverVersion) return false
    const versionParts = serverVersion.split('.')
    const majorVersion = parseInt(versionParts[0])
    const minorVersion = parseInt(versionParts[1])
    return majorVersion < 2 || (majorVersion == 2 && minorVersion < 17)
  }
}

export const actions = {
  // Listen for network connection
  // Initialises the Capacitor Network listener and the AbsAudioPlayer metered-network listener.
  async setupNetworkListener({ state, commit }) {
    if (state.isNetworkListenerInit) return
    commit('setNetworkListenerInit', true)

    const status = await Network.getStatus()
    console.log('Network status', status)
    commit('setNetworkStatus', status)

    Network.addListener('networkStatusChange', (status) => {
      console.log('Network status changed', status.connected, status.connectionType)
      commit('setNetworkStatus', status)
      // Re-probe LAN vs remote endpoint when Wi-Fi connects so routing switches dynamically
      // without requiring an app restart or manual reconnect. Skip when there's no server
      // connection to resolve against — a null serverConnectionConfig still reaches the
      // Kotlin side and resets effectiveAddress to "", harmless but wasteful on every
      // Wi-Fi connect while logged out (Greptile, PR #4).
      if (status.connected && status.connectionType === 'wifi' && state.user.serverConnectionConfig) {
        AbsDatabase.resolveEndpoint().catch((err) => {
          console.warn('[store] resolveEndpoint failed on Wi-Fi connect', err)
        })
      }
    })

    AbsAudioPlayer.addListener('onNetworkMeteredChanged', (payload) => {
      const isUnmetered = payload.value
      console.log('On network metered changed', isUnmetered)
      commit('setIsNetworkUnmetered', isUnmetered)
    })
  }
}

export const mutations = {
  setDeviceData(state, deviceData) {
    state.deviceData = deviceData
  },
  setLastBookshelfScrollData(state, { scrollTop, path, name }) {
    state.lastBookshelfScrollData[name] = { scrollTop, path }
  },
  setLastItemScrollData(state, data) {
    state.lastItemScrollData = data
  },
  setPlaybackSession(state, playbackSession) {
    state.currentPlaybackSession = playbackSession

    state.isCasting = playbackSession?.mediaPlayer === 'cast-player'
  },
  setMediaPlayer(state, mediaPlayer) {
    state.isCasting = mediaPlayer === 'cast-player'
  },
  setCastAvailable(state, available) {
    state.isCastAvailable = available
  },
  setAttemptingConnection(state, val) {
    state.attemptingConnection = val
  },
  setPlayerPlaying(state, val) {
    state.playerIsPlaying = val
  },
  setPlayerFullscreen(state, val) {
    state.playerIsFullscreen = val
  },
  setPlayerIsStartingPlayback(state, mediaId) {
    state.playerStartingPlaybackMediaId = mediaId
    state.playerIsStartingPlayback = true
  },
  setPlayerDoneStartingPlayback(state) {
    state.playerStartingPlaybackMediaId = null
    state.playerIsStartingPlayback = false
  },
  setHasStoragePermission(state, val) {
    state.hasStoragePermission = val
  },
  setNhHomeCoverUrl(state, val) {
    state.nhHomeCoverUrl = val
  },
  setNhSettings(state, settings) {
    state.nhSettings = { ...NH_SETTINGS_DEFAULTS, ...settings }
  },
  setNhSetting(state, { key, value }) {
    state.nhSettings = { ...state.nhSettings, [key]: value }
  },
  setIsFirstLoad(state, val) {
    state.isFirstLoad = val
  },
  setIsFirstAudioLoad(state, val) {
    state.isFirstAudioLoad = val
  },
  setSocketConnected(state, val) {
    state.socketConnected = val
  },
  setNetworkListenerInit(state, val) {
    state.isNetworkListenerInit = val
  },
  setNetworkStatus(state, val) {
    if (val.connectionType !== 'none') {
      state.networkConnected = true
    } else {
      state.networkConnected = false
    }
    if (this.$platform === 'ios') {
      // Capacitor Network plugin only shows ios device connected if internet access is available.
      // This fix allows iOS users to use local servers without internet access.
      state.networkConnected = true
    }
    state.networkConnectionType = val.connectionType
  },
  setIsNetworkUnmetered(state, val) {
    state.isNetworkUnmetered = val
  },
  showReader(state, { libraryItem, keepProgress, fileId }) {
    state.selectedLibraryItem = libraryItem
    state.ereaderKeepProgress = keepProgress
    state.ereaderFileId = fileId

    state.showReader = true
  },
  setShowReader(state, val) {
    state.showReader = val
  },
  setShowSideDrawer(state, val) {
    state.showSideDrawer = val
  },
  setNhThemeActive(state, val) {
    state.nhThemeActive = val
  },
  setServerSettings(state, val) {
    state.serverSettings = val
    this.$localStore.setServerSettings(state.serverSettings)
  }
}
