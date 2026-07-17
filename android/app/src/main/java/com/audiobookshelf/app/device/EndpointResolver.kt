package com.audiobookshelf.app.device

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object EndpointResolver {
  private const val tag = "EndpointResolver"
  private const val PROBE_TIMEOUT_MS = 500L

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
   * Probes localAddress first; falls back to address if unreachable or unset.
   * Always returns synchronously — call from a background thread.
   */
  fun resolve(config: com.audiobookshelf.app.data.ServerConnectionConfig?) {
    if (config == null) {
      effectiveAddress = ""
      return
    }
    val local = config.localAddress
    if (!local.isNullOrEmpty() && probe(local)) {
      Log.d(tag, "LAN reachable — using localAddress: $local")
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

  /** Returns true if the address responds to a HEAD /status within the probe timeout. */
  private fun probe(address: String): Boolean {
    return try {
      val request = Request.Builder().url("$address/status").head().build()
      val response = probeClient.newCall(request).execute()
      response.close()
      true // any response (including 401/404) means server is reachable
    } catch (e: Exception) {
      Log.d(tag, "Probe failed for $address: ${e.message}")
      false
    }
  }
}
