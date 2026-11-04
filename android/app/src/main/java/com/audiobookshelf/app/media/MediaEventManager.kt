package com.audiobookshelf.app.media

import android.util.Log
import com.audiobookshelf.app.data.*
import com.audiobookshelf.app.device.DeviceManager
import com.audiobookshelf.app.player.PlayerNotificationService
import java.util.concurrent.Executors

object MediaEventManager {
  const val tag = "MediaEventManager"

  // A listening history only needs recent activity. It used to grow forever (about 240 Save events per
  // listening hour), and every event rewrote and re-sent the whole thing.
  private const val MAX_EVENTS_PER_ITEM = 1000

  // Read-modify-write of an item's history happens on this one thread, so two events (a Save from a
  // server-sync callback and a Seek from the main thread) can't overlap and drop one, and Play/Seek
  // no longer read and write the history on the main thread.
  private val historyExecutor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "MediaEventHistory").also { it.isDaemon = true }
  }

  var clientEventEmitter: PlayerNotificationService.ClientEventEmitter? = null

  fun playEvent(playbackSession: PlaybackSession) {
    Log.i(tag, "Play Event for media \"${playbackSession.displayTitle}\"")
    addPlaybackEvent("Play", playbackSession, null)
  }

  fun pauseEvent(playbackSession: PlaybackSession, syncResult: SyncResult?) {
    Log.i(tag, "Pause Event for media \"${playbackSession.displayTitle}\"")
    addPlaybackEvent("Pause", playbackSession, syncResult)
  }

  fun stopEvent(playbackSession: PlaybackSession, syncResult: SyncResult?) {
    Log.i(tag, "Stop Event for media \"${playbackSession.displayTitle}\"")
    addPlaybackEvent("Stop", playbackSession, syncResult)
  }

  fun saveEvent(playbackSession: PlaybackSession, syncResult: SyncResult?) {
    Log.i(tag, "Save Event for media \"${playbackSession.displayTitle}\"")
    addPlaybackEvent("Save", playbackSession, syncResult)
  }

  fun finishedEvent(playbackSession: PlaybackSession, syncResult: SyncResult?) {
    Log.i(tag, "Finished Event for media \"${playbackSession.displayTitle}\"")
    addPlaybackEvent("Finished", playbackSession, syncResult)
  }

  fun seekEvent(playbackSession: PlaybackSession, syncResult: SyncResult?) {
    Log.i(
            tag,
            "Seek Event for media \"${playbackSession.displayTitle}\", currentTime=${playbackSession.currentTime}"
    )
    addPlaybackEvent("Seek", playbackSession, syncResult)
  }

  fun syncEvent(mediaProgress: MediaProgressWrapper, description: String) {
    Log.i(
            tag,
            "Sync Event for media item id \"${mediaProgress.mediaItemId}\", currentTime=${mediaProgress.currentTime}"
    )
    addSyncEvent("Sync", mediaProgress, description)
  }

  private fun addSyncEvent(
          eventName: String,
          mediaProgress: MediaProgressWrapper,
          description: String
  ) {
    // Values are read here, on the calling thread, before the session can change again
    val mediaItemId = mediaProgress.mediaItemId
    val mediaItemEvent =
            MediaItemEvent(
                    name = eventName,
                    type = "Sync",
                    description = description,
                    currentTime = mediaProgress.currentTime,
                    serverSyncAttempted = false,
                    serverSyncSuccess = null,
                    serverSyncMessage = null,
                    timestamp = System.currentTimeMillis()
            )

    historyExecutor.execute {
      try {
        val mediaItemHistory = getMediaItemHistoryMediaItem(mediaItemId)
        if (mediaItemHistory == null) {
          Log.w(tag, "addSyncEvent: Media Item History not created yet for media item id $mediaItemId")
          return@execute
        }
        saveAndNotify(mediaItemHistory, mediaItemEvent)
      } catch (e: Exception) {
        Log.e(tag, "addSyncEvent failed", e)
      }
    }
  }

  private fun addPlaybackEvent(
          eventName: String,
          playbackSession: PlaybackSession,
          syncResult: SyncResult?
  ) {
    val mediaItemEvent =
            MediaItemEvent(
                    name = eventName,
                    type = "Playback",
                    description = "",
                    currentTime = playbackSession.currentTime,
                    serverSyncAttempted = syncResult?.serverSyncAttempted ?: false,
                    serverSyncSuccess = syncResult?.serverSyncSuccess,
                    serverSyncMessage = syncResult?.serverSyncMessage,
                    timestamp = System.currentTimeMillis()
            )
    val mediaItemId = playbackSession.mediaItemId
    // What a new history needs, taken now because the session object keeps changing
    val newHistoryTemplate = createMediaItemHistoryForSession(playbackSession)

    historyExecutor.execute {
      try {
        val mediaItemHistory = getMediaItemHistoryMediaItem(mediaItemId) ?: newHistoryTemplate
        saveAndNotify(mediaItemHistory, mediaItemEvent)
      } catch (e: Exception) {
        Log.e(tag, "addPlaybackEvent failed", e)
      }
    }
  }

  private fun saveAndNotify(mediaItemHistory: MediaItemHistory, mediaItemEvent: MediaItemEvent) {
    mediaItemHistory.events.add(mediaItemEvent)
    // Keep the newest events only
    while (mediaItemHistory.events.size > MAX_EVENTS_PER_ITEM) {
      mediaItemHistory.events.removeAt(0)
    }
    DeviceManager.dbManager.saveMediaItemHistory(mediaItemHistory)

    clientEventEmitter?.onMediaItemHistoryUpdated(mediaItemHistory)
  }

  private fun getMediaItemHistoryMediaItem(mediaItemId: String): MediaItemHistory? {
    return DeviceManager.dbManager.getMediaItemHistory(mediaItemId)
  }

  private fun createMediaItemHistoryForSession(playbackSession: PlaybackSession): MediaItemHistory {
    val libraryItemId = playbackSession.libraryItemId ?: ""
    val episodeId: String? = playbackSession.episodeId
    return MediaItemHistory(
            id = playbackSession.mediaItemId,
            mediaDisplayTitle = playbackSession.displayTitle ?: "Unset",
            libraryItemId,
            episodeId,
            false, // local-only items are not supported
            playbackSession.serverConnectionConfigId,
            playbackSession.serverAddress,
            playbackSession.userId,
            createdAt = System.currentTimeMillis(),
            events = mutableListOf()
    )
  }
}
