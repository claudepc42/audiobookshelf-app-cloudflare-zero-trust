package com.audiobookshelf.app.managers

import android.app.DownloadManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import com.anggrayudi.storage.callback.FileCallback
import com.anggrayudi.storage.file.DocumentFileCompat
import com.anggrayudi.storage.file.MimeType
import com.anggrayudi.storage.file.getAbsolutePath
import com.anggrayudi.storage.file.moveFileTo
import com.anggrayudi.storage.media.FileDescription
import com.audiobookshelf.app.MainActivity
import com.audiobookshelf.app.data.DownloadUsingCellularSetting
import com.audiobookshelf.app.device.DeviceManager
import com.audiobookshelf.app.device.FolderScanner
import com.audiobookshelf.app.models.DownloadItem
import com.audiobookshelf.app.models.DownloadItemPart
import com.audiobookshelf.app.plugins.AbsCfZeroTrust
import com.audiobookshelf.app.plugins.AbsLogger
import com.audiobookshelf.app.server.ApiHandler
import com.fasterxml.jackson.core.json.JsonReadFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.getcapacitor.JSObject
import java.io.File
import java.io.FileOutputStream
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Manages download items and their parts. */
class DownloadItemManager(
        var downloadManager: DownloadManager,
        private var folderScanner: FolderScanner,
        var mainActivity: MainActivity,
        private var clientEventEmitter: DownloadEventEmitter
) {
  val tag = "DownloadItemManager"
  private val maxSimultaneousDownloads = 3
  private var jacksonMapper =
          jacksonObjectMapper()
                  .enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature())

  enum class DownloadCheckStatus {
    InProgress,
    Successful,
    Failed
  }

  // These are touched from OkHttp callback threads (a server fetch finishing queues an item), the
  // watcher coroutine, the file-move callbacks and the main thread. Copy-on-write lists make every
  // iteration safe against the others changing the list (they used to throw
  // ConcurrentModificationException), and picking which parts to start is done under queueLock so two
  // threads can't pick the same part.
  val downloadItemQueue: MutableList<DownloadItem> =
          CopyOnWriteArrayList() // All pending and downloading items
  val currentDownloadItemParts: MutableList<DownloadItemPart> =
          CopyOnWriteArrayList() // Item parts currently being downloaded
  private val queueLock = Any()

  // Items whose completion is already being handled, so a second pass doesn't scan and announce it again
  private val finishingItems: MutableSet<String> = ConcurrentHashMap.newKeySet()

  // What was last sent to JS for each part, so unchanged parts aren't re-sent every 500 ms
  private val lastEmitted = ConcurrentHashMap<String, String>()

  // True while new parts are held back because "Never download on cellular" is set and the device
  // is on a metered network
  @Volatile private var networkBlocked = false

  interface DownloadEventEmitter {
    fun onDownloadItem(downloadItem: DownloadItem)
    fun onDownloadItemPartUpdate(downloadItemPart: DownloadItemPart)
    fun onDownloadItemComplete(jsobj: JSObject)
  }

  interface InternalProgressCallback {
    fun onProgress(totalBytesWritten: Long, progress: Long)
    fun onComplete(failed: Boolean)
  }

  companion object {
    private val watching = AtomicBoolean(false)
    val isDownloading: Boolean get() = watching.get()

    // Interrupted downloads are cleaned up once per process, the first time a manager is created
    private val cleanedUpInterrupted = AtomicBoolean(false)
  }

  /**
   * Headers for one part's request. The custom headers (CF cookie, service tokens) only go to the
   * server's primary address, never to the LAN address, which Cloudflare isn't in front of and which
   * something else could be answering. The access token travels as a header instead of in the URL, so
   * it isn't written to logs or frozen into the URL when the item is queued.
   */
  private fun requestHeaders(url: String): Map<String, String> {
    val headers = LinkedHashMap<String, String>()
    ApiHandler.customHeadersFor(url, DeviceManager.serverConnectionConfig)?.let { headers.putAll(it) }
    headers["Authorization"] = "Bearer ${DeviceManager.token}"
    return headers
  }

  /**
   * Removes what a download that was interrupted by the process dying left behind: partial files and
   * the saved queue entries. Nothing resumes them (the in-memory queue is gone), so without this the
   * partial files and database entries stayed forever.
   */
  fun cleanUpInterruptedDownloads() {
    if (!cleanedUpInterrupted.compareAndSet(false, true)) return
    GlobalScope.launch(Dispatchers.IO) {
      try {
        val leftovers = DeviceManager.dbManager.getDownloadItems()
        leftovers.forEach { item ->
          item.downloadItemParts.forEach { part -> deletePartFiles(part, item.isInternalStorage) }
          DeviceManager.dbManager.removeDownloadItem(item.id)
        }
        if (leftovers.isNotEmpty()) AbsLogger.info(tag, "cleanUpInterruptedDownloads: Removed ${leftovers.size} interrupted download(s) from a previous run")
      } catch (e: Exception) {
        Log.e(tag, "cleanUpInterruptedDownloads failed", e)
      }
    }
  }

  /** Deletes the files a part wrote: the temp file, and for internal storage the file at its final path */
  private fun deletePartFiles(part: DownloadItemPart, internal: Boolean) {
    try {
      part.destinationUri.path?.let { File(it).delete() }
      if (internal) File(part.finalDestinationPath).delete()
    } catch (e: Exception) {
      Log.e(tag, "Failed to delete files of part ${part.filename}", e)
    }
  }

  /** Adds a download item to the queue and starts processing the queue. */
  fun addDownloadItem(downloadItem: DownloadItem) {
    DeviceManager.dbManager.saveDownloadItem(downloadItem)
    Log.i(tag, "Add download item ${downloadItem.media.metadata.title}")

    downloadItemQueue.add(downloadItem)
    clientEventEmitter.onDownloadItem(downloadItem)
    checkUpdateDownloadQueue()
  }

  private fun cellularBlocked(): Boolean {
    val setting = DeviceManager.deviceData.deviceSettings?.downloadUsingCellular
    if (setting != DownloadUsingCellularSetting.NEVER) return false
    // Asked directly: the player service's own flag is only kept up to date while it is running
    val connectivityManager = mainActivity.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    return connectivityManager?.isActiveNetworkMetered == true
  }

  private fun hasUnstartedParts(): Boolean {
    return downloadItemQueue.any { item -> item.downloadItemParts.any { !it.completed && it.downloadId == null } }
  }

  /** Checks and updates the download queue. */
  private fun checkUpdateDownloadQueue() {
    synchronized(queueLock) {
      var blocked = false
      for (downloadItem in downloadItemQueue) {
        val numPartsToGet = maxSimultaneousDownloads - currentDownloadItemParts.size
        if (numPartsToGet <= 0) break

        // "Never download on cellular" was only checked when Download was tapped, so parts queued at
        // home kept going over mobile data after leaving. Hold new parts until Wi-Fi is back.
        if (cellularBlocked()) {
          blocked = true
          break
        }

        val nextDownloadItemParts = downloadItem.getNextDownloadItemParts(numPartsToGet)
        Log.d(
                tag,
                "checkUpdateDownloadQueue: numPartsToGet=$numPartsToGet, nextDownloadItemParts=${nextDownloadItemParts.size}"
        )

        if (nextDownloadItemParts.isNotEmpty()) {
          processDownloadItemParts(nextDownloadItemParts)
        }
      }
      networkBlocked = blocked
    }

    if (currentDownloadItemParts.isNotEmpty() || hasUnstartedParts()) startWatchingDownloads()
  }

  /** Processes the download item parts. */
  private fun processDownloadItemParts(nextDownloadItemParts: List<DownloadItemPart>) {
    nextDownloadItemParts.forEach { startPart(it) }
  }

  /** Starts one part. A part that can't even start is marked failed rather than left pending. */
  private fun startPart(part: DownloadItemPart) {
    try {
      // Which downloader a part uses is decided once, here: the address it resolves to can change
      // later (LAN to primary), and the watcher must keep treating it the same way
      when {
        part.isInternalStorage -> startInternalDownload(part)
        part.serverUrl.startsWith("http://") -> startOkHttpExternalDownload(part)
        else -> startExternalDownload(part)
      }
    } catch (e: Exception) {
      Log.e(tag, "Failed to start download part ${part.filename}", e)
      part.failed = true
      part.completed = true
      if (part.downloadId == null) part.downloadId = -1
      if (!currentDownloadItemParts.contains(part)) currentDownloadItemParts.add(part)
    }
  }

  /** Starts an internal download. */
  private fun startInternalDownload(downloadItemPart: DownloadItemPart) {
    val file = File(downloadItemPart.finalDestinationPath)
    file.parentFile?.mkdirs()

    val fileOutputStream = FileOutputStream(downloadItemPart.finalDestinationPath)
    val internalProgressCallback =
            object : InternalProgressCallback {
              override fun onProgress(totalBytesWritten: Long, progress: Long) {
                downloadItemPart.bytesDownloaded = totalBytesWritten
                downloadItemPart.progress = progress
              }

              override fun onComplete(failed: Boolean) {
                downloadItemPart.failed = failed
                downloadItemPart.completed = true
              }
            }

    val url = downloadItemPart.serverUrl
    Log.d(tag, "Start internal download to destination path ${downloadItemPart.finalDestinationPath}")
    downloadItemPart.downloadId = 1
    currentDownloadItemParts.add(downloadItemPart)
    InternalDownloadManager(fileOutputStream, internalProgressCallback).download(url, requestHeaders(url))
  }

  /** Starts an external download. */
  private fun startExternalDownload(downloadItemPart: DownloadItemPart) {
    // The system downloader doesn't always create the folders of a temp file path
    downloadItemPart.destinationUri.path?.let { File(it).parentFile?.mkdirs() }
    val url = downloadItemPart.serverUrl
    val wifiOnly = DeviceManager.deviceData.deviceSettings?.downloadUsingCellular == DownloadUsingCellularSetting.NEVER
    val dlRequest = downloadItemPart.getDownloadRequest(url, requestHeaders(url), wifiOnly)
    val downloadId = downloadManager.enqueue(dlRequest)
    downloadItemPart.downloadId = downloadId
    Log.d(tag, "checkUpdateDownloadQueue: Starting download item part, downloadId=$downloadId")
    currentDownloadItemParts.add(downloadItemPart)
  }

  /**
   * Downloads via OkHttp (in-process) instead of the system DownloadManager.
   * Used for HTTP URLs where the system DownloadManager may fail due to network
   * routing differences (e.g. VPN split-tunnel) or cleartext restrictions.
   * Writes to the temp destination first; the standard moveDownloadedFile step
   * then moves it to the user's custom folder.
   */
  private fun startOkHttpExternalDownload(downloadItemPart: DownloadItemPart) {
    downloadItemPart.usesOkHttp = true
    val tempPath = downloadItemPart.destinationUri.path ?: run {
      Log.e(tag, "OkHttp external download: destinationUri has no path for ${downloadItemPart.filename}")
      downloadItemPart.failed = true
      downloadItemPart.completed = true
      downloadItemPart.downloadId = -1
      currentDownloadItemParts.add(downloadItemPart)
      return
    }
    val file = File(tempPath)
    file.parentFile?.mkdirs()
    val fos = FileOutputStream(file)
    val progressCallback = object : InternalProgressCallback {
      override fun onProgress(totalBytesWritten: Long, progress: Long) {
        downloadItemPart.bytesDownloaded = totalBytesWritten
        downloadItemPart.progress = progress
      }
      override fun onComplete(failed: Boolean) {
        downloadItemPart.failed = failed
        downloadItemPart.completed = true
      }
    }
    val url = downloadItemPart.serverUrl
    Log.d(tag, "Start OkHttp external download to $tempPath")
    downloadItemPart.downloadId = 1
    currentDownloadItemParts.add(downloadItemPart)
    InternalDownloadManager(fos, progressCallback).download(url, requestHeaders(url))
  }

  /** Starts watching the downloads. */
  private fun startWatchingDownloads() {
    if (!watching.compareAndSet(false, true)) return // Already watching

    GlobalScope.launch(Dispatchers.IO) {
      Log.d(tag, "Starting watching downloads")
      try {
        while (currentDownloadItemParts.isNotEmpty() || hasUnstartedParts()) {
          val itemParts = currentDownloadItemParts.filter { !it.isMoving }
          for (downloadItemPart in itemParts) {
            when {
              downloadItemPart.isInternalStorage -> handleInternalDownloadPart(downloadItemPart)
              downloadItemPart.usesOkHttp -> handleOkHttpExternalDownloadPart(downloadItemPart)
              else -> handleExternalDownloadPart(downloadItemPart)
            }
          }

          // Waiting for Wi-Fi: no need to look every half second
          delay(if (networkBlocked && currentDownloadItemParts.isEmpty()) 3000 else 500)

          if (currentDownloadItemParts.size < maxSimultaneousDownloads) {
            checkUpdateDownloadQueue()
          }
        }
      } catch (e: Exception) {
        Log.e(tag, "Download watcher failed", e)
      } finally {
        Log.d(tag, "Finished watching downloads")
        watching.set(false)
      }

      // A part that was added just as the loop ended still needs watching
      if (currentDownloadItemParts.isNotEmpty()) startWatchingDownloads()
    }
  }

  /** Sends a part's state to JS, but only if it changed since the last time */
  private fun emitPartUpdate(downloadItemPart: DownloadItemPart) {
    val signature = "${downloadItemPart.bytesDownloaded}|${downloadItemPart.completed}|${downloadItemPart.failed}|${downloadItemPart.isMoving}|${downloadItemPart.moved}"
    if (lastEmitted.put(downloadItemPart.id, signature) == signature) return
    clientEventEmitter.onDownloadItemPartUpdate(downloadItemPart)
  }

  private fun removePart(downloadItemPart: DownloadItemPart) {
    currentDownloadItemParts.remove(downloadItemPart)
    lastEmitted.remove(downloadItemPart.id)
  }

  /** Handles an internal download part. */
  private fun handleInternalDownloadPart(downloadItemPart: DownloadItemPart) {
    emitPartUpdate(downloadItemPart)

    if (downloadItemPart.completed) {
      val downloadItem = downloadItemQueue.find { it.id == downloadItemPart.downloadItemId }
      downloadItem?.let { checkDownloadItemFinished(it) }
      removePart(downloadItemPart)
    }
  }

  /** Handles an OkHttp-based external download part (HTTP URLs to custom folder). */
  private fun handleOkHttpExternalDownloadPart(downloadItemPart: DownloadItemPart) {
    emitPartUpdate(downloadItemPart)
    if (!downloadItemPart.completed) return

    val downloadItem = downloadItemQueue.find { it.id == downloadItemPart.downloadItemId }
    if (downloadItem == null) {
      removePart(downloadItemPart)
      return
    }
    if (downloadItemPart.failed) {
      checkDownloadItemFinished(downloadItem)
      removePart(downloadItemPart)
    } else {
      moveDownloadedFile(downloadItem, downloadItemPart)
    }
  }

  /** Handles an external download part. */
  private fun handleExternalDownloadPart(downloadItemPart: DownloadItemPart) {
    val downloadCheckStatus = checkDownloadItemPart(downloadItemPart)
    emitPartUpdate(downloadItemPart)

    // Will move to final destination, remove current item parts, and check if download item is
    // finished
    handleDownloadItemPartCheck(downloadCheckStatus, downloadItemPart)
  }

  /** Checks the status of a download item part. */
  private fun checkDownloadItemPart(downloadItemPart: DownloadItemPart): DownloadCheckStatus {
    val downloadId = downloadItemPart.downloadId ?: return DownloadCheckStatus.Failed

    val query = DownloadManager.Query().setFilterById(downloadId)
    downloadManager.query(query).use {
      if (it.moveToFirst()) {
        val bytesColumnIndex = it.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
        val statusColumnIndex = it.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val bytesDownloadedColumnIndex =
                it.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)

        val totalBytes = if (bytesColumnIndex >= 0) it.getLong(bytesColumnIndex) else 0L
        val downloadStatus = if (statusColumnIndex >= 0) it.getInt(statusColumnIndex) else 0
        val bytesDownloadedSoFar =
                if (bytesDownloadedColumnIndex >= 0) it.getLong(bytesDownloadedColumnIndex) else 0
        val mediaTypeColumnIndex = it.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE)
        val mediaType = if (mediaTypeColumnIndex >= 0) it.getString(mediaTypeColumnIndex) ?: "" else ""

        return when (downloadStatus) {
          DownloadManager.STATUS_SUCCESSFUL -> {
            // A stale Cloudflare session makes the downloader follow the redirect and "successfully"
            // save the login page. Audio and ebook files are never HTML.
            if (mediaType.startsWith("text/html", ignoreCase = true)) {
              Log.e(tag, "checkDownloads Download ${downloadItemPart.filename} came back as an HTML page, not a media file — treating as failed")
              downloadManager.remove(downloadId)
              downloadItemPart.completed = true
              downloadItemPart.failed = true
              AbsCfZeroTrust.checkSessionAndNotify()
              return DownloadCheckStatus.Failed
            }
            Log.d(tag, "checkDownloads Download ${downloadItemPart.filename} Successful")
            downloadItemPart.completed = true
            downloadItemPart.progress = 1
            downloadItemPart.bytesDownloaded = bytesDownloadedSoFar

            DownloadCheckStatus.Successful
          }
          DownloadManager.STATUS_FAILED -> {
            Log.d(tag, "checkDownloads Download ${downloadItemPart.filename} Failed")
            downloadItemPart.completed = true
            downloadItemPart.failed = true

            AbsCfZeroTrust.checkSessionAndNotify()

            DownloadCheckStatus.Failed
          }
          else -> {
            val percentProgress =
                    if (totalBytes > 0) ((bytesDownloadedSoFar * 100L) / totalBytes) else 0
            downloadItemPart.progress = percentProgress
            downloadItemPart.bytesDownloaded = bytesDownloadedSoFar

            DownloadCheckStatus.InProgress
          }
        }
      } else {
        Log.d(tag, "Download ${downloadItemPart.filename} not found in dlmanager")
        downloadItemPart.completed = true
        downloadItemPart.failed = true
        return DownloadCheckStatus.Failed
      }
    }
  }

  /** Handles the result of a download item part check. */
  private fun handleDownloadItemPartCheck(
          downloadCheckStatus: DownloadCheckStatus,
          downloadItemPart: DownloadItemPart
  ) {
    val downloadItem = downloadItemQueue.find { it.id == downloadItemPart.downloadItemId }
    if (downloadItem == null) {
      Log.e(
              tag,
              "Download item part finished but download item not found ${downloadItemPart.filename}"
      )
      removePart(downloadItemPart)
    } else if (downloadCheckStatus == DownloadCheckStatus.Successful) {
      moveDownloadedFile(downloadItem, downloadItemPart)
    } else if (downloadCheckStatus != DownloadCheckStatus.InProgress) {
      checkDownloadItemFinished(downloadItem)
      removePart(downloadItemPart)
    }
  }

  /** Moves the downloaded file to its final destination. */
  private fun moveDownloadedFile(downloadItem: DownloadItem, downloadItemPart: DownloadItemPart) {
    val file = DocumentFileCompat.fromUri(mainActivity, downloadItemPart.destinationUri)
    Log.d(tag, "DOWNLOAD: DESTINATION URI ${downloadItemPart.destinationUri}")

    val fcb =
            object : FileCallback() {
              override fun onPrepare() {
                Log.d(tag, "DOWNLOAD: PREPARING MOVE FILE")
              }

              override fun onFailed(errorCode: ErrorCode) {
                Log.e(tag, "DOWNLOAD: FAILED TO MOVE FILE $errorCode")
                downloadItemPart.failed = true
                downloadItemPart.isMoving = false
                file?.delete()
                checkDownloadItemFinished(downloadItem)
                removePart(downloadItemPart)
              }

              override fun onCompleted(result: Any) {
                Log.d(tag, "DOWNLOAD: FILE MOVE COMPLETED")
                val resultDocFile = result as DocumentFile
                Log.d(
                        tag,
                        "DOWNLOAD: COMPLETED FILE INFO (name=${resultDocFile.name}) ${resultDocFile.getAbsolutePath(mainActivity)}"
                )

                // Rename to fix appended .mp3 on m4b/m4a files
                //  REF: https://github.com/anggrayudi/SimpleStorage/issues/94
                val docNameLowerCase = resultDocFile.name?.lowercase(Locale.getDefault()) ?: ""
                if (docNameLowerCase.endsWith(".m4b.mp3") || docNameLowerCase.endsWith(".m4a.mp3")
                ) {
                  resultDocFile.renameTo(downloadItemPart.filename)
                }

                downloadItemPart.moved = true
                downloadItemPart.isMoving = false
                checkDownloadItemFinished(downloadItem)
                removePart(downloadItemPart)
              }
            }

    val localFolderFile =
            DocumentFileCompat.fromUri(mainActivity, Uri.parse(downloadItemPart.localFolderUrl))
    if (localFolderFile == null) {
      // Failed
      downloadItemPart.failed = true
      Log.e(tag, "Local Folder File from uri is null")
      checkDownloadItemFinished(downloadItem)
      removePart(downloadItemPart)
    } else {
      downloadItemPart.isMoving = true
      val mimetype = if (downloadItemPart.audioTrack != null) MimeType.AUDIO else MimeType.IMAGE
      val fileDescription =
              FileDescription(
                      downloadItemPart.filename,
                      downloadItemPart.finalDestinationSubfolder,
                      mimetype
              )
      file?.moveFileTo(mainActivity, localFolderFile, fileDescription, fcb)
    }
  }

  /** Checks if a download item is finished and processes it. */
  private fun checkDownloadItemFinished(downloadItem: DownloadItem) {
    if (!downloadItem.isDownloadFinished) return
    // Every completed part of a finished item arrives here; only the first one may finish it
    if (!finishingItems.add(downloadItem.id)) return

    val failedParts = downloadItem.downloadItemParts.count { it.failed }
    if (failedParts > 0) {
      // A book with a missing or empty track isn't a usable download. Previously it was scanned
      // anyway, producing a book with a broken track (or, in a picked folder, with every later track
      // offset by the missing one's length) and no error. Remove what was downloaded and tell JS.
      Log.e(tag, "Download Item ${downloadItem.media.metadata.title} failed: $failedParts of ${downloadItem.downloadItemParts.size} files failed")
      AbsLogger.error(tag, "Download of \"${downloadItem.itemTitle}\" failed: $failedParts of ${downloadItem.downloadItemParts.size} files could not be downloaded, so nothing was added")
      downloadItem.downloadItemParts.forEach { deletePartFiles(it, downloadItem.isInternalStorage) }
      if (downloadItem.isInternalStorage) File(downloadItem.itemFolderPath).delete() // only removes an empty folder

      val jsobj =
              JSObject().apply {
                put("libraryItemId", downloadItem.id)
                put("localFolderId", downloadItem.localFolder.id)
                put("failedParts", failedParts)
                put("totalParts", downloadItem.downloadItemParts.size)
              }
      GlobalScope.launch(Dispatchers.Main) {
        clientEventEmitter.onDownloadItemComplete(jsobj)
        downloadItemQueue.remove(downloadItem)
        DeviceManager.dbManager.removeDownloadItem(downloadItem.id)
        finishingItems.remove(downloadItem.id)
      }
      return
    }

    Log.i(tag, "Download Item finished ${downloadItem.media.metadata.title}")

    GlobalScope.launch(Dispatchers.IO) {
      folderScanner.scanDownloadItem(downloadItem) { downloadItemScanResult ->
        Log.d(
                tag,
                "Item download complete ${downloadItem.itemTitle} | local library item id: ${downloadItemScanResult?.localLibraryItem?.id}"
        )

        // The temp folder of a book downloaded to a picked folder is empty now (the files were moved)
        if (!downloadItem.isInternalStorage) {
          downloadItem.downloadItemParts.firstOrNull()?.destinationUri?.path?.let { File(it).parentFile?.delete() }
        }

        val jsobj =
                JSObject().apply {
                  put("libraryItemId", downloadItem.id)
                  put("localFolderId", downloadItem.localFolder.id)

                  downloadItemScanResult?.localLibraryItem?.let { localLibraryItem ->
                    put(
                            "localLibraryItem",
                            JSObject(jacksonMapper.writeValueAsString(localLibraryItem))
                    )
                  }
                  downloadItemScanResult?.localMediaProgress?.let { localMediaProgress ->
                    put(
                            "localMediaProgress",
                            JSObject(jacksonMapper.writeValueAsString(localMediaProgress))
                    )
                  }
                }

        launch(Dispatchers.Main) {
          clientEventEmitter.onDownloadItemComplete(jsobj)
          downloadItemQueue.remove(downloadItem)
          DeviceManager.dbManager.removeDownloadItem(downloadItem.id)
          finishingItems.remove(downloadItem.id)
        }
      }
    }
  }
}
