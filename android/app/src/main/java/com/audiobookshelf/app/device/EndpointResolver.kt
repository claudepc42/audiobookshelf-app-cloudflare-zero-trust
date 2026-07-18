package com.audiobookshelf.app.device

import android.util.Log
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object EndpointResolver {
  private const val tag = "EndpointResolver"
  private const val PROBE_TIMEOUT_MS = 500L

  private val jacksonMapper = jacksonObjectMapper()

  // Cached result of the last probe. Empty string means "not yet resolved".
  @Volatile var effectiveAddress: String = ""
    private set

  private val probeClient = OkHttpClient.Builder()
    .connectTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    .readTimeout(PROBE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    .followRedirects(false)
    .build()

  /**
   * Resolves the best available address for the given config and caches it.
   * Probes localAddress first; falls back to address if unreachable, unset,
   * or if whatever answered doesn't look like an audiobookshelf server.
   * Always returns synchronously — call from a background thread.
   */
  fun resolve(config: com.audiobookshelf.app.data.ServerConnectionConfig?) {
    if (config == null) {
      effectiveAddress = ""
      return
    }
    val local = config.localAddress
    if (!local.isNullOrEmpty() && probe(local)) {
      Log.d(tag, "LAN reachable and verified as ABS — using localAddress: $local")
      effectiveAddress = local
    } else {
      Log.d(tag, "Using primary address: ${config.address}")
      effectiveAddress = config.address
    }
  }

  /** Marks the current effective address as unhealthy and falls back to the primary address. */
  fun markUnhealthyAndFallback(config: com.audiobookshelf.app.data.ServerConnectionConfig?) {
    val primary = config?.address ?: return
    if (effectiveAddress != primary) {
      Log.w(tag, "Endpoint $effectiveAddress unhealthy — falling back to $primary")
      effectiveAddress = primary
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
