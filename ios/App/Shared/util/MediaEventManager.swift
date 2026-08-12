//
//  MediaEventManager.swift
//  App
//
//  Swift port of android/.../media/MediaEventManager.kt — records playback history events
//  (Play/Pause/Stop/Save/Seek/...) so the History button (SessionHistoryModal.vue and the
//  full-page pages/media/_id/history.vue, both via $db.getMediaItemHistory) has real data on iOS.
//
//  Scope note: SessionHistoryModal.vue's own rendering logic only ever reads "Play", "Pause",
//  and "Stop" events. pages/media/_id/history.vue additionally renders "Save" (periodic
//  autosave) and groups repeated ones — that's what saveEvent below feeds. "Finished" on
//  Android only ever fires from PlayerNotificationService's Android Auto podcast-auto-advance
//  flow (MediaProgressSyncer.finished(), called only from handlePlaybackEnded's isAndroidAuto
//  branch) — iOS has no CarPlay/Android-Auto-equivalent auto-advance flow, so that trigger
//  point doesn't exist here either and finishedEvent is intentionally left unwired, matching
//  what a real (non-Android-Auto) session would produce on Android anyway. "Sync" events
//  (cross-device webhook/on-connect progress reconciliation, android's ApiHandler.kt /
//  AbsDatabase.kt syncEvent call sites) are also not ported — a real but narrower, lower-value
//  gap than Save/Seek, left as a known follow-up.
//

import Foundation

struct MediaSyncResult {
    let serverSyncAttempted: Bool
    let serverSyncSuccess: Bool?
    let serverSyncMessage: String?
}

class MediaEventManager {
    static let tag = "MediaEventManager"

    static func playEvent(_ session: PlaybackSession) {
        AbsLogger.info(message: "\(tag): Play event for media \"\(session.displayTitle ?? "")\"")
        addPlaybackEvent(name: "Play", session: session, syncResult: nil)
    }

    static func pauseEvent(_ session: PlaybackSession, syncResult: MediaSyncResult? = nil) {
        AbsLogger.info(message: "\(tag): Pause event for media \"\(session.displayTitle ?? "")\"")
        addPlaybackEvent(name: "Pause", session: session, syncResult: syncResult)
    }

    static func stopEvent(_ session: PlaybackSession, syncResult: MediaSyncResult? = nil) {
        AbsLogger.info(message: "\(tag): Stop event for media \"\(session.displayTitle ?? "")\"")
        addPlaybackEvent(name: "Stop", session: session, syncResult: syncResult)
    }

    static func saveEvent(_ session: PlaybackSession, syncResult: MediaSyncResult?) {
        AbsLogger.info(message: "\(tag): Save event for media \"\(session.displayTitle ?? "")\"")
        addPlaybackEvent(name: "Save", session: session, syncResult: syncResult)
    }

    static func finishedEvent(_ session: PlaybackSession) {
        AbsLogger.info(message: "\(tag): Finished event for media \"\(session.displayTitle ?? "")\"")
        addPlaybackEvent(name: "Finished", session: session, syncResult: nil)
    }

    static func seekEvent(_ session: PlaybackSession) {
        AbsLogger.info(message: "\(tag): Seek event for media \"\(session.displayTitle ?? "")\", currentTime=\(session.currentTime)")
        addPlaybackEvent(name: "Seek", session: session, syncResult: nil)
    }

    private static func addPlaybackEvent(name: String, session: PlaybackSession, syncResult: MediaSyncResult?) {
        let event = MediaItemEvent(name: name, type: "Playback", currentTime: session.currentTime, serverSyncAttempted: syncResult?.serverSyncAttempted, serverSyncSuccess: syncResult?.serverSyncSuccess, serverSyncMessage: syncResult?.serverSyncMessage)
        let mediaItemId = session.mediaItemId
        Database.shared.addMediaItemEvent(mediaItemId: mediaItemId, event: event, session: session)

        // Matches Android's clientEventEmitter?.onMediaItemHistoryUpdated(mediaItemHistory) —
        // lets an already-open History view (SessionHistoryModal.vue / history.vue) refresh
        // live instead of only showing a snapshot from when it was opened.
        NotificationCenter.default.post(name: NSNotification.Name(PlayerEvents.mediaItemHistoryUpdated.rawValue), object: mediaItemId)
    }
}
