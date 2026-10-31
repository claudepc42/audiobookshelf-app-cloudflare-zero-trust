import { CapacitorHttp, Capacitor } from '@capacitor/core'
import { AbsCfZeroTrust } from './capacitor/AbsCfZeroTrust'
import { AbsLogger } from './capacitor'

export default function ({ store, $db, $socket }, inject) {
  // Guards against concurrent 401s (e.g. a burst of background requests right after a cold
  // start) each independently racing /auth/refresh with the same refresh token. The server
  // rotates the refresh token on the first successful call, so any other concurrent call still
  // in flight gets back a 401/429 for a token that's already been rotated out — even though a
  // valid, freshly-rotated refresh token exists moments later. Serializing all concurrent 401s
  // onto one in-flight refresh (and one shared failure handler) avoids that spurious logout.
  let isRefreshingToken = false
  let refreshPromise = null
  let refreshFailureHandled = false

  const nativeHttp = {
    // Most ABS /api/ endpoints return JSON, but not all — e.g. PATCH /api/me/progress/:id
    // returns a plain 200 "OK" (text/plain). A stale CF session instead serves an HTML
    // login/challenge page, which CapacitorHttp silently follows and returns as a 2xx —
    // the same failure mode that used to crash attemptConnection(). Two guards keep a
    // legitimate plain-text response from being misread as that: (1) this only applies
    // to connections that actually went through CF/SSO in the first place — with no CF
    // in front of the server there's no session to go stale, and refreshCfSessionIfStale
    // below would immediately no-op anyway, leaving the caller with a false "Cloudflare
    // session expired" for a request that actually succeeded; (2) the body has to
    // actually look like an HTML document, not just be non-JSON.
    looksLikeStaleCfResponse(res, url, serverConnectionConfig) {
      // Greptile-found bug: connection records saved before isSsoAuth existed
      // have no value for it, so this guard used to treat them as non-CF and
      // never detect their stale challenge pages. Every place that actually
      // sets isSsoAuth=true also sets customHeaders.Cookie in the same breath
      // (see ServerConnectForm.vue's CF flow) — a Cookie header is the same
      // signal a legacy record would carry, so it's used here as a compatible
      // fallback instead of requiring a separate migration step.
      const isCfConnection = serverConnectionConfig?.isSsoAuth || !!serverConnectionConfig?.customHeaders?.Cookie
      if (!isCfConnection) return false
      if (!url.includes('/api/') || typeof res.data !== 'string') return false
      return /^\s*<(!doctype|html)/i.test(res.data)
    },

    // Probes for a stale CF session and opens the WebView to refresh it if needed.
    // Returns the updated serverConnectionConfig, or null if nothing needed refreshing
    // or the refresh failed/was cancelled.
    async refreshCfSessionIfStale(serverConnectionConfig) {
      const platform = Capacitor.getPlatform()
      if ((platform !== 'android' && platform !== 'ios') || !serverConnectionConfig?.isSsoAuth) return null
      try {
        const probeResult = await AbsCfZeroTrust.probeCfChallenge({
          serverAddress: serverConnectionConfig.address,
          cookies: serverConnectionConfig.customHeaders?.Cookie || ''
        })
        if (!probeResult?.isCfProtected || probeResult?.cookiesValid) return null

        const result = await AbsCfZeroTrust.openCfWebView({ serverAddress: serverConnectionConfig.address })
        if (!result?.cookieHeader) return null

        const updatedConfig = { ...serverConnectionConfig, customHeaders: { Cookie: result.cookieHeader }, isSsoAuth: true }
        const savedConfig = await $db.setServerConnectionConfig(updatedConfig)
        const finalConfig = savedConfig || updatedConfig
        store.commit('user/setServerConnectionConfig', finalConfig)
        return finalConfig
      } catch (e) {
        return null
      }
    },

    async request(method, _url, data, options = {}) {
      // When authorizing before a config is set, server config gets passed in as an option
      let serverConnectionConfig = options.serverConnectionConfig || store.state.user.serverConnectionConfig
      delete options.serverConnectionConfig

      let url = _url
      let headers = {}
      if (!url.startsWith('http') && !url.startsWith('capacitor')) {
        const bearerToken = store.getters['user/getToken']
        if (bearerToken) {
          headers['Authorization'] = `Bearer ${bearerToken}`
        } else {
          console.warn('[nativeHttp] No Bearer Token for request')
        }
        if (serverConnectionConfig?.address) {
          url = `${serverConnectionConfig.address}${url}`
        }
      }
      if (data) {
        headers['Content-Type'] = 'application/json'
      }
      if (options.headers) {
        headers = { ...headers, ...options.headers }
        delete options.headers
      }
      if (serverConnectionConfig?.customHeaders) {
        headers = { ...headers, ...serverConnectionConfig.customHeaders }
      }
      console.log(`[nativeHttp] Making ${method} request to ${url}`)

      return CapacitorHttp.request({
        method,
        url,
        data,
        headers,
        ...options
      }).then((res) => {
        if (res.status === 401) {
          console.error(`[nativeHttp] 401 status for url "${url}"`)
          AbsLogger.error({ tag: 'nativeHttp', message: `request: 401 for "${url}" (${method}) — attempting token refresh` })
          // Handle refresh token automatically
          return this.handleTokenRefresh(method, url, data, headers, options, serverConnectionConfig)
        }
        if (res.status >= 400) {
          console.error(`[nativeHttp] ${res.status} status for url "${url}"`)
          const message = typeof res.data === 'string' ? res.data : `HTTP ${res.status}`
          throw new Error(message)
        }

        if (this.looksLikeStaleCfResponse(res, url, serverConnectionConfig)) {
          console.warn(`[nativeHttp] Non-JSON response for "${url}" — likely a stale CF session, attempting refresh`)
          AbsLogger.error({ tag: 'nativeHttp', message: `request: Non-JSON (HTML) response for "${url}" — likely a stale CF session, attempting WebView refresh` })
          return this.refreshCfSessionIfStale(serverConnectionConfig).then((refreshedConfig) => {
            if (!refreshedConfig) {
              AbsLogger.error({ tag: 'nativeHttp', message: `request: CF session refresh failed/cancelled for "${url}" — treating as Cloudflare session expired` })
              throw new Error('Cloudflare session expired')
            }
            AbsLogger.info({ tag: 'nativeHttp', message: `request: CF session refreshed, retrying "${url}"` })
            const retryHeaders = { ...headers, ...refreshedConfig.customHeaders }
            return CapacitorHttp.request({ method, url, data, headers: retryHeaders, ...options }).then((retryRes) => {
              if (retryRes.status >= 400) {
                const message = typeof retryRes.data === 'string' ? retryRes.data : `HTTP ${retryRes.status}`
                throw new Error(message)
              }
              if (this.looksLikeStaleCfResponse(retryRes, url, refreshedConfig)) {
                AbsLogger.error({ tag: 'nativeHttp', message: `request: "${url}" still looks like a CF login page after refresh` })
                throw new Error('Cloudflare session expired')
              }
              return retryRes.data
            })
          })
        }

        return res.data
      })
    },

    /**
     * Handles token refresh when a 401 Unauthorized response is received
     * @param {string} method - HTTP method
     * @param {string} url - Full URL
     * @param {*} data - Request data
     * @param {Object} headers - Request headers
     * @param {Object} options - Additional options
     * @param {{ id: string, address: string, version: string }} serverConnectionConfig
     * @returns {Promise} - Promise that resolves with the response data
     */
    async handleTokenRefresh(method, url, data, headers, options, serverConnectionConfig) {
      try {
        if (!serverConnectionConfig?.id) {
          console.error('[nativeHttp] No server connection config ID available for token refresh')
          AbsLogger.error({ tag: 'nativeHttp', message: 'handleTokenRefresh: Unable to refresh auth tokens. No server connection config ID' })
          throw new Error('No server connection available')
        }

        let newTokens
        if (isRefreshingToken) {
          // A refresh is already in flight (e.g. a burst of other requests also hit 401 at
          // the same time) — wait for that single attempt instead of racing it with our own
          // /auth/refresh call using the same (about-to-be-rotated) refresh token.
          AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Refresh already in progress for server ${serverConnectionConfig?.name || serverConnectionConfig?.address || 'unknown'} — waiting for it before retrying "${url}"` })
          newTokens = await refreshPromise
        } else {
          console.log('[nativeHttp] Attempting to refresh token...')
          AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Attempting to refresh auth tokens for server ${serverConnectionConfig?.name || serverConnectionConfig?.address || 'unknown'}` })

          isRefreshingToken = true
          refreshFailureHandled = false
          refreshPromise = (async () => {
            // Get refresh token from secure storage
            let refreshToken = await $db.getRefreshToken(serverConnectionConfig.id)
            if (!refreshToken) {
              console.error('[nativeHttp] No refresh token available')
              AbsLogger.error({ tag: 'nativeHttp', message: `handleTokenRefresh: Unable to refresh auth tokens. No refresh token available for server ${serverConnectionConfig.name || serverConnectionConfig.address}` })
              throw new Error('No refresh token available')
            }

            // ApiHandler.kt (native Kotlin layer, used by Android Auto/background sync) runs its
            // own independent single-flight refresh against the same shared secure storage. A
            // burst of 401s right after a cold start can still produce one JS-side attempt and
            // one Kotlin-side attempt racing with the same pre-rotation refresh token — whichever
            // loses gets a genuine 401/429 from the server even though a freshly-rotated, valid
            // refresh token already exists moments later. Detected by re-reading secure storage
            // after a failed attempt and retrying with the fresh token instead of declaring the
            // session dead. Up to 2 attempts total.
            let lastError = null
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const tokens = await this.refreshAccessToken(refreshToken, serverConnectionConfig)
                await this.updateTokens(tokens, serverConnectionConfig)
                return tokens
              } catch (err) {
                lastError = err
                if (err?.status === 429) {
                  // Rate-limited, not invalid — never grounds for a forced logout.
                  err.isRateLimited = true
                  throw err
                }
                const latestRefreshToken = await $db.getRefreshToken(serverConnectionConfig.id)
                if (!latestRefreshToken || latestRefreshToken === refreshToken) {
                  // Nothing changed underneath us — this is a genuinely invalid/expired token.
                  throw err
                }
                AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Refresh token for server ${serverConnectionConfig.name || serverConnectionConfig.address} was rotated by another process mid-attempt — retrying with the fresh token` })
                refreshToken = latestRefreshToken
              }
            }
            throw lastError
          })()

          try {
            newTokens = await refreshPromise
          } finally {
            isRefreshingToken = false
            refreshPromise = null
          }
        }

        AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Successfully refreshed auth tokens for server ${serverConnectionConfig.name || serverConnectionConfig.address}, retrying "${url}"` })

        // Retry the original request with the new token
        console.log('[nativeHttp] Retrying original request with new token...')
        const retryResponse = await CapacitorHttp.request({
          method,
          url,
          data,
          headers: {
            ...headers,
            Authorization: `Bearer ${newTokens.accessToken}`
          },
          ...options
        })

        if (retryResponse.status >= 400) {
          console.error(`[nativeHttp] Retry request failed with status ${retryResponse.status}`)
          AbsLogger.error({ tag: 'nativeHttp', message: `handleTokenRefresh: Retry of "${url}" failed with status ${retryResponse.status} after a successful token refresh` })
          const message = typeof retryResponse.data === 'string' ? retryResponse.data : `HTTP ${retryResponse.status}`
          throw new Error(message)
        }

        return retryResponse.data
      } catch (error) {
        console.error('[nativeHttp] Token refresh failed:', error)
        AbsLogger.error({ tag: 'nativeHttp', message: `handleTokenRefresh: Token refresh failed for server ${serverConnectionConfig?.name || serverConnectionConfig?.address || 'unknown'} while handling "${url}" (error: ${error?.message || error})` })

        // A 429 means rate-limited, not invalid — surface the failure to this request without
        // touching the saved session. The self-inflicted burst that used to cause this should no
        // longer recur now that concurrent 401s are coalesced, but that's not grounds to log out.
        if (error?.isRateLimited) {
          throw error
        }

        // Only the first caller to observe this refresh attempt's failure triggers logout —
        // every other request that was waiting on the same shared refreshPromise would
        // otherwise each independently redirect/logout for what is really one failure.
        if (!refreshFailureHandled) {
          refreshFailureHandled = true
          await this.handleRefreshFailure(serverConnectionConfig?.id)
        }
        throw error
      }
    },

    /**
     * Refreshes the access token using the refresh token
     * @param {string} refreshToken - The refresh token
     * @param {string} serverAddress - The server address
     * @returns {Promise<Object|null>} - Promise that resolves with new tokens or null
     */
    async refreshAccessToken(refreshToken, serverConnectionConfig) {
      const serverAddress = serverConnectionConfig?.address
      if (!serverAddress) {
        throw new Error('No server address available')
      }

      console.log('[nativeHttp] Refreshing access token...')

      let response
      try {
        response = await CapacitorHttp.post({
          url: `${serverAddress}/auth/refresh`,
          headers: {
            'Content-Type': 'application/json',
            'x-refresh-token': refreshToken,
            ...(serverConnectionConfig?.customHeaders || {})
          },
          data: {}
        })
      } catch (error) {
        console.error('[nativeHttp] Failed to refresh access token:', error)
        throw new Error('Failed to refresh access token')
      }

      if (response.status !== 200) {
        console.error('[nativeHttp] Token refresh request failed:', response.status)
        AbsLogger.error({ tag: 'nativeHttp', message: `refreshAccessToken: /auth/refresh request failed with status ${response.status} for server ${serverConnectionConfig?.name || serverAddress}` })
        const err = new Error(`Token refresh failed with status ${response.status}`)
        err.status = response.status
        throw err
      }

      const userResponseData = response.data
      if (!userResponseData.user?.accessToken) {
        console.error('[nativeHttp] No access token in refresh response')
        AbsLogger.error({ tag: 'nativeHttp', message: `refreshAccessToken: No access token in /auth/refresh response for server ${serverConnectionConfig?.name || serverAddress}` })
        throw new Error('No access token in refresh response')
      }

      console.log('[nativeHttp] Successfully refreshed access token')
      return {
        accessToken: userResponseData.user.accessToken,
        // Refresh token gets returned when refresh token is sent in x-refresh-token header
        refreshToken: userResponseData.user.refreshToken
      }
    },

    /**
     * Updates the store and secure storage with new tokens
     * @param {Object} tokens - Object containing accessToken and refreshToken
     * @param {{ id: string, address: string, version: string }} serverConnectionConfig
     * @returns {Promise} - Promise that resolves when tokens are updated
     */
    async updateTokens(tokens, serverConnectionConfig) {
      try {
        if (!serverConnectionConfig?.id) {
          throw new Error('No server connection config ID available')
        }

        // Update the config with new tokens
        const updatedConfig = {
          ...serverConnectionConfig,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }

        // Save updated config to secure storage, persists refresh token in secure storage
        const savedConfig = await $db.setServerConnectionConfig(updatedConfig)

        // Update the store
        store.commit('user/setAccessToken', tokens.accessToken)

        // Re-authenticate socket if necessary
        if ($socket?.connected && !$socket.isAuthenticated) {
          $socket.sendAuthenticate()
        } else if (!$socket) {
          console.warn('[nativeHttp] Socket not available, cannot re-authenticate')
        }

        if (savedConfig) {
          store.commit('user/setServerConnectionConfig', savedConfig)
        }

        console.log('[nativeHttp] Successfully updated tokens in store and secure storage')
      } catch (error) {
        console.error('[nativeHttp] Failed to update tokens:', error)
        throw error
      }
    },

    /**
     * Handles the case when token refresh fails
     * @param {string} [serverConnectionConfigId]
     * @returns {Promise} - Promise that resolves when logout is complete
     */
    async handleRefreshFailure(serverConnectionConfigId) {
      try {
        console.log('[nativeHttp] Handling refresh failure - logging out user')
        AbsLogger.error({ tag: 'nativeHttp', message: `handleRefreshFailure: Logging out user for server connection config ${serverConnectionConfigId || 'unknown'} after failed token refresh` })

        // Clear store
        await store.dispatch('user/logout')

        if (serverConnectionConfigId) {
          // Clear refresh token for server connection config
          await $db.clearRefreshToken(serverConnectionConfigId)
        }

        // Redirect to login page
        if (window.location.pathname !== '/connect') {
          window.location.href = '/connect?error=refreshTokenFailed&serverConnectionConfigId=' + serverConnectionConfigId
        }
      } catch (error) {
        console.error('[nativeHttp] Failed to handle refresh failure:', error)
      }
    },

    get(url, options = {}) {
      return this.request('GET', url, undefined, options)
    },
    post(url, data, options = {}) {
      return this.request('POST', url, data, options)
    },
    patch(url, data, options = {}) {
      return this.request('PATCH', url, data, options)
    },
    delete(url, options = {}) {
      return this.request('DELETE', url, undefined, options)
    }
  }
  inject('nativeHttp', nativeHttp)
}
