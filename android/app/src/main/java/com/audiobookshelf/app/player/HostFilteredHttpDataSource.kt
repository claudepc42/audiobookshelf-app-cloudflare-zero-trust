package com.audiobookshelf.app.player

import android.net.Uri
import com.audiobookshelf.app.data.ServerConnectionConfig
import com.google.android.exoplayer2.upstream.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * DataSource.Factory for streaming from the ABS server. Everything is read when each request opens,
 * not when playback starts, so a CF cookie or access token that was refreshed during a long stream
 * is picked up by the next range or segment request.
 *
 * - The access token goes only to the server's own hosts (primary and LAN address), never to a CDN or
 *   any other host a stream happens to point at.
 * - The custom headers (CF cookie, service tokens) go only to the primary host: Cloudflare is not in
 *   front of the LAN address, so they would just be exposed there.
 */
class HostFilteredHttpDataSourceFactory(
  private val configSupplier: () -> ServerConnectionConfig?,
  private val tokenSupplier: () -> String
) : HttpDataSource.Factory {

  private val baseFactory = DefaultHttpDataSource.Factory()

  override fun createDataSource(): HttpDataSource {
    return HostFilteredHttpDataSource(configSupplier, tokenSupplier, baseFactory.createDataSource())
  }

  override fun setDefaultRequestProperties(defaultRequestProperties: Map<String, String>): HttpDataSource.Factory {
    baseFactory.setDefaultRequestProperties(defaultRequestProperties)
    return this
  }
}

class HostFilteredHttpDataSource(
  private val configSupplier: () -> ServerConnectionConfig?,
  private val tokenSupplier: () -> String,
  private val delegate: DefaultHttpDataSource
) : HttpDataSource {

  // Header names set by the previous open(), so a data source reused for a different host starts clean
  private var appliedHeaderNames: Set<String> = emptySet()

  private fun hostOf(address: String?): String {
    if (address.isNullOrEmpty()) return ""
    return try { Uri.parse(address).host ?: "" } catch (e: Exception) { "" }
  }

  // Same scheme, host and port. Comparing hosts alone treated a LAN address on the primary's hostname
  // (http://books.example.com:13378 next to https://books.example.com) as the primary, which sent the
  // CF cookie and service tokens over plain HTTP.
  private fun sameOrigin(uri: Uri, address: String?): Boolean {
    if (address.isNullOrEmpty()) return false
    val target = uri.toString().toHttpUrlOrNull() ?: return false
    val server = address.toHttpUrlOrNull() ?: return false
    return target.scheme == server.scheme && target.host.equals(server.host, ignoreCase = true) && target.port == server.port
  }

  override fun open(dataSpec: DataSpec): Long {
    val config = configSupplier()
    val isPrimary = sameOrigin(dataSpec.uri, config?.address)
    val isLan = !isPrimary && sameOrigin(dataSpec.uri, config?.localAddress)

    appliedHeaderNames.forEach { delegate.clearRequestProperty(it) }
    val headers: Map<String, String> = if (isPrimary) config?.customHeaders ?: emptyMap() else emptyMap()
    headers.forEach { (key, value) -> delegate.setRequestProperty(key, value) }
    appliedHeaderNames = headers.keys.toSet()

    if (isPrimary || isLan) {
      delegate.setRequestProperty("Authorization", "Bearer ${tokenSupplier()}")
    } else {
      delegate.clearRequestProperty("Authorization")
    }
    return delegate.open(dataSpec)
  }

  override fun read(buffer: ByteArray, offset: Int, length: Int) = delegate.read(buffer, offset, length)
  override fun getUri(): Uri? = delegate.uri
  override fun getResponseHeaders(): Map<String, List<String>> = delegate.responseHeaders
  override fun close() = delegate.close()
  override fun addTransferListener(transferListener: TransferListener) = delegate.addTransferListener(transferListener)
  override fun setRequestProperty(name: String, value: String) = delegate.setRequestProperty(name, value)
  override fun clearRequestProperty(name: String) = delegate.clearRequestProperty(name)
  override fun clearAllRequestProperties() = delegate.clearAllRequestProperties()
  override fun getResponseCode() = delegate.responseCode
}
