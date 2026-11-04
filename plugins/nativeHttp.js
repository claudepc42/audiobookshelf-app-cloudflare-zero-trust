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
  //
  // All of this is keyed by server connection config id, so a refresh for one server is never
  // mistaken for (or waited on by) a request that belongs to another server.
  const refreshPromises = new Map()
  const failureHandled = new Set()
  // A refresh that failed for a transient reason (server error, no signal) is not retried for a few
  // seconds: every request that then hit a 401 used to start its own refresh against the failing server
  const recentTransientFailures = new Map()
  const TRANSIENT_FAILURE_COOLDOWN_MS = 5000
  // Resolves when a logout started by a failed refresh has finished, so a new refresh can't start
  // with the dead token that hasn't been cleared yet
  let logoutPromise = null
  // One CF probe / login screen at a time per server address: a burst of requests hitting a stale
  // CF session shares the same check instead of each opening its own login screen
  const cfRefreshPromises = new Map()

  // After a cold start the user and token come from the local cache (see plugins/init.client.js)
  // and attemptConnection() has not confirmed them yet. Every request sent in the meantime would
  // carry a token that is probably expired and be retried after a 401, so relative /api/ requests
  // wait here until the session is confirmed. Bounded, and only ever waited out once per start,
  // so a failed or offline attemptConnection() doesn't delay every request after it.
  let hydrationGateExpired = false
  const HYDRATION_GATE_TIMEOUT_MS = 5000
  const waitForConfirmedSession = () => {
    // networkConnected starts false until the network listener reports, so only a known-offline state skips the wait
    if (hydrationGateExpired || !store.state.user.isHydratedFromCache || (store.state.isNetworkListenerInit && !store.state.networkConnected)) return Promise.resolve()
    return new Promise((resolve) => {
      let unwatch = null
      const done = () => {
        clearTimeout(timer)
        if (unwatch) unwatch()
        resolve()
      }
      const timer = setTimeout(() => {
        hydrationGateExpired = true
        done()
      }, HYDRATION_GATE_TIMEOUT_MS)
      unwatch = store.watch((state) => state.user.isHydratedFromCache, (hydrated) => {
        if (!hydrated) done()
      })
    })
  }

  // After the server rejects a refresh token, polls secure storage briefly for a different one:
  // the native layer (ApiHandler.kt) may have won the race and still be saving its rotated token.
  // Returns the new token, or null if it never changed.
  const waitForRotatedRefreshToken = async (serverConnectionConfigId, usedRefreshToken) => {
    for (let i = 0; i < 6; i++) {
      const latest = await $db.getRefreshToken(serverConnectionConfigId)
      if (latest && latest !== usedRefreshToken) return latest
      if (i < 5) await new Promise((resolve) => setTimeout(resolve, 300))
    }
    return null
  }

  // The error for a 4xx/5xx reply. Carries the status so callers can tell "this server has no such
  // endpoint" (404) from a temporary failure, instead of retrying both the same way.
  const httpError = (res) => {
    const err = new Error(typeof res.data === 'string' ? res.data : `HTTP ${res.status}`)
    err.status = res.status
    return err
  }

  const nativeHttp = {
    // Whether this connection went through Cloudflare/SSO at all.
    // Greptile-found bug: connection records saved before isSsoAuth existed have no value for it, so
    // a bare isSsoAuth check treated them as non-CF. Every place that sets isSsoAuth=true also sets
    // customHeaders.Cookie in the same breath (see ServerConnectForm.vue's CF flow) — a Cookie header
    // is the same signal a legacy record carries, so it's the compatible fallback. Use this at every
    // CF gate instead of reading isSsoAuth directly.
    isCfConnection(serverConnectionConfig) {
      return !!(serverConnectionConfig?.isSsoAuth || serverConnectionConfig?.customHeaders?.Cookie)
    },

    // Most ABS /api/ endpoints return JSON, but not all — e.g. PATCH /api/me/progress/:id
    // returns a plain 200 "OK" (text/plain). A stale CF session instead serves an HTML
    // login/challenge page, which CapacitorHttp silently follows and returns as a 2xx —
    // the same failure mode that used to crash attemptConnection(). Two guards keep a
    // legitimate plain-text response from being misread as that: (1) this only applies
    // to connections that actually went through CF/SSO in the first place — with no CF
    // in front of the server there's no session to go stale, and ensureCfSession
    // below would immediately no-op anyway, leaving the caller with a false "Cloudflare
    // session expired" for a request that actually succeeded; (2) the body has to
    // actually look like an HTML document, not just be non-JSON.
    looksLikeStaleCfResponse(res, url, serverConnectionConfig) {
      if (!this.isCfConnection(serverConnectionConfig)) return false
      if (!url.includes('/api/') || typeof res.data !== 'string') return false
      return /^\s*<(!doctype|html)/i.test(res.data)
    },

    /**
     * Checks the CF session and opens the WebView login if it has expired. The one shared version of
     * the probe → login → save sequence; callers choose what to do with each outcome:
     *   ok         - not a CF connection, or the session is still valid
     *   unknown    - the check itself couldn't run (no signal, timeout); the saved cookie is kept
     *   refreshed  - logged in again; `config` is the saved config with the new cookie
     *   cancelled  - the login screen was closed
     *   failed     - the login finished without a cookie
     * Concurrent calls for the same server share one check and at most one login screen.
     * With `assumeStale` the probe is skipped, for when a request already came back as the CF login page.
     * @returns {Promise<{ status: 'ok'|'unknown'|'refreshed'|'cancelled'|'failed', config?: Object }>}
     */
    ensureCfSession(serverConnectionConfig, { assumeStale = false } = {}) {
      const platform = Capacitor.getPlatform()
      if ((platform !== 'android' && platform !== 'ios') || !this.isCfConnection(serverConnectionConfig)) return Promise.resolve({ status: 'ok' })
      const key = serverConnectionConfig.address
      const inFlight = cfRefreshPromises.get(key)
      if (inFlight) return inFlight
      const promise = this.doEnsureCfSession(serverConnectionConfig, assumeStale).finally(() => cfRefreshPromises.delete(key))
      cfRefreshPromises.set(key, promise)
      return promise
    },

    async doEnsureCfSession(serverConnectionConfig, assumeStale) {
      if (!assumeStale) {
        let probeResult
        try {
          probeResult = await AbsCfZeroTrust.probeCfChallenge({
            serverAddress: serverConnectionConfig.address,
            cookies: serverConnectionConfig.customHeaders?.Cookie || ''
          })
        } catch (e) {
          return { status: 'unknown' }
        }
        if (!probeResult?.isCfProtected || probeResult?.cookiesValid) return { status: 'ok' }
        // A timeout during the cookie check says nothing about the cookie: keep it, skip the login
        if (probeResult?.cookiesUnknown) return { status: 'unknown' }
      }

      let result
      try {
        result = await AbsCfZeroTrust.openCfWebView({ serverAddress: serverConnectionConfig.address })
      } catch (e) {
        return { status: 'cancelled' }
      }
      if (!result?.cookieHeader) return { status: 'failed' }

      try {
        // Only the cookie changes: any other custom headers (service tokens, a proxy key) stay
        const updatedConfig = { ...serverConnectionConfig, customHeaders: { ...(serverConnectionConfig.customHeaders || {}), Cookie: result.cookieHeader }, isSsoAuth: true }
        const savedConfig = await $db.setServerConnectionConfig(updatedConfig)
        const finalConfig = savedConfig || updatedConfig
        store.commit('user/setServerConnectionConfig', finalConfig)
        return { status: 'refreshed', config: finalConfig }
      } catch (e) {
        return { status: 'failed' }
      }
    },

    // Same as ensureCfSession, for callers that only want the updated config: resolves with it when
    // the session was renewed, or null when nothing was renewed (not needed, unknown, cancelled, failed)
    async refreshCfSessionIfStale(serverConnectionConfig, options) {
      const { status, config } = await this.ensureCfSession(serverConnectionConfig, options)
      return status === 'refreshed' ? config : null
    },

    async request(method, _url, data, options = {}) {
      // When authorizing before a config is set, server config gets passed in as an option
      let serverConnectionConfig = options.serverConnectionConfig || store.state.user.serverConnectionConfig
      delete options.serverConnectionConfig

      let url = _url
      let headers = {}
      // True while Authorization is the store's token that we attached ourselves (not one the
      // caller supplied), so a stale-token 401 can be recovered from the current store token
      let usedStoreToken = false
      if (!url.startsWith('http') && !url.startsWith('capacitor')) {
        const bearerToken = store.getters['user/getToken']
        if (bearerToken) {
          headers['Authorization'] = `Bearer ${bearerToken}`
          usedStoreToken = true
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
        if (options.headers['Authorization']) usedStoreToken = false
        headers = { ...headers, ...options.headers }
        delete options.headers
      }
      if (serverConnectionConfig?.customHeaders) {
        headers = { ...headers, ...serverConnectionConfig.customHeaders }
      }
      console.log(`[nativeHttp] Making ${method} request to ${url}`)

      // Relative /api/ requests wait for the cached session to be confirmed (see above); the token
      // is read after the wait because the confirmation may have refreshed it
      if (usedStoreToken) {
        await waitForConfirmedSession()
        const confirmedToken = store.getters['user/getToken']
        if (confirmedToken && headers['Authorization'] !== `Bearer ${confirmedToken}`) {
          headers['Authorization'] = `Bearer ${confirmedToken}`
        }
      }

      return CapacitorHttp.request({
        method,
        url,
        data,
        headers,
        ...options
      }).then((res) => {
        if (res.status === 401) {
          console.error(`[nativeHttp] 401 status for url "${url}"`)
          // A request sent with an old token can get its 401 back after a refresh already finished.
          // Refreshing again would rotate the token a second time (re-opening the cross-layer race
          // and burning the server's rate limit) — just retry with the token we already have.
          const currentToken = store.getters['user/getToken']
          if (usedStoreToken && currentToken && headers['Authorization'] !== `Bearer ${currentToken}`) {
            AbsLogger.info({ tag: 'nativeHttp', message: `request: 401 for "${url}" (${method}) was sent with an older token than the current one — retrying with the current token instead of refreshing again` })
            return CapacitorHttp.request({ method, url, data, headers: { ...headers, Authorization: `Bearer ${currentToken}` }, ...options }).then((retryRes) => {
              if (retryRes.status >= 400) {
                throw httpError(retryRes)
              }
              return retryRes.data
            })
          }
          AbsLogger.error({ tag: 'nativeHttp', message: `request: 401 for "${url}" (${method}) — attempting token refresh` })
          // Handle refresh token automatically
          return this.handleTokenRefresh(method, url, data, headers, options, serverConnectionConfig)
        }
        if (res.status >= 400) {
          console.error(`[nativeHttp] ${res.status} status for url "${url}"`)
          throw httpError(res)
        }

        if (this.looksLikeStaleCfResponse(res, url, serverConnectionConfig)) {
          console.warn(`[nativeHttp] Non-JSON response for "${url}" — likely a stale CF session, attempting refresh`)
          AbsLogger.error({ tag: 'nativeHttp', message: `request: Non-JSON (HTML) response for "${url}" — likely a stale CF session, attempting WebView refresh` })
          return this.refreshCfSessionIfStale(serverConnectionConfig, { assumeStale: true }).then((refreshedConfig) => {
            if (!refreshedConfig) {
              AbsLogger.error({ tag: 'nativeHttp', message: `request: CF session refresh failed/cancelled for "${url}" — treating as Cloudflare session expired` })
              throw new Error('Cloudflare session expired')
            }
            AbsLogger.info({ tag: 'nativeHttp', message: `request: CF session refreshed, retrying "${url}"` })
            const retryHeaders = { ...headers, ...refreshedConfig.customHeaders }
            return CapacitorHttp.request({ method, url, data, headers: retryHeaders, ...options }).then((retryRes) => {
              // The access token may have expired along with the CF session (e.g. idle for a day) —
              // refresh it instead of failing the request with a generic error
              if (retryRes.status === 401) {
                AbsLogger.error({ tag: 'nativeHttp', message: `request: 401 for "${url}" after CF session refresh — attempting token refresh` })
                return this.handleTokenRefresh(method, url, data, retryHeaders, options, refreshedConfig)
              }
              if (retryRes.status >= 400) {
                throw httpError(retryRes)
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
     * The one place that refreshes the access token for the JS layer. Everything that needs a new
     * token (this plugin, the axios 401 handler, the user store) goes through here, so concurrent
     * 401s share a single /auth/refresh call per server. Resolves with { accessToken, refreshToken }.
     * Logs the user out (once) only when the server rejects the refresh token with a 401/403;
     * every other failure just rejects, leaving the session alone.
     * @param {{ id: string, address: string, version: string }} serverConnectionConfig
     * @param {string} [reason] - the request that needed the refresh, for the logs
     * @returns {Promise<{ accessToken: string, refreshToken: string }>}
     */
    async refreshSession(serverConnectionConfig, reason = 'a request') {
      const serverLabel = serverConnectionConfig?.name || serverConnectionConfig?.address || 'unknown'
      if (!serverConnectionConfig?.id) {
        console.error('[nativeHttp] No server connection config ID available for token refresh')
        AbsLogger.error({ tag: 'nativeHttp', message: 'handleTokenRefresh: Unable to refresh auth tokens. No server connection config ID' })
        const noConfigErr = new Error('No server connection available')
        noConfigErr.isDeadSession = true
        throw noConfigErr
      }
      const serverId = serverConnectionConfig.id

      // A logout from an earlier failed refresh is still running. Starting another refresh now
      // would use the dead token that hasn't been cleared yet and log out a second time.
      if (logoutPromise) {
        await logoutPromise
        const loggedOutErr = new Error('Logged out after a failed token refresh')
        loggedOutErr.isLoggedOut = true
        throw loggedOutErr
      }

      const recentFailure = recentTransientFailures.get(serverId)
      if (recentFailure && Date.now() - recentFailure.at < TRANSIENT_FAILURE_COOLDOWN_MS) throw recentFailure.error

      const inFlight = refreshPromises.get(serverId)
      if (inFlight) {
        // A refresh is already in flight (e.g. a burst of other requests also hit 401 at
        // the same time) — wait for that single attempt instead of racing it with our own
        // /auth/refresh call using the same (about-to-be-rotated) refresh token.
        AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Refresh already in progress for server ${serverLabel} — waiting for it before retrying "${reason}"` })
        return inFlight
      }

      console.log('[nativeHttp] Attempting to refresh token...')
      AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Attempting to refresh auth tokens for server ${serverLabel}` })

      failureHandled.delete(serverId)
      const promise = this.runRefresh(serverConnectionConfig, serverLabel)
        .catch(async (error) => {
          // Surface the failure to everyone waiting on this attempt, but only the first one to see
          // it may trigger the logout — otherwise each waiter would redirect/logout for what is
          // really one failure. A 429 and anything that isn't the server rejecting the refresh
          // token (network blip, 5xx, a CF login page) never logs out.
          if (error?.isRateLimited) throw error
          if (!error?.isDeadSession) {
            AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Refresh failed without the server rejecting the refresh token — failing the request only, not logging out` })
            recentTransientFailures.set(serverId, { at: Date.now(), error })
            throw error
          }
          if (!failureHandled.has(serverId)) {
            failureHandled.add(serverId)
            logoutPromise = this.handleRefreshFailure(serverId).finally(() => {
              logoutPromise = null
            })
            await logoutPromise
          }
          throw error
        })
        .finally(() => {
          // Only drop our own entry: a later refresh for this server may already have replaced it
          if (refreshPromises.get(serverId) === promise) refreshPromises.delete(serverId)
        })
      refreshPromises.set(serverId, promise)
      promise.then(() => recentTransientFailures.delete(serverId), () => {})
      return promise
    },

    async runRefresh(serverConnectionConfig, serverLabel) {
      // Cloudflare answers /auth/refresh with its login page (a 200 with an HTML body) when the CF
      // session has expired, which used to read as a rejected refresh token. Renew the session first.
      const refreshedConfig = await this.refreshCfSessionIfStale(serverConnectionConfig)
      const config = refreshedConfig || serverConnectionConfig

      // Get refresh token from secure storage
      let refreshToken = await $db.getRefreshToken(config.id)
      if (!refreshToken) {
        console.error('[nativeHttp] No refresh token available')
        AbsLogger.error({ tag: 'nativeHttp', message: `handleTokenRefresh: Unable to refresh auth tokens. No refresh token available for server ${serverLabel}` })
        const noTokenErr = new Error('No refresh token available')
        noTokenErr.isDeadSession = true
        throw noTokenErr
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
          const tokens = await this.refreshAccessToken(refreshToken, config)
          await this.updateTokens(tokens, config)
          return tokens
        } catch (err) {
          lastError = err
          if (err?.status === 429) {
            // Rate-limited, not invalid — never grounds for a forced logout.
            err.isRateLimited = true
            throw err
          }
          if (!err?.isDeadSession) {
            // Network error, timeout, 5xx, unparseable body, a failure saving the new tokens —
            // none of these say the refresh token is invalid, so don't go looking for a
            // rotated one; just fail this request and keep the user logged in.
            throw err
          }
          // The server rejected the refresh token (401/403). The other layer may have just
          // rotated it and still be saving the new one (the native side crosses a Keystore
          // encrypt), so poll briefly rather than judging from a single instant look.
          const latestRefreshToken = await waitForRotatedRefreshToken(config.id, refreshToken)
          if (!latestRefreshToken) {
            // Nothing changed underneath us — this is a genuinely invalid/expired token.
            throw err
          }
          AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Refresh token for server ${serverLabel} was rotated by another process mid-attempt — retrying with the fresh token` })
          refreshToken = latestRefreshToken
        }
      }
      throw lastError
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
      let newTokens
      try {
        newTokens = await this.refreshSession(serverConnectionConfig, url)
      } catch (error) {
        console.error('[nativeHttp] Token refresh failed:', error)
        AbsLogger.error({ tag: 'nativeHttp', message: `handleTokenRefresh: Token refresh failed for server ${serverConnectionConfig?.name || serverConnectionConfig?.address || 'unknown'} while handling "${url}" (error: ${error?.message || error})` })
        throw error
      }

      AbsLogger.info({ tag: 'nativeHttp', message: `handleTokenRefresh: Successfully refreshed auth tokens for server ${serverConnectionConfig.name || serverConnectionConfig.address}, retrying "${url}"` })

      // Retry the original request with the new token. This is deliberately NOT inside the
      // try/catch above: a 401 here means the token we JUST confirmed was valid got invalidated
      // again in the moments between the refresh response and this retry landing — e.g. the
      // native Kotlin layer (ApiHandler.kt) won its own independent refresh for the same server
      // a beat later and rotated the token out from under us. That's a transient race, not proof
      // the session is dead, so it must never trigger handleRefreshFailure/logout — the refresh
      // itself just succeeded. Every other request queued on this same refreshPromise retries
      // with the same token and could hit the same transient 401; each one surfaces its own
      // failure to its caller (who can just retry) instead of one of them nuking the session
      // for all of them.
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
        AbsLogger.error({ tag: 'nativeHttp', message: `handleTokenRefresh: Retry of "${url}" failed with status ${retryResponse.status} after a successful token refresh — not logging out, this looks like a transient post-refresh race` })
        throw httpError(retryResponse)
      }

      return retryResponse.data
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
        // Only 401/403 means the server rejected the refresh token itself
        err.isDeadSession = response.status === 401 || response.status === 403
        throw err
      }

      const userResponseData = response.data
      if (!userResponseData?.user?.accessToken) {
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

        // The access token is good as soon as the server issued it, so make it available to the
        // store even if saving it to secure storage fails below
        store.commit('user/setAccessToken', tokens.accessToken)

        // Build on the current store config when it's the same server: the config captured when
        // the request started can be older (e.g. hold a CF cookie that has since been renewed)
        const currentConfig = store.state.user.serverConnectionConfig
        const baseConfig = currentConfig?.id === serverConnectionConfig.id ? currentConfig : serverConnectionConfig

        // Update the config with new tokens
        const updatedConfig = {
          ...baseConfig,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }

        // Save updated config to secure storage, persists refresh token in secure storage
        const savedConfig = await $db.setServerConnectionConfig(updatedConfig)

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
          window.location.href = '/connect?error=refreshTokenFailed&serverConnectionConfigId=' + (serverConnectionConfigId || '')
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
