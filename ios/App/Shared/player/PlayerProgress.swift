//
//  PlayerProgressSync.swift
//  App
//
//  Created by Ron Heft on 8/19/22.
//

import Foundation
import UIKit
import RealmSwift

class PlayerProgress {
    public static let shared = PlayerProgress()
    
    private static var TIME_BETWEEN_SESSION_SYNC_IN_SECONDS = 15.0
    
    private init() {}
    
    
    // MARK: - SYNC HOOKS
    
    /// - Parameter sessionId: When provided, resolves the session directly via
    ///   Database.shared.getPlaybackSession(id:) instead of PlayerHandler.getPlaybackSession().
    ///   Needed by callers that sync *after* PlayerHandler.player has already been cleared
    ///   (PlayerHandler.resetPlayer(firing:) tears the player down before this runs, so the
    ///   default PlayerHandler.player-based lookup would resolve to nil and the sync would
    ///   silently no-op). Callers where the player is still the active one (pause(), play(),
    ///   the periodic 15s save-timer) can omit this and keep resolving via PlayerHandler.player.
    @discardableResult
    public func syncFromPlayer(currentTime: Double, includesPlayProgress: Bool, isStopping: Bool, sessionId: String? = nil) async -> MediaSyncResult? {
        let backgroundToken = await UIApplication.shared.beginBackgroundTask(withName: "ABS:syncFromPlayer")
        var syncResult: MediaSyncResult? = nil
        do {
            let session = try updateLocalSessionFromPlayer(currentTime: currentTime, includesPlayProgress: includesPlayProgress, sessionId: sessionId)
            try updateLocalMediaProgressFromLocalSession(sessionId: sessionId)
            if let session = session {
                syncResult = try await updateServerSessionFromLocalSession(session, rateLimitSync: !isStopping)
            }
        } catch {
            AbsLogger.error(message: "Failed to syncFromPlayer \(error)", error: error)
        }
        await UIApplication.shared.endBackgroundTask(backgroundToken)
        return syncResult
    }


    // MARK: - SYNC LOGIC

    /// sessionId, when provided, bypasses PlayerHandler.getPlaybackSession() (which depends on
    /// PlayerHandler.player still being set) and fetches the session directly instead.
    private func resolveSession(sessionId: String?) -> PlaybackSession? {
        if let sessionId = sessionId {
            return Database.shared.getPlaybackSession(id: sessionId)
        }
        return PlayerHandler.getPlaybackSession()
    }

    private func updateLocalSessionFromPlayer(currentTime: Double, includesPlayProgress: Bool, sessionId: String? = nil) throws -> PlaybackSession? {
        guard let session = resolveSession(sessionId: sessionId) else { return nil }
        guard !currentTime.isNaN else { return nil } // Prevent bad data on player stop
        
        try session.update {
            session.realm?.refresh()
            
            let nowInSeconds = Date().timeIntervalSince1970
            let nowInMilliseconds = nowInSeconds * 1000
            let lastUpdateInMilliseconds = session.updatedAt ?? nowInMilliseconds
            let lastUpdateInSeconds = lastUpdateInMilliseconds / 1000
            let secondsSinceLastUpdate = nowInSeconds - lastUpdateInSeconds
            
            session.currentTime = currentTime
            session.updatedAt = nowInMilliseconds
            
            if includesPlayProgress {
                session.timeListening += secondsSinceLastUpdate
            }
        }
        
        return session.freeze()
    }
    
    private func updateLocalMediaProgressFromLocalSession(sessionId: String? = nil) throws {
        guard let session = resolveSession(sessionId: sessionId) else { return }
        guard session.isLocal else { return }
        
        let localMediaProgress = try LocalMediaProgress.fetchOrCreateLocalMediaProgress(localMediaProgressId: session.localMediaProgressId, localLibraryItemId: session.localLibraryItem?.id, localEpisodeId: session.episodeId)
        guard let localMediaProgress = localMediaProgress else {
            // Local media progress should have been created
            // If we're here, it means a library id is invalid
            return
        }

        try localMediaProgress.updateFromPlaybackSession(session)
        
        AbsLogger.info(message:"Local progress saved to the database")
        
        // Send the local progress back to front-end
        NotificationCenter.default.post(name: NSNotification.Name(PlayerEvents.localProgress.rawValue), object: nil)
    }
    
    private func updateAllServerSessionFromLocalSession() async throws {
        try await withThrowingTaskGroup(of: Void.self) { [self] group in
            for session in try Realm(queue: nil).objects(PlaybackSession.self).where({ $0.serverConnectionConfigId == Store.serverConfig?.id }) {
                let session = session.freeze()
                group.addTask {
                    _ = try await self.updateServerSessionFromLocalSession(session)
                }
            }
            try await group.waitForAll()
        }
    }
    
    @discardableResult
    private func updateServerSessionFromLocalSession(_ session: PlaybackSession, rateLimitSync: Bool = false) async throws -> MediaSyncResult {
        if ProcessInfo.processInfo.isLowPowerModeEnabled == true {
            PlayerProgress.TIME_BETWEEN_SESSION_SYNC_IN_SECONDS = 60.0
        } else {
            PlayerProgress.TIME_BETWEEN_SESSION_SYNC_IN_SECONDS = 15.0
        }
        var safeToSync = true

        guard var session = session.thaw() else { return MediaSyncResult(serverSyncAttempted: false, serverSyncSuccess: nil, serverSyncMessage: nil) }

        // We need to update and check the server time in a transaction for thread-safety
        try session.update {
            session.realm?.refresh()

            let nowInMilliseconds = Date().timeIntervalSince1970 * 1000
            let lastUpdateInMilliseconds = session.serverUpdatedAt

            // If required, rate limit requests based on session last update
            if rateLimitSync {
                let timeSinceLastSync = nowInMilliseconds - lastUpdateInMilliseconds
                let timeBetweenSessionSync = PlayerProgress.TIME_BETWEEN_SESSION_SYNC_IN_SECONDS * 1000
                safeToSync = timeSinceLastSync > timeBetweenSessionSync
                if !safeToSync {
                    return // This only exits the update block
                }
            }

            session.serverUpdatedAt = nowInMilliseconds
        }
        session = session.freeze()

        guard safeToSync else { return MediaSyncResult(serverSyncAttempted: false, serverSyncSuccess: nil, serverSyncMessage: nil) }
        AbsLogger.info(message:"Sending sessionId(\(session.id)) to server with currentTime(\(session.currentTime))")

        var success = false
        if session.isLocal {
            success = await ApiClient.reportLocalPlaybackProgress(session)
        } else {
            let playbackReport = PlaybackReport(currentTime: session.currentTime, duration: session.duration, timeListened: session.timeListening)
            success = await ApiClient.reportPlaybackProgress(report: playbackReport, sessionId: session.id)
            // Reset time listening becuase server expects that time to be since last sync, not for the whole session
            if success {
                if let session = session.thaw() {
                    try session.update {
                        session.timeListening = 0
                    }
                }
            }
        }


        // Remove old sessions after they synced with the server
        if success && !session.isActiveSession {
            if let session = session.thaw() {
                try session.delete()
            }
        }

        return MediaSyncResult(serverSyncAttempted: true, serverSyncSuccess: success, serverSyncMessage: success ? nil : "Failed to sync playback progress")
    }
    
    // TODO: Unused for now
    private func updateLocalSessionFromServerMediaProgress() async throws {
        AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: Checking if local media progress was updated on server")
        guard let session = try Realm(queue: nil).objects(PlaybackSession.self).last(where: {
            $0.isActiveSession == true && $0.serverConnectionConfigId == Store.serverConfig?.id
        })?.freeze() else {
            AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: Failed to get session")
            return
        }
        
        // Fetch the current progress
        let progress = await ApiClient.getMediaProgress(libraryItemId: session.libraryItemId!, episodeId: session.episodeId)
        guard let progress = progress else {
            AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: No progress object")
            return
        }
        
        // Determine which session is newer
        let serverLastUpdate = progress.lastUpdate
        guard let localLastUpdate = session.updatedAt else {
            AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: No local session updatedAt")
            return
        }
        let serverCurrentTime = progress.currentTime
        let localCurrentTime = session.currentTime
        
        let serverIsNewerThanLocal = serverLastUpdate > localLastUpdate
        let currentTimeIsDifferent = serverCurrentTime != localCurrentTime
        
        // Update the session, if needed
        if serverIsNewerThanLocal && currentTimeIsDifferent {
            AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: Server has newer time than local serverLastUpdate=\(serverLastUpdate) localLastUpdate=\(localLastUpdate)")
            guard let session = session.thaw() else { return }
            try session.update {
                session.currentTime = serverCurrentTime
                session.updatedAt = serverLastUpdate
            }
            AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: Updated session currentTime newCurrentTime=\(serverCurrentTime) previousCurrentTime=\(localCurrentTime)")
            PlayerHandler.seek(amount: session.currentTime)
        } else {
            AbsLogger.info(message:"updateLocalSessionFromServerMediaProgress: Local session does not need updating; local has latest progress")
        }
    }
    
}
