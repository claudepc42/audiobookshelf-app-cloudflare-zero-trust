package com.audiobookshelf.app.managers

import android.util.Log
import com.audiobookshelf.app.plugins.AbsCfZeroTrust
import java.io.*
import java.util.concurrent.TimeUnit
import okhttp3.*

/**
 * Manages the internal download process.
 *
 * @property outputStream The output stream to write the downloaded data.
 * @property progressCallback The callback to report download progress.
 */
class InternalDownloadManager(
        private val outputStream: FileOutputStream,
        private val progressCallback: DownloadItemManager.InternalProgressCallback
) : AutoCloseable {

  private val tag = "InternalDownloadManager"
  private val client: OkHttpClient = sharedClient
  private val writer = BinaryFileWriter(outputStream, progressCallback)

  /**
   * Downloads a file from the given URL.
   *
   * @param url The URL to download the file from.
   * @throws IOException If an I/O error occurs.
   */
  @Throws(IOException::class)
  fun download(url: String, customHeaders: Map<String, String>? = null) {
    val builder = Request.Builder().url(url).addHeader("Accept-Encoding", "identity")
    customHeaders?.forEach { (key, value) -> builder.addHeader(key, value) }
    val request: Request = builder.build()
    client.newCall(request)
            .enqueue(
                    object : Callback {
                      override fun onFailure(call: Call, e: IOException) {
                        Log.e(tag, "Download URL $url FAILED", e)
                        closeQuietly()
                        progressCallback.onComplete(true)
                      }

                      override fun onResponse(call: Call, response: Response) {
                        if (!response.isSuccessful) {
                          Log.e(tag, "Download failed: HTTP ${response.code} for $url")
                          response.close()
                          closeQuietly()
                          progressCallback.onComplete(true)
                          return
                        }
                        val finalHost = response.request.url.host
                        val originalHost = try { android.net.Uri.parse(url).host ?: "" } catch (e: Exception) { "" }
                        if (originalHost.isNotEmpty() && finalHost != originalHost) {
                          Log.e(tag, "Download redirected to unexpected host $finalHost (expected $originalHost) — possible auth challenge for $url")
                          AbsCfZeroTrust.notifyCfSessionExpired()
                          response.close()
                          closeQuietly()
                          progressCallback.onComplete(true)
                          return
                        }
                        // Anything thrown while streaming the body (connection dropped mid-file,
                        // read timeout, disk full) used to escape here: OkHttp only logs it and never
                        // calls onFailure, so the part stayed "downloading" forever and held one of
                        // the 3 download slots. Always report the part as failed instead.
                        try {
                          response.use {
                            val body = it.body
                            if (body == null) {
                              Log.e(tag, "Response doesn't contain a file")
                              closeQuietly()
                              progressCallback.onComplete(true)
                            } else {
                              val length: Long = it.header("Content-Length")?.toLongOrNull() ?: 0L
                              writer.write(body.byteStream(), length)
                            }
                          }
                        } catch (e: Exception) {
                          Log.e(tag, "Download of $url failed while writing the file", e)
                          closeQuietly()
                          progressCallback.onComplete(true)
                        }
                      }
                    }
            )
  }

  private fun closeQuietly() {
    try {
      writer.close()
    } catch (e: Exception) {
      // Already closed or never opened — nothing left to release
    }
  }

  /**
   * Closes the download manager and releases resources.
   *
   * @throws Exception If an error occurs during closing.
   */
  @Throws(Exception::class)
  override fun close() {
    writer.close()
  }

  companion object {
    // One client (and connection pool) for every part, instead of a new one per file
    private val sharedClient: OkHttpClient =
            OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).build()
  }
}

/**
 * Writes binary data to an output stream.
 *
 * @property outputStream The output stream to write the data to.
 * @property progressCallback The callback to report write progress.
 */
class BinaryFileWriter(
        private val outputStream: OutputStream,
        private val progressCallback: DownloadItemManager.InternalProgressCallback
) : AutoCloseable {

  /**
   * Writes data from the input stream to the output stream.
   *
   * @param inputStream The input stream to read the data from.
   * @param length The total length of the data to be written.
   * @return The total number of bytes written.
   * @throws IOException If an I/O error occurs.
   */
  @Throws(IOException::class)
  fun write(inputStream: InputStream, length: Long): Long {
    BufferedInputStream(inputStream).use { input ->
      val dataBuffer = ByteArray(CHUNK_SIZE)
      var totalBytes: Long = 0
      var readBytes: Int
      try {
        while (input.read(dataBuffer).also { readBytes = it } != -1) {
          totalBytes += readBytes
          outputStream.write(dataBuffer, 0, readBytes)
          // No Content-Length (chunked transfer, or a proxy that drops it) means no percentage —
          // dividing by the 0 default used to throw ArithmeticException and crash the app
          val progress = if (length > 0) (totalBytes * 100L) / length else 0L
          progressCallback.onProgress(totalBytes, progress)
        }
      } finally {
        // The stream was never closed before; close it whether the file finished or failed
        outputStream.close()
      }
      progressCallback.onComplete(false)
      return totalBytes
    }
  }

  /**
   * Closes the writer and releases resources.
   *
   * @throws IOException If an error occurs during closing.
   */
  @Throws(IOException::class)
  override fun close() {
    outputStream.close()
  }

  companion object {
    private const val CHUNK_SIZE = 8192 // Increased chunk size for better performance
  }
}
