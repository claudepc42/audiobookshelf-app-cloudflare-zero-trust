package com.audiobookshelf.app.models

import android.app.DownloadManager
import android.net.Uri
import android.util.Log
import com.audiobookshelf.app.data.AudioTrack
import com.audiobookshelf.app.data.EBookFile
import com.audiobookshelf.app.data.LocalFolder
import com.audiobookshelf.app.data.PodcastEpisode
import com.audiobookshelf.app.device.DeviceManager
import com.fasterxml.jackson.annotation.JsonIgnore
import java.io.File

data class DownloadItemPart(
  val id: String,
  val downloadItemId: String,
  val filename: String,
  val fileSize: Long,
  val finalDestinationPath:String,
  val serverPath: String,
  val localFolderName: String,
  val localFolderUrl: String,
  val localFolderId: String,
  val ebookFile: EBookFile?,
  val audioTrack: AudioTrack?,
  val episode: PodcastEpisode?,
  var completed:Boolean,
  var moved:Boolean,
  var isMoving:Boolean,
  var failed:Boolean,
  @JsonIgnore val uri: Uri,
  @JsonIgnore val destinationUri: Uri,
  @JsonIgnore val finalDestinationUri: Uri,
  val finalDestinationSubfolder: String,
  var downloadId: Long?,
  var progress: Long,
  var bytesDownloaded: Long
) {
  companion object {
    /** The URL for a server path on the route in use right now. The access token goes in a header, not here. */
    fun buildServerUrl(serverPath: String): String {
      var downloadUrl = "${DeviceManager.serverAddress}${serverPath}"
      if (serverPath.endsWith("/cover")) {
        downloadUrl += "?raw=1" // Download raw cover image
      }
      return downloadUrl
    }

    fun make(downloadItemId:String, filename:String, fileSize: Long, destinationFile: File, finalDestinationFile: File, subfolder:String, serverPath:String, localFolder: LocalFolder, ebookFile: EBookFile?, audioTrack: AudioTrack?, episode: PodcastEpisode?) :DownloadItemPart {
      val destinationUri = Uri.fromFile(destinationFile)
      val finalDestinationUri = Uri.fromFile(finalDestinationFile)

      // Only a placeholder: the real URL is built when the part starts (see serverUrl), so a long queue
      // follows the current route and token instead of whatever was current when it was queued
      val downloadUri = Uri.parse(buildServerUrl(serverPath))
      Log.d("DownloadItemPart", "Audio File Destination Uri: $destinationUri | Final Destination Uri: $finalDestinationUri | Server Path $serverPath")
      return DownloadItemPart(
        id = DeviceManager.getBase64Id(finalDestinationFile.absolutePath),
        downloadItemId,
        filename = filename,
        fileSize = fileSize,
        finalDestinationPath = finalDestinationFile.absolutePath,
        serverPath = serverPath,
        localFolderName = localFolder.name,
        localFolderUrl = localFolder.contentUrl,
        localFolderId = localFolder.id,
        ebookFile = ebookFile,
        audioTrack = audioTrack,
        episode = episode,
        completed = false,
        moved = false,
        isMoving = false,
        failed = false,
        uri = downloadUri,
        destinationUri = destinationUri,
        finalDestinationUri = finalDestinationUri,
        finalDestinationSubfolder = subfolder,
        downloadId = null,
        progress = 0,
        bytesDownloaded = 0
      )
    }
  }

  @get:JsonIgnore
  val isInternalStorage get() = localFolderId.startsWith("internal-")

  // Set when the part is started: true if the in-app downloader handles it (plain http:// URLs). Fixed
  // at that moment because the address a part resolves to can change afterwards.
  @JsonIgnore
  var usesOkHttp: Boolean = false

  @get:JsonIgnore
  val serverUrl get() = buildServerUrl(serverPath)

  @JsonIgnore
  fun getDownloadRequest(url: String, headers: Map<String, String>? = null, wifiOnly: Boolean = false): DownloadManager.Request {
    val dlRequest = DownloadManager.Request(Uri.parse(url))
    dlRequest.setTitle(filename)
    dlRequest.setDescription("Downloading to $localFolderName with filename $filename")
    dlRequest.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
    dlRequest.setDestinationUri(destinationUri)
    // "Never download on cellular" has to hold for parts that start after leaving Wi-Fi too
    if (wifiOnly) dlRequest.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI)
    headers?.forEach { (key, value) -> dlRequest.addRequestHeader(key, value) }
    return dlRequest
  }
}
