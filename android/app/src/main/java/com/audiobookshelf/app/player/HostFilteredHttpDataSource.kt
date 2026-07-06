package com.audiobookshelf.app.player

import android.net.Uri
import com.google.android.exoplayer2.upstream.*

/**
 * DataSource.Factory that only injects customHeaders when the request host matches
 * the ABS server host. HLS segment requests to external CDNs get only the auth header,
 * not the CF session cookies or other server-specific headers.
 */
class HostFilteredHttpDataSourceFactory(
  private val serverHost: String,
  private val authHeader: String,
  private val customHeaders: Map<String, String>
) : HttpDataSource.Factory {

  private val baseFactory = DefaultHttpDataSource.Factory()

  override fun createDataSource(): HttpDataSource {
    return HostFilteredHttpDataSource(serverHost, authHeader, customHeaders, baseFactory.createDataSource())
  }

  override fun setDefaultRequestProperties(defaultRequestProperties: Map<String, String>): HttpDataSource.Factory {
    baseFactory.setDefaultRequestProperties(defaultRequestProperties)
    return this
  }
}

class HostFilteredHttpDataSource(
  private val serverHost: String,
  private val authHeader: String,
  private val customHeaders: Map<String, String>,
  private val delegate: DefaultHttpDataSource
) : HttpDataSource {

  private fun isServerHost(uri: Uri): Boolean {
    val host = uri.host ?: return false
    return host == serverHost || host.endsWith(".$serverHost")
  }

  override fun open(dataSpec: DataSpec): Long {
    delegate.setRequestProperty("Authorization", authHeader)
    if (isServerHost(dataSpec.uri)) {
      customHeaders.forEach { (key, value) -> delegate.setRequestProperty(key, value) }
    } else {
      customHeaders.keys.forEach { delegate.clearRequestProperty(it) }
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
