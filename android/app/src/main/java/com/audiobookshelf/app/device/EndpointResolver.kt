package com.audiobookshelf.app.device

import android.util.Log
import com.audiobookshelf.app.data.ServerConnectionConfig
import com.audiobookshelf.app.plugins.AbsLogger
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

object EndpointResolver {
  private const val tag = "EndpointResolver"
  private const val PROBE_TIMEOUT_MS = 1000L

  // A resolve that finishes within this long of the last one for the same server reuses its result.
  // Resolves are triggered from config saves, network changes, the app returning to the foreground
  // and the drawer, so they often arrive in bunches.
  private const val RESOLVE_REUSE_MS = 3000L

  private val jacksonMapper = jacksonObjectMapper()

  // Cached result of the last probe. Empty string means "not yet resolved".
  @Volatile var effectiveAddress: String = ""
    private set

  // Which server [effectiveAddress] was resolved for. The result only applies to that server:
  // Android Auto, logout and a native refresh failure all change the active config without
  // resolving again, and the other server's LAN address must never receive this one's credentials.
  @Volatile private var resolvedForConfigId: String? = null
  @Volatile private var resolvedKey: String = ""
  @Volatile private var resolvedAt: Long = 0L
  private val resolveLock = Any()

  private val probeClient = OkHttpClient.Builder()
    .connectTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    .readTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    .followRedirects(false)
    .build()

  private fun keyOf(config: ServerConnectionConfig) = "${config.id}|${config.address}|${config.localAddress ?: ""}"

  /**
   * The address native code should use for [config]: the LAN address only if that's what was
   * resolved for this same server, otherwise its primary address.
   */
  fun addressFor(config: ServerConnectionConfig?): String {
    if (config == null) return ""
    val effective = effectiveAddress
    return if (resolvedForConfigId == config.id && effective.isNotEmpty()) effective else config.address
  }

  fun isUsingLan(config: ServerConnectionConfig?): Boolean {
    val local = config?.localAddress
    return !local.isNullOrEmpty() && addressFor(config) == local
  }

  /** True if nothing has been resolved yet for this server's current addresses */
  fun needsResolve(config: ServerConnectionConfig?): Boolean {
    return config != null && resolvedKey != keyOf(config)
  }

  /**
   * Resolves the best available address for the given config and caches it.
   * Probes localAddress first; falls back to address if unreachable, unset,
   * or if whatever answered doesn't look like an audiobookshelf server.
   * Always returns synchronously — call from a background thread. Concurrent calls run one at a
   * time, and one that arrives right after another for the same server reuses its result unless
   * [force] is set (a network change).
   */
  fun resolve(config: ServerConnectionConfig?, force: Boolean = false) {
    if (config == null) return
    synchronized(resolveLock) {
      val key = keyOf(config)
      if (!force && resolvedKey == key && System.currentTimeMillis() - resolvedAt < RESOLVE_REUSE_MS) return
      val local = config.localAddress
      val useLan = !local.isNullOrEmpty() && probe(local)
      setResolved(config, key, if (useLan && local != null) local else config.address)
    }
  }

  /** Marks the current effective address as unhealthy and falls back to the primary address. */
  fun markUnhealthyAndFallback(config: ServerConnectionConfig?) {
    val primary = config?.address ?: return
    if (addressFor(config) != primary) {
      Log.w(tag, "Endpoint ${addressFor(config)} unhealthy — falling back to $primary")
      setResolved(config, keyOf(config), primary)
    }
  }

  /**
   * Called when the device's default network changes (Wi-Fi to mobile data and back), including
   * while the app is in the background and JS isn't running. Mobile data can't reach a home LAN, so
   * it switches to the primary at once without a probe; anything else is probed again.
   */
  fun onNetworkChanged(config: ServerConnectionConfig?, isCellular: Boolean) {
    if (config == null || config.localAddress.isNullOrEmpty()) return
    if (isCellular) {
      markUnhealthyAndFallback(config)
    } else {
      thread(isDaemon = true) { resolve(config, force = true) }
    }
  }

  private fun setResolved(config: ServerConnectionConfig, key: String, address: String) {
    val changed = resolvedForConfigId != config.id || effectiveAddress != address
    effectiveAddress = address
    resolvedForConfigId = config.id
    resolvedKey = key
    resolvedAt = System.currentTimeMillis()
    if (changed && !config.localAddress.isNullOrEmpty()) {
      // Route changes only, and without the address itself (logs get shared)
      val route = if (address == config.localAddress) "LAN address" else "primary address (LAN not reachable or not verified)"
      AbsLogger.info(tag, "Native requests now use the $route")
    }
  }

  /**
   * Returns true only if the address responds to GET /status within the probe
   * timeout AND the response body is shaped like an audiobookshelf /status
   * response (isInit: Boolean, language: String, authMethods: List<*>).
   *
   * This is a liveness+identity check, not an authentication check — /status is
   * unauthenticated on every ABS server by design, so this deliberately does not
   * send any token or cookie. The goal is only to filter out "something answered"
   * (a printer, a router admin page, an unrelated device squatting on the same
   * IP:port on a different network) from "an actual ABS instance answered".
   * It does not, and cannot, prove the instance is *your* instance — a targeted
   * attacker who specifically stands up a fake ABS /status response at your exact
   * known LAN address is a different threat model this check is not intended to
   * cover.
   */
  private fun probe(address: String): Boolean {
    return try {
      val request = Request.Builder().url("$address/status").get().build()
      val response = probeClient.newCall(request).execute()
      val body = response.body?.string()
      response.close()

      if (response.code !in 200..299 || body.isNullOrEmpty()) {
        Log.d(tag, "Probe for $address: non-2xx or empty body, rejecting")
        return false
      }

      val node = jacksonMapper.readTree(body)
      val looksLikeAbs =
        node.has("isInit") && node.get("isInit").isBoolean &&
        node.has("language") && node.get("language").isTextual &&
        node.has("authMethods") && node.get("authMethods").isArray

      if (!looksLikeAbs) {
        Log.d(tag, "Probe for $address: response did not match ABS /status shape, rejecting")
      }
      looksLikeAbs
    } catch (e: Exception) {
      Log.d(tag, "Probe failed for $address: ${e.message}")
      false
    }
  }
}
