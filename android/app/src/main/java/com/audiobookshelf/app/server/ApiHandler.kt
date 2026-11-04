package com.audiobookshelf.app.server

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.util.Log
import com.audiobookshelf.app.data.*
import com.audiobookshelf.app.device.DeviceManager
import com.audiobookshelf.app.media.MediaEventManager
import com.audiobookshelf.app.media.MediaProgressSyncData
import com.audiobookshelf.app.media.SyncResult
import com.audiobookshelf.app.models.User
import com.audiobookshelf.app.BuildConfig
import com.audiobookshelf.app.plugins.AbsCfZeroTrust
import com.audiobookshelf.app.plugins.AbsLogger
import com.audiobookshelf.app.managers.SecureStorage
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.core.json.JsonReadFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.internal.EMPTY_REQUEST
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiHandler(var ctx:Context) {
  val tag = "ApiHandler"

  companion object {
    // For sending data back to the Webview frontend
    lateinit var absDatabaseNotifyListeners:(String, JSObject) -> Unit

    fun checkAbsDatabaseNotifyListenersInitted():Boolean {
      return ::absDatabaseNotifyListeners.isInitialized
    }

    // Guards against concurrent 401s (OkHttp callbacks run on real concurrent dispatcher threads,
    // e.g. Android Auto/media session/background sync all hitting 401 at once right after a cold
    // start) each independently racing /auth/refresh with the same refresh token. The server
    // rotates the refresh token on the first successful call, so any other concurrent call still
    // in flight gets back a 401/429 for a token that's already been rotated out — even though a
    // valid, freshly-rotated refresh token exists moments later. Serializing all concurrent 401s
    // onto one in-flight refresh avoids that spurious logout.
    //
    // Lives in the companion object (not per-instance) because ApiHandler is instantiated in
    // 4 places (AbsDatabase, AbsAudioPlayer, AbsDownloader, PlayerNotificationService) that all
    // share one refresh token — a per-instance lock let them race each other.
    private val tokenRefreshLock = Any()
    private var isRefreshingToken = false
    private data class PendingRefreshRequest(val request: Request, val httpClient: OkHttpClient?, val callback: (JSObject) -> Unit)
    private val pendingRefreshRequests = mutableListOf<PendingRefreshRequest>()

    /**
     * Returns the config's custom headers (CF cookie, service-token headers) only if [url] points
     * at the config's primary address (same scheme, host and port); otherwise null. These headers
     * only mean anything to Cloudflare, which LAN traffic never passes through, so sending them to
     * the LAN address (or whatever else answers there) is pure credential exposure.
     * Same intent as HostFilteredHttpDataSource for the player and iOS's requestTargetIsPrimaryServer.
     */
    fun customHeadersFor(url: String, config: ServerConnectionConfig?): Map<String, String>? {
      val headers = config?.customHeaders
      if (headers.isNullOrEmpty()) return null
      val primary = config?.address?.toHttpUrlOrNull() ?: return null
      val target = url.toHttpUrlOrNull() ?: return null
      val samePrimary = target.scheme == primary.scheme &&
        target.host.equals(primary.host, ignoreCase = true) &&
        target.port == primary.port
      if (!samePrimary) return null
      // OkHttp throws on an invalid header, which used to fail every request for the server.
      // Send the valid ones and skip the rest.
      val valid = headers.filter { (name, value) -> isValidHeader(name, value) }
      if (valid.size != headers.size) {
        Log.w("ApiHandler", "Skipping ${headers.size - valid.size} custom header(s) with an invalid name or value")
      }
      return valid.ifEmpty { null }
    }

    /** True if [url] points at the config's LAN address (same scheme, host and port), however the string was typed */
    fun isLanRequest(url: HttpUrl, config: ServerConnectionConfig): Boolean {
      val lan = config.localAddress?.toHttpUrlOrNull() ?: return false
      return url.scheme == lan.scheme && url.host.equals(lan.host, ignoreCase = true) && url.port == lan.port
    }

    /**
     * Rebuilds [url] against the config's primary address. Works on the parsed URL, so it doesn't
     * depend on the LAN string matching what OkHttp normalized it to, and it swaps path prefixes
     * for a primary that lives under a sub-path (https://host/audiobooks).
     */
    fun rewriteToPrimary(url: HttpUrl, config: ServerConnectionConfig): HttpUrl {
      val primary = config.address.toHttpUrlOrNull() ?: return url
      val lanPrefix = config.localAddress?.toHttpUrlOrNull()?.encodedPath?.trimEnd('/') ?: ""
      val primaryPrefix = primary.encodedPath.trimEnd('/')
      val rest = url.encodedPath.removePrefix(lanPrefix).ifEmpty { "/" }
      return url.newBuilder().scheme(primary.scheme).host(primary.host).port(primary.port).encodedPath(primaryPrefix + rest).build()
    }

    private val headerNameRegex = Regex("^[!#\$%&'*+.^_`|~0-9A-Za-z-]+\$")

    private fun isValidHeader(name: String, value: String): Boolean {
      return headerNameRegex.matches(name) && value.all { it == '\t' || it in ' '..'~' }
    }
  }

  private var defaultClient = OkHttpClient()
  private var pingClient = OkHttpClient.Builder().callTimeout(3, TimeUnit.SECONDS).build()
  private var jacksonMapper = jacksonObjectMapper().enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature())
  private var secureStorage = SecureStorage(ctx)

  // Same fallback the request builders always had: the explicitly passed config's headers if it
  // has any, otherwise the active server's — but now only for URLs on that config's primary address.
  private fun scopedCustomHeaders(url: String, config: ServerConnectionConfig?): Map<String, String>? {
    val source = if (config?.customHeaders != null) config else DeviceManager.serverConnectionConfig
    return customHeadersFor(url, source)
  }

  data class LocalSessionsSyncRequestPayload(val sessions:List<PlaybackSession>, val deviceInfo:DeviceInfo)
  @JsonIgnoreProperties(ignoreUnknown = true)
  data class LocalSessionSyncResult(val id:String, val success:Boolean, val progressSynced:Boolean?, val error:String?)
  data class LocalSessionsSyncResponsePayload(val results:List<LocalSessionSyncResult>)

  private fun getRequest(endpoint:String, httpClient:OkHttpClient?, config:ServerConnectionConfig?, cb: (JSObject) -> Unit) {
    val address = config?.address ?: DeviceManager.serverAddress
    val token = config?.token ?: DeviceManager.token
    val requestUrl = "${address}$endpoint"

    try {
      val builder = Request.Builder()
        .url(requestUrl).addHeader("Authorization", "Bearer $token")
      scopedCustomHeaders(requestUrl, config)?.forEach { (key, value) -> builder.addHeader(key, value) }
      val request = builder.build()
      makeRequest(request, httpClient, cb)
    } catch(e: Exception) {
      e.printStackTrace()
      val jsobj = JSObject()
      jsobj.put("error", "Request failed: ${e.message}")
      cb(jsobj)
    }
  }

  private fun postRequest(endpoint:String, payload: JSObject?, config:ServerConnectionConfig?, cb: (JSObject) -> Unit) {
    val address = config?.address ?: DeviceManager.serverAddress
    val token = config?.token ?: DeviceManager.token
    val mediaType = "application/json; charset=utf-8".toMediaType()
    val requestBody = payload?.toString()?.toRequestBody(mediaType) ?: EMPTY_REQUEST
    val requestUrl = "${address}$endpoint"
    Log.d(tag, "postRequest to $requestUrl")
    try {
      val builder = Request.Builder().post(requestBody)
        .url(requestUrl).addHeader("Authorization", "Bearer ${token}")
      scopedCustomHeaders(requestUrl, config)?.forEach { (key, value) -> builder.addHeader(key, value) }
      val request = builder.build()
      makeRequest(request, null, cb)
    } catch(e: Exception) {
      e.printStackTrace()
      val jsobj = JSObject()
      jsobj.put("error", "Request failed: ${e.message}")
      cb(jsobj)
    }
  }

  private fun patchRequest(endpoint:String, payload: JSObject, cb: (JSObject) -> Unit) {
    val mediaType = "application/json; charset=utf-8".toMediaType()
    val requestBody = payload.toString().toRequestBody(mediaType)
    val requestUrl = "${DeviceManager.serverAddress}$endpoint"
    try {
      val builder = Request.Builder().patch(requestBody)
        .url(requestUrl).addHeader("Authorization", "Bearer ${DeviceManager.token}")
      scopedCustomHeaders(requestUrl, null)?.forEach { (key, value) -> builder.addHeader(key, value) }
      val request = builder.build()
      makeRequest(request, null, cb)
    } catch(e: Exception) {
      e.printStackTrace()
      val jsobj = JSObject()
      jsobj.put("error", "Request failed: ${e.message}")
      cb(jsobj)
    }
  }

  // afterRefresh: this is the retry of a request that already got a fresh token from a successful
  // refresh. A 401 on it must be reported as a plain failure — refreshing again would loop, and a
  // transient 401 there must never log the user out.
  private fun makeRequest(request:Request, httpClient:OkHttpClient?, cb: (JSObject) -> Unit, isRetry: Boolean = false, afterRefresh: Boolean = false) {
    val client = httpClient ?: defaultClient

    client.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        // If using a LAN address and it just failed, fall back to the primary address and retry once
        val config = DeviceManager.serverConnectionConfig
        if (!isRetry && config != null && isLanRequest(request.url, config)) {
          Log.w(tag, "LAN request failed (${e.message}) — falling back to primary address and retrying")
          retryOnPrimaryAddress(request, config, httpClient, cb, afterRefresh)
          return
        }

        Log.d(tag, "FAILURE TO CONNECT")
        e.printStackTrace()

        val jsobj = JSObject()
        jsobj.put("error", "Failed to connect")
        cb(jsobj)
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (it.code == 401 && afterRefresh) {
            // The token was just issued by the primary server, so a 401 from the LAN address means
            // whatever is answering there isn't our server (e.g. a friend's ABS at the same LAN IP).
            // Stop using it and retry against the primary instead of failing (or re-sending
            // credentials to it on every sync).
            val lanConfig = DeviceManager.serverConnectionConfig
            if (!isRetry && lanConfig != null && isLanRequest(request.url, lanConfig)) {
              Log.w(tag, "makeRequest: LAN address rejected a freshly refreshed token — treating the LAN as untrusted and retrying on the primary address")
              AbsLogger.error(tag, "makeRequest: LAN address rejected a freshly refreshed token for server ${DeviceManager.serverConnectionConfigString} — falling back to the primary address")
              retryOnPrimaryAddress(request, lanConfig, httpClient, cb, afterRefresh)
              return
            }
            Log.e(tag, "makeRequest: 401 on retry after a successful token refresh for \"${request.url}\"")
            AbsLogger.error(tag, "makeRequest: Retry request after token refresh failed with status 401 for server ${DeviceManager.serverConnectionConfigString}")
            val jsobj = JSObject()
            jsobj.put("error", "Retry request failed with status 401")
            cb(jsobj)
            return
          }

          if (it.code == 401) {
            // Handle 401 Unauthorized by attempting token refresh
            AbsLogger.info(tag, "makeRequest: 401 Unauthorized for request to \"${request.url}\" - attempt token refresh")
            handleTokenRefresh(request, httpClient, cb)
            return
          }

          if (!it.isSuccessful) {
            val jsobj = JSObject()
            jsobj.put("error", "Unexpected code $response")
            cb(jsobj)
            return
          }

          val bodyString = it.body!!.string()
          if (bodyString == "OK") {
            cb(JSObject())
          } else {
            try {
              var jsonObj = JSObject()
              if (bodyString.startsWith("[")) {
                val array = JSArray(bodyString)
                jsonObj.put("value", array)
              } else {
                jsonObj = JSObject(bodyString)
              }
              cb(jsonObj)
            } catch(je:JSONException) {
              Log.e(tag, "Invalid JSON response ${je.localizedMessage} from body $bodyString")
              val jsobj = JSObject()
              jsobj.put("error", "Invalid response body")
              cb(jsobj)

              // A "successful" response that isn't JSON usually means a CF redirect to the
              // login page was silently followed instead of hitting the real endpoint.
              // Confirm and notify JS so the existing WebView re-auth listener can fire —
              // otherwise this fails silently with no recovery path (e.g. background sync).
              AbsCfZeroTrust.checkSessionAndNotify()
            }
          }
        }
      }
    })
  }

  /**
   * Marks the LAN address unhealthy and re-sends [request] to the primary address, once. The LAN
   * request went out without the CF headers (they're only for the primary), so they're added back.
   */
  private fun retryOnPrimaryAddress(request: Request, config: ServerConnectionConfig, httpClient: OkHttpClient?, cb: (JSObject) -> Unit, afterRefresh: Boolean) {
    com.audiobookshelf.app.device.EndpointResolver.markUnhealthyAndFallback(config)
    try {
      val newUrl = rewriteToPrimary(request.url, config).toString()
      val retryBuilder = request.newBuilder().url(newUrl)
      customHeadersFor(newUrl, config)?.forEach { (key, value) -> retryBuilder.header(key, value) }
      makeRequest(retryBuilder.build(), httpClient, cb, isRetry = true, afterRefresh = afterRefresh)
    } catch (ex: Exception) {
      val jsobj = JSObject()
      jsobj.put("error", "Failed to connect")
      cb(jsobj)
    }
  }

  /**
   * Handles token refresh when a 401 Unauthorized response is received
   * This function will:
   * 1. Get the refresh token from secure storage for the current server connection
   * 2. Make a request to /auth/refresh endpoint with the refresh token
   * 3. Update the stored tokens with the new access token
   * 4. Retry the original request with the new access token
   * 5. If refresh fails, handle logout
   *
   * @param originalRequest The original request that failed with 401
   * @param httpClient The HTTP client to use for the request
   * @param callback The callback to return the response
   */
  private fun handleTokenRefresh(originalRequest: Request, httpClient: OkHttpClient?, callback: (JSObject) -> Unit) {
    // A request sent with an old token can get its 401 back after a refresh already finished.
    // Refreshing again would rotate the token a second time (re-opening the race and burning the
    // server's rate limit) — just retry with the token we already have.
    val sentToken = originalRequest.header("Authorization")?.removePrefix("Bearer ")
    val currentToken = DeviceManager.token
    if (!sentToken.isNullOrEmpty() && currentToken.isNotEmpty() && sentToken != currentToken && isRequestForActiveServer(originalRequest)) {
      AbsLogger.info(tag, "handleTokenRefresh: 401 for a request sent with an older token than the current one — retrying with the current token instead of refreshing again (\"${originalRequest.url}\")")
      retryOriginalRequest(originalRequest, currentToken, httpClient, callback)
      return
    }

    synchronized(tokenRefreshLock) {
      if (isRefreshingToken) {
        AbsLogger.info(tag, "handleTokenRefresh: Refresh already in progress for server ${DeviceManager.serverConnectionConfigString} — queuing request to \"${originalRequest.url}\"")
        pendingRefreshRequests.add(PendingRefreshRequest(originalRequest, httpClient, callback))
        return
      }
      isRefreshingToken = true
    }

    try {
      AbsLogger.info(tag, "handleTokenRefresh: Attempting to refresh auth tokens for server ${DeviceManager.serverConnectionConfigString}")

      // Get current server connection config ID
      val serverConnectionConfigId = DeviceManager.serverConnectionConfigId
      if (serverConnectionConfigId.isEmpty()) {
        AbsLogger.error(tag, "handleTokenRefresh: Unable to refresh auth tokens. No server connection config ID")
        val errorObj = JSObject()
        errorObj.put("error", "No server connection available")
        finishTokenRefresh(null, originalRequest, httpClient, callback, errorObj)
        return
      }

      // Get refresh token from secure storage
      val refreshToken = secureStorage.getRefreshToken(serverConnectionConfigId)
      if (refreshToken.isNullOrEmpty()) {
        AbsLogger.error(tag, "handleTokenRefresh: Unable to refresh auth tokens. No refresh token available for server ${DeviceManager.serverConnectionConfigString}")
        val errorObj = JSObject()
        errorObj.put("error", "No refresh token available")
        finishTokenRefresh(null, originalRequest, httpClient, callback, errorObj)
        return
      }

      Log.d(tag, "handleTokenRefresh: Retrieved refresh token, attempting to refresh access token")

      doRefreshRequest(serverConnectionConfigId, refreshToken, originalRequest, httpClient, callback, attempt = 1)

    } catch (e: Exception) {
      // Not evidence the session is dead, so fail just this request (and release the lock)
      Log.e(tag, "handleTokenRefresh: Unexpected error during token refresh", e)
      AbsLogger.error(tag, "handleTokenRefresh: Unexpected error during token refresh for server ${DeviceManager.serverConnectionConfigString} (error: ${e.message})")
      finishTokenRefresh(null, originalRequest, httpClient, callback, transientRefreshError())
    }
  }

  private fun transientRefreshError(message: String = "Token refresh failed temporarily, please retry shortly"): JSObject {
    val errorObj = JSObject()
    errorObj.put("error", message)
    return errorObj
  }

  /** True if the request targets the active server's primary or LAN address (the one the stored token belongs to). */
  private fun isRequestForActiveServer(request: Request): Boolean {
    val config = DeviceManager.serverConnectionConfig ?: return false
    val host = request.url.host
    return listOf(config.address, config.localAddress).any { address ->
      !address.isNullOrEmpty() && address.toHttpUrlOrNull()?.host.equals(host, ignoreCase = true)
    }
  }

  /**
   * The server said our refresh token is invalid (401/403), but the JS layer may have just rotated
   * it and still be saving the new one (it crosses the Capacitor bridge and a Keystore encrypt).
   * Poll briefly for a changed token instead of declaring the session dead from a single look.
   */
  private fun waitForRotatedRefreshToken(serverConnectionConfigId: String, usedRefreshToken: String): String? {
    for (i in 0 until 6) {
      val latest = secureStorage.getRefreshToken(serverConnectionConfigId)
      if (!latest.isNullOrEmpty() && latest != usedRefreshToken) return latest
      if (i < 5) {
        try { Thread.sleep(300) } catch (e: InterruptedException) { Thread.currentThread().interrupt(); return null }
      }
    }
    return null
  }

  /**
   * Performs the actual /auth/refresh call. The JS layer (plugins/nativeHttp.js) runs its own,
   * independent single-flight refresh — a burst of 401s right after a cold start (Android
   * Auto/background sync here, Vue/webview there) can still produce one JS-side attempt and
   * one Kotlin-side attempt racing with the same pre-rotation refresh token. Whichever loses
   * that race gets a genuine 401/403 from the server even though a freshly-rotated, valid
   * refresh token already exists in the shared SecureStorage both layers read/write — detected
   * here by polling for it briefly and retrying with the fresh token instead of declaring the
   * session dead.
   *
   * Only a 401/403 from /auth/refresh means the session is dead (and logs the user out). A network
   * error, timeout, 429, 5xx or an unparseable body says nothing about the refresh token, so those
   * fail just the request(s) waiting on this refresh and leave the user logged in.
   *
   * Always goes to the primary address, never the LAN address: the LAN address could be answered
   * by a different audiobookshelf server, which would receive the refresh token (and a 401 from it
   * would look like a dead session).
   */
  private fun doRefreshRequest(serverConnectionConfigId: String, refreshToken: String, originalRequest: Request, httpClient: OkHttpClient?, callback: (JSObject) -> Unit, attempt: Int) {
    fun failTransient(logMessage: String, error: JSObject = transientRefreshError()) {
      AbsLogger.error(tag, "handleTokenRefresh: $logMessage for server ${DeviceManager.serverConnectionConfigString} — failing this request only, not logging out")
      finishTokenRefresh(null, originalRequest, httpClient, callback, error)
    }

    // The server rejected the refresh token — but the other layer may have just replaced it
    fun retryWithRotatedTokenOrFail(statusForLog: Int) {
      AbsLogger.error(tag, "handleTokenRefresh: Refresh request failed with status $statusForLog for server ${DeviceManager.serverConnectionConfigString}")
      val latestRefreshToken = waitForRotatedRefreshToken(serverConnectionConfigId, refreshToken)
      if (attempt < 2 && latestRefreshToken != null) {
        AbsLogger.info(tag, "handleTokenRefresh: Refresh token for server ${DeviceManager.serverConnectionConfigString} was rotated by another process mid-attempt — retrying with the fresh token")
        doRefreshRequest(serverConnectionConfigId, latestRefreshToken, originalRequest, httpClient, callback, attempt = attempt + 1)
        return
      }
      finishTokenRefresh(null, originalRequest, httpClient, callback, null)
    }

    val client = httpClient ?: defaultClient
    try {
      val config = DeviceManager.serverConnectionConfig
      val refreshEndpoint = "${config?.address ?: DeviceManager.serverAddress}/auth/refresh"
      val refreshBuilder = Request.Builder()
        .url(refreshEndpoint)
        .addHeader("x-refresh-token", refreshToken)
        .addHeader("Content-Type", "application/json")
      customHeadersFor(refreshEndpoint, config)?.forEach { (key, value) -> refreshBuilder.addHeader(key, value) }
      val refreshRequest = refreshBuilder.post(EMPTY_REQUEST).build()

      client.newCall(refreshRequest).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          Log.e(tag, "handleTokenRefresh: Failed to connect to refresh endpoint", e)
          failTransient("Failed to connect to refresh endpoint (error: ${e.message})")
        }

        override fun onResponse(call: Call, response: Response) {
          response.use {
            if (!it.isSuccessful) {
              when (it.code) {
                401, 403 -> retryWithRotatedTokenOrFail(it.code)
                429 -> failTransient("Refresh request rate-limited (429)", transientRefreshError("Rate limited, please retry shortly"))
                else -> failTransient("Refresh request failed with status ${it.code}")
              }
              return
            }

            // A connection dropping while the body is read must not leave the lock held
            val bodyString = try {
              it.body!!.string()
            } catch (e: Exception) {
              Log.e(tag, "handleTokenRefresh: Failed to read refresh response", e)
              failTransient("Failed to read refresh response (error: ${e.message})")
              return
            }

            // A 200 that isn't the expected JSON is usually a CF login page, not a dead session
            val newTokens = try {
              val userObj = JSONObject(bodyString).optJSONObject("user")
              val newAccessToken = userObj?.optString("accessToken") ?: ""
              if (newAccessToken.isEmpty()) null else Pair(newAccessToken, userObj!!.optString("refreshToken"))
            } catch (e: Exception) {
              Log.e(tag, "handleTokenRefresh: Failed to parse refresh response", e)
              null
            }
            if (newTokens == null) {
              failTransient("No access token in refresh response")
              return
            }

            Log.d(tag, "handleTokenRefresh: Successfully obtained new access token")

            // Update tokens in secure storage and device manager
            updateTokens(newTokens.first, newTokens.second.ifEmpty { refreshToken }, serverConnectionConfigId)

            // Retry this request and every request that queued up while this refresh was in flight
            Log.d(tag, "handleTokenRefresh: Retrying original request with new token")
            finishTokenRefresh(newTokens.first, originalRequest, httpClient, callback, null)
          }
        }
      })
    } catch (e: Exception) {
      // Bad URL/header etc. Runs inside an OkHttp callback on the 2nd attempt, where an uncaught
      // exception would crash the app or leave the refresh lock held forever.
      Log.e(tag, "handleTokenRefresh: Unexpected error starting refresh request", e)
      failTransient("Unexpected error starting refresh request (error: ${e.message})")
    }
  }

  /**
   * Resolves the leader's own callback plus every request that queued up while this refresh
   * was in flight — either by retrying them all with the new access token, or by failing them
   * all together (logging out exactly once, not once per queued request) if it didn't succeed.
   *
   * @param newAccessToken The new access token, or null if the refresh failed
   * @param explicitError A specific error to fail the waiting requests with, WITHOUT logging out
   *   (used whenever the failure isn't proof the session is dead: early exits that never reached
   *   the server, network errors, 429, 5xx, unparseable replies). Null means the server rejected
   *   the refresh token (401/403), which logs the user out.
   */
  private fun finishTokenRefresh(newAccessToken: String?, originalRequest: Request, httpClient: OkHttpClient?, callback: (JSObject) -> Unit, explicitError: JSObject?) {
    val queued: List<PendingRefreshRequest>
    synchronized(tokenRefreshLock) {
      queued = pendingRefreshRequests.toList()
      pendingRefreshRequests.clear()
      isRefreshingToken = false
    }

    if (newAccessToken != null) {
      retryOriginalRequest(originalRequest, newAccessToken, httpClient, callback)
      queued.forEach { retryOriginalRequest(it.request, newAccessToken, it.httpClient, it.callback) }
    } else if (explicitError != null) {
      callback(explicitError)
      queued.forEach { it.callback(explicitError) }
    } else {
      handleRefreshFailure(callback)
      queued.forEach { pending ->
        val errorObj = JSObject()
        errorObj.put("error", "Authentication failed - please login again")
        pending.callback(errorObj)
      }
    }
  }

  /**
   * Updates the stored tokens with new access and refresh tokens
   *
   * @param newAccessToken The new access token
   * @param newRefreshToken The new refresh token (or existing one if not provided)
   */
  private fun updateTokens(newAccessToken: String, newRefreshToken: String, serverConnectionConfigId: String) {
    try {
      // Update the refresh token in secure storage if it's new
      if (newRefreshToken != secureStorage.getRefreshToken(serverConnectionConfigId)) {
        secureStorage.storeRefreshToken(serverConnectionConfigId, newRefreshToken)
        Log.d(tag, "updateTokens: Updated refresh token in secure storage")
      }

      // Update the access token in the current server connection config
      DeviceManager.serverConnectionConfig?.let { config ->
        config.token = newAccessToken
        DeviceManager.dbManager.saveDeviceData(DeviceManager.deviceData)
        Log.d(tag, "updateTokens: Updated access token in server connection config")
      }

      // Send access token to Webview frontend
      if (checkAbsDatabaseNotifyListenersInitted()) {
        val tokenJsObject = JSObject()
        tokenJsObject.put("accessToken", newAccessToken)
        absDatabaseNotifyListeners("onTokenRefresh", tokenJsObject)
      } else {
        // Can happen if Webview is never run
        Log.i(tag, "AbsDatabaseNotifyListeners is not initialized so cannot send new access token")
      }
      AbsLogger.info(tag, "updateTokens: Successfully refreshed auth tokens for server ${DeviceManager.serverConnectionConfigString}")
    } catch (e: Exception) {
      Log.e(tag, "updateTokens: Failed to update tokens", e)
      AbsLogger.error(tag, "updateTokens: Failed to refresh auth tokens for server ${DeviceManager.serverConnectionConfigString} (error: ${e.message})")
    }
  }

  /**
   * Retries the original request with the new access token. Goes through makeRequest so it gets
   * the same JSON handling and LAN->primary fallback as any other request, but with afterRefresh
   * set so a 401 here is a plain failure (no second refresh, never a logout).
   *
   * @param originalRequest The original request to retry
   * @param newAccessToken The new access token to use
   * @param httpClient The HTTP client to use
   * @param callback The callback to return the response
   */
  private fun retryOriginalRequest(originalRequest: Request, newAccessToken: String, httpClient: OkHttpClient?, callback: (JSObject) -> Unit) {
    try {
      // Create a new request with the updated authorization header
      val newRequest = originalRequest.newBuilder()
        .removeHeader("Authorization")
        .addHeader("Authorization", "Bearer $newAccessToken")
        .build()

      Log.d(tag, "retryOriginalRequest: Retrying request to ${newRequest.url}")
      makeRequest(newRequest, httpClient, callback, afterRefresh = true)
    } catch (e: Exception) {
      Log.e(tag, "retryOriginalRequest: Unexpected error during retry", e)
      AbsLogger.error(tag, "retryOriginalRequest: Unexpected error during retry for server ${DeviceManager.serverConnectionConfigString}")
      val errorObj = JSObject()
      errorObj.put("error", "Failed to retry request")
      callback(errorObj)
    }
  }

  /**
   * Handles the case when token refresh fails
   * This will clear the current session and notify the callback
   *
   * @param callback The callback to return the error
   */
  private fun handleRefreshFailure(callback: (JSObject) -> Unit) {
    try {
      Log.d(tag, "handleRefreshFailure: Token refresh failed, clearing session")

      // Read the id first — clearing the connection below makes this getter return ""
      val serverConnectionConfigId = DeviceManager.serverConnectionConfigId

      // Clear the current server connection
      DeviceManager.serverConnectionConfig = null
      DeviceManager.deviceData.lastServerConnectionConfigId = null
      DeviceManager.dbManager.saveDeviceData(DeviceManager.deviceData)

      // Remove refresh token from secure storage
      if (serverConnectionConfigId.isNotEmpty()) {
        secureStorage.removeRefreshToken(serverConnectionConfigId)
      }

      val errorObj = JSObject()
      errorObj.put("error", "Authentication failed - please login again")
      callback(errorObj)

      if (checkAbsDatabaseNotifyListenersInitted()) {
        val tokenJsObject = JSObject()
        tokenJsObject.put("error", "Token refresh failed")
        if (serverConnectionConfigId.isNotEmpty()) {
          tokenJsObject.put("serverConnectionConfigId", serverConnectionConfigId)
        }
        absDatabaseNotifyListeners("onTokenRefreshFailure", tokenJsObject)
      } else {
        // Can happen if Webview is never run
        Log.i(tag, "AbsDatabaseNotifyListeners is not initialized so cannot send token refresh failure notification")
      }
    } catch (e: Exception) {
      Log.e(tag, "handleRefreshFailure: Error during failure handling", e)
      val errorObj = JSObject()
      errorObj.put("error", "Authentication failed")
      callback(errorObj)
    }
  }

  fun getCurrentUser(cb: (User?) -> Unit) {
    getRequest("/api/me", null, null) {
      if (it.has("error")) {
        Log.e(tag, it.getString("error") ?: "getCurrentUser Failed")
        cb(null)
      } else {
        val user = jacksonMapper.readValue<User>(it.toString())
        cb(user)
      }
    }
  }

  fun getLibraries(cb: (List<Library>) -> Unit) {
    val mapper = jacksonMapper
    getRequest("/api/libraries?include=stats", null,null) {
      val libraries = mutableListOf<Library>()

      var array = JSONArray()
      if (it.has("libraries")) { // TODO: Server 2.2.9 changed to this
        array = it.getJSONArray("libraries")
      } else if (it.has("value")) {
        array = it.getJSONArray("value")
      }

      for (i in 0 until array.length()) {
        libraries.add(mapper.readValue(array.get(i).toString()))
      }
      cb(libraries)
    }
  }

  fun getLibraryPersonalized(libraryItemId:String, cb: (List<LibraryShelfType>?) -> Unit) {
    getRequest("/api/libraries/$libraryItemId/personalized", null, null) {
      if (it.has("error")) {
        Log.e(tag, it.getString("error") ?: "getLibraryStats Failed")
        cb(null)
      } else {
        val items = mutableListOf<LibraryShelfType>()
        val array = it.getJSONArray("value")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibraryShelfType>(array.get(i).toString())
          items.add(item)
        }
        cb(items)
      }
    }
  }

  fun getLibraryItem(libraryItemId:String, cb: (LibraryItem?) -> Unit) {
    getRequest("/api/items/$libraryItemId?expanded=1", null, null) {
      if (it.has("error")) {
        Log.e(tag, it.getString("error") ?: "getLibraryItem Failed")
        cb(null)
      } else {
        val libraryItem = jacksonMapper.readValue<LibraryItem>(it.toString())
        cb(libraryItem)
      }
    }
  }

  fun getLibraryItemWithProgress(libraryItemId:String, episodeId:String?, cb: (LibraryItem?) -> Unit) {
    var requestUrl = "/api/items/$libraryItemId?expanded=1&include=progress"
    if (!episodeId.isNullOrEmpty()) requestUrl += "&episode=$episodeId"
    getRequest(requestUrl, null, null) {
      if (it.has("error")) {
        Log.e(tag, it.getString("error") ?: "getLibraryItemWithProgress Failed")
        cb(null)
      } else {
        val libraryItem = jacksonMapper.readValue<LibraryItem>(it.toString())
        cb(libraryItem)
      }
    }
  }

  fun getLibraryItems(libraryId:String, cb: (List<LibraryItem>) -> Unit) {
    getRequest("/api/libraries/$libraryId/items?limit=100&minified=1", null, null) {
      val items = mutableListOf<LibraryItem>()
      if (it.has("results")) {
        val array = it.getJSONArray("results")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibraryItem>(array.get(i).toString())
          items.add(item)
        }
      }
      cb(items)
    }
  }

  fun getLibrarySeries(libraryId:String, cb: (List<LibrarySeriesItem>) -> Unit) {
    Log.d(tag, "Getting series")
    getRequest("/api/libraries/$libraryId/series?minified=1&sort=name&limit=10000", null, null) {
      val items = mutableListOf<LibrarySeriesItem>()
      if (it.has("results")) {
        val array = it.getJSONArray("results")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibrarySeriesItem>(array.get(i).toString())
          items.add(item)
        }
      }
      cb(items)
    }
  }

  fun getLibrarySeriesItems(libraryId:String, seriesId:String, cb: (List<LibraryItem>) -> Unit) {
    Log.d(tag, "Getting items for series")
    val seriesIdBase64 = Base64.encodeToString(seriesId.toByteArray(), Base64.DEFAULT)
    getRequest("/api/libraries/$libraryId/items?minified=1&sort=media.metadata.title&filter=series.${seriesIdBase64}&limit=1000", null, null) {
      val items = mutableListOf<LibraryItem>()
      if (it.has("results")) {
        val array = it.getJSONArray("results")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibraryItem>(array.get(i).toString())
          items.add(item)
        }
      }
      cb(items)
    }
  }

  fun getLibraryAuthors(libraryId:String, cb: (List<LibraryAuthorItem>) -> Unit) {
    Log.d(tag, "Getting series")
    getRequest("/api/libraries/$libraryId/authors", null, null) {
      val items = mutableListOf<LibraryAuthorItem>()
      if (it.has("authors")) {
        val array = it.getJSONArray("authors")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibraryAuthorItem>(array.get(i).toString())
          items.add(item)
        }
      }else{
        Log.e(tag, "No results")
      }
      cb(items)
    }
  }

  fun getLibraryItemsFromAuthor(libraryId:String, authorId:String, cb: (List<LibraryItem>) -> Unit) {
    Log.d(tag, "Getting author items")
    val authorIdBase64 = Base64.encodeToString(authorId.toByteArray(), Base64.DEFAULT)
    getRequest("/api/libraries/$libraryId/items?limit=1000&minified=1&filter=authors.${authorIdBase64}&sort=media.metadata.title&collapseseries=1", null, null) {
      val items = mutableListOf<LibraryItem>()
      if (it.has("results")) {
        val array = it.getJSONArray("results")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibraryItem>(array.get(i).toString())
          if (item.collapsedSeries != null) {
            item.collapsedSeries?.libraryId = libraryId
          }
          items.add(item)
        }
      }else{
        Log.e(tag, "No results")
      }
      cb(items)
    }
  }

  fun getLibraryCollections(libraryId:String, cb: (List<LibraryCollection>) -> Unit) {
    Log.d(tag, "Getting collections")
    getRequest("/api/libraries/$libraryId/collections?minified=1&sort=name&limit=1000", null, null) {
      val items = mutableListOf<LibraryCollection>()
      if (it.has("results")) {
        val array = it.getJSONArray("results")
        for (i in 0 until array.length()) {
          val item = jacksonMapper.readValue<LibraryCollection>(array.get(i).toString())
          items.add(item)
        }
      }
      cb(items)
    }
  }

  fun getSearchResults(libraryId:String, queryString:String, cb: (LibraryItemSearchResultType?) -> Unit) {
    Log.d(tag, "Doing search for library $libraryId")
    getRequest("/api/libraries/$libraryId/search?q=$queryString", null, null) {
      if (it.has("error")) {
        Log.e(tag, it.getString("error") ?: "getSearchResults Failed")
        cb(null)
      } else {
        val librarySearchResults = jacksonMapper.readValue<LibraryItemSearchResultType>(it.toString())
        cb(librarySearchResults)
      }
    }
  }

  fun getAllItemsInProgress(cb: (List<ItemInProgress>) -> Unit) {
    getRequest("/api/me/items-in-progress", null, null) {
      val items = mutableListOf<ItemInProgress>()
      if (it.has("libraryItems")) {
        val array = it.getJSONArray("libraryItems")
        for (i in 0 until array.length()) {
          val jsobj = array.get(i) as JSONObject
          val itemInProgress = ItemInProgress.makeFromServerObject(jsobj, jacksonMapper)
          items.add(itemInProgress)
        }
      }
      cb(items)
    }
  }

  fun playLibraryItem(libraryItemId:String, episodeId:String?, playItemRequestPayload:PlayItemRequestPayload, cb: (PlaybackSession?) -> Unit) {
    val payload = JSObject(jacksonMapper.writeValueAsString(playItemRequestPayload))

    val endpoint = if (episodeId.isNullOrEmpty()) "/api/items/$libraryItemId/play" else "/api/items/$libraryItemId/play/$episodeId"
    postRequest(endpoint, payload, null) {
      if (it.has("error")) {
        Log.e(tag, it.getString("error") ?: "Play Library Item Failed")
        cb(null)
      } else {
        it.put("serverConnectionConfigId", DeviceManager.serverConnectionConfig?.id)
        it.put("serverAddress", DeviceManager.serverAddress)
        val playbackSession = jacksonMapper.readValue<PlaybackSession>(it.toString())
        cb(playbackSession)
      }
    }
  }

  fun sendProgressSync(sessionId:String, syncData: MediaProgressSyncData, cb: (Boolean, String?) -> Unit) {
    val payload = JSObject(jacksonMapper.writeValueAsString(syncData))

    postRequest("/api/session/$sessionId/sync", payload, null) {
      if (!it.getString("error").isNullOrEmpty()) {
        cb(false, it.getString("error"))
      } else {
        cb(true, null)
      }
    }
  }

  fun sendLocalProgressSync(playbackSession:PlaybackSession, cb: (Boolean, String?) -> Unit) {
    val payload = JSObject(jacksonMapper.writeValueAsString(playbackSession))

    postRequest("/api/session/local", payload, null) {
      if (!it.getString("error").isNullOrEmpty()) {
        cb(false, it.getString("error"))
      } else {
        cb(true, null)
      }
    }
  }

  fun updateMediaProgress(libraryItemId:String,episodeId:String?,updatePayload:JSObject, cb: () -> Unit) {
    Log.d(tag, "updateMediaProgress $libraryItemId $episodeId $updatePayload")
    val endpoint = if(episodeId.isNullOrEmpty()) "/api/me/progress/$libraryItemId" else "/api/me/progress/$libraryItemId/$episodeId"
    patchRequest(endpoint,updatePayload) {
      Log.d(tag, "updateMediaProgress patched progress")
      cb()
    }
  }

  fun getMediaProgress(libraryItemId:String, episodeId:String?, serverConnectionConfig:ServerConnectionConfig?, cb: (MediaProgress?) -> Unit) {
    val endpoint = if(episodeId.isNullOrEmpty()) "/api/me/progress/$libraryItemId" else "/api/me/progress/$libraryItemId/$episodeId"

    // TODO: Using ping client here allows for shorter timeout (3 seconds), maybe rename or make diff client for requests requiring quicker response
    getRequest(endpoint, pingClient, serverConnectionConfig) {
      if (it.has("error")) {
        Log.e(tag, "getMediaProgress: Failed to get progress")
        cb(null)
      } else {
        val progress = jacksonMapper.readValue<MediaProgress>(it.toString())
        cb(progress)
      }
    }
  }

  fun getPlaybackSession(playbackSessionId:String, cb: (PlaybackSession?) -> Unit) {
    Log.d(tag, "getPlaybackSession for $playbackSessionId for server ${DeviceManager.serverAddress}")
    val endpoint = "/api/session/$playbackSessionId"
    getRequest(endpoint, null, null) {
      val err = it.getString("error")
      if (!err.isNullOrEmpty()) {
        cb(null)
      } else {
        cb(jacksonMapper.readValue<PlaybackSession>(it.toString()))
      }
    }
  }

  fun pingServer(config:ServerConnectionConfig, cb: (Boolean) -> Unit) {
    Log.d(tag, "pingServer: Pinging ${config.address}")
    getRequest("/ping", pingClient, config) {
      val success = it.getString("success")
      if (success.isNullOrEmpty()) {
        Log.d(tag, "pingServer: Ping ${config.address} Failed")
        cb(false)
      } else {
        Log.d(tag, "pingServer: Ping ${config.address} Successful")
        cb(true)
      }
    }
  }

  fun closePlaybackSession(playbackSessionId:String, config:ServerConnectionConfig?, cb: (Boolean) -> Unit) {
    Log.d(tag, "closePlaybackSession: playbackSessionId=$playbackSessionId")
    postRequest("/api/session/$playbackSessionId/close", null, config) {
      cb(true)
    }
  }

  fun authorize(config:ServerConnectionConfig, cb: (MutableList<MediaProgress>?) -> Unit) {
    Log.d(tag, "authorize: Authorizing ${config.address}")
    postRequest("/api/authorize", JSObject(), config) {
      val error = it.getString("error")
      if (!error.isNullOrEmpty()) {
        Log.d(tag, "authorize: Authorize ${config.address} Failed: $error")
        cb(null)
      } else {
        val mediaProgressList:MutableList<MediaProgress> = mutableListOf()
        val user = it.getJSObject("user")
        val mediaProgress = user?.getJSONArray("mediaProgress") ?: JSONArray()
        for (i in 0 until mediaProgress.length()) {
          val mediaProg = jacksonMapper.readValue<MediaProgress>(mediaProgress.getJSONObject(i).toString())
          mediaProgressList.add(mediaProg)
        }
        Log.d(tag, "authorize: Authorize ${config.address} Successful")
        cb(mediaProgressList)
      }
    }
  }

  fun sendSyncLocalSessions(playbackSessions:List<PlaybackSession>, cb: (Boolean, String?) -> Unit) {
    @SuppressLint("HardwareIds")
    val deviceId = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID)
    val deviceInfo = DeviceInfo(deviceId, Build.MANUFACTURER, Build.MODEL, Build.VERSION.SDK_INT, BuildConfig.VERSION_NAME)

    val payload = JSObject(jacksonMapper.writeValueAsString(LocalSessionsSyncRequestPayload(playbackSessions, deviceInfo)))
    AbsLogger.info("ApiHandler", "sendSyncLocalSessions: Sending ${playbackSessions.size} saved local playback sessions to server (${DeviceManager.serverConnectionConfigName})")

    postRequest("/api/session/local-all", payload, null) {
      if (!it.getString("error").isNullOrEmpty()) {
        AbsLogger.error("ApiHandler", "sendSyncLocalSessions: Failed to sync local sessions. (${it.getString("error")})")
        cb(false, it.getString("error"))
      } else {
        val response = jacksonMapper.readValue<LocalSessionsSyncResponsePayload>(it.toString())
        response.results.forEach { localSessionSyncResult ->
          Log.d(tag, "Synced session result ${localSessionSyncResult.id}|${localSessionSyncResult.progressSynced}|${localSessionSyncResult.success}")

          playbackSessions.find { ps -> ps.id == localSessionSyncResult.id }?.let { session ->
            if (localSessionSyncResult.progressSynced == true) {
              val syncResult = SyncResult(true, true, "Progress synced on server")
              MediaEventManager.saveEvent(session, syncResult)

              AbsLogger.info("ApiHandler", "sendSyncLocalSessions: Synced session \"${session.displayTitle}\" with server, server progress was updated for item ${session.mediaItemId}")
            } else if (!localSessionSyncResult.success) {
              AbsLogger.error("ApiHandler", "sendSyncLocalSessions: Failed to sync session \"${session.displayTitle}\" with server. Error: ${localSessionSyncResult.error}")
            } else {
              AbsLogger.info("ApiHandler", "sendSyncLocalSessions: Synced session \"${session.displayTitle}\" with server. Server progress was up-to-date for item ${session.mediaItemId}")
            }
          }
        }
        cb(true, null)
      }
    }
  }

  fun syncLocalMediaProgressForUser(cb: () -> Unit) {
    AbsLogger.info("ApiHandler", "[ApiHandler] syncLocalMediaProgressForUser: Server connection ${DeviceManager.serverConnectionConfigName}")

    // Get all local media progress for this server
    val allLocalMediaProgress = DeviceManager.dbManager.getAllLocalMediaProgress().filter { it.serverConnectionConfigId == DeviceManager.serverConnectionConfigId }
    if (allLocalMediaProgress.isEmpty()) {
      AbsLogger.info("ApiHandler", "[ApiHandler] syncLocalMediaProgressForUser: No local media progress to sync")
      return cb()
    }

    AbsLogger.info("ApiHandler", "syncLocalMediaProgressForUser: Found ${allLocalMediaProgress.size} local media progress")

    getCurrentUser { user ->
      if (user == null) {
        AbsLogger.error("ApiHandler", "syncLocalMediaProgressForUser: Failed to load user from server (${DeviceManager.serverConnectionConfigName})")
      } else {
        var numLocalMediaProgressUptToDate = 0
        var numLocalMediaProgressUpdated = 0

        // Compare server user progress with local progress
        user.mediaProgress.forEach { mediaProgress ->
          // Get matching local media progress
          allLocalMediaProgress.find { it.isMatch(mediaProgress) }?.let { localMediaProgress ->
            if (mediaProgress.lastUpdate > localMediaProgress.lastUpdate) {
              val updateLogs = mutableListOf<String>()
              if (mediaProgress.progress != localMediaProgress.progress) {
                updateLogs.add("Updated progress from ${localMediaProgress.progress} to ${mediaProgress.progress}")
              }
              if (mediaProgress.currentTime != localMediaProgress.currentTime) {
                updateLogs.add("Updated currentTime from ${localMediaProgress.currentTime} to ${mediaProgress.currentTime}")
              }
              if (mediaProgress.isFinished != localMediaProgress.isFinished) {
                updateLogs.add("Updated isFinished from ${localMediaProgress.isFinished} to ${mediaProgress.isFinished}")
              }
              if (mediaProgress.ebookProgress != localMediaProgress.ebookProgress) {
                updateLogs.add("Updated ebookProgress from ${localMediaProgress.isFinished} to ${mediaProgress.isFinished}")
              }
              if (updateLogs.isNotEmpty()) {
                AbsLogger.info("ApiHandler", "syncLocalMediaProgressForUser: Server progress for item \"${mediaProgress.mediaItemId}\" is more recent than local (server lastUpdate=${mediaProgress.lastUpdate}, local lastUpdate=${localMediaProgress.lastUpdate}). ${updateLogs.joinToString()}")
              }

              localMediaProgress.updateFromServerMediaProgress(mediaProgress)

              // Only report sync if progress changed
              if (updateLogs.isNotEmpty()) {
                MediaEventManager.syncEvent(mediaProgress, "Sync on server connection")
              }
              DeviceManager.dbManager.saveLocalMediaProgress(localMediaProgress)
              numLocalMediaProgressUpdated++
            } else if (localMediaProgress.lastUpdate > mediaProgress.lastUpdate && localMediaProgress.ebookLocation != null && localMediaProgress.ebookLocation != mediaProgress.ebookLocation) {
              // Patch ebook progress to server
              AbsLogger.info("ApiHandler", "syncLocalMediaProgressForUser: Local progress for ebook item \"${mediaProgress.mediaItemId}\" is more recent than server progress. Local progress last updated ${localMediaProgress.lastUpdate}, server progress last updated ${mediaProgress.lastUpdate}. Sending server request to update ebook progress from ${mediaProgress.ebookProgress} to ${localMediaProgress.ebookProgress}")
              val endpoint = "/api/me/progress/${localMediaProgress.libraryItemId}"
              val updatePayload = JSObject()
              updatePayload.put("ebookLocation", localMediaProgress.ebookLocation)
              updatePayload.put("ebookProgress", localMediaProgress.ebookProgress)
              updatePayload.put("lastUpdate", localMediaProgress.lastUpdate)
              patchRequest(endpoint,updatePayload) {
                AbsLogger.info("ApiHandler", "syncLocalMediaProgressForUser: Successfully updated server ebook progress for item item \"${mediaProgress.mediaItemId}\"")
              }
            } else {
              numLocalMediaProgressUptToDate++
            }
          }
        }

        AbsLogger.info("ApiHandler", "syncLocalMediaProgressForUser: Finishing syncing local media progress with server. $numLocalMediaProgressUptToDate up-to-date, $numLocalMediaProgressUpdated updated")
      }
      cb()
    }
  }
}
