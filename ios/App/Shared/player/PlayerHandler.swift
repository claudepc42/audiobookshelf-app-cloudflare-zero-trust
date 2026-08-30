//
//  PlayerHandler.swift
//  App
//
//  Created by Rasmus Krämer on 11.04.22.
//

import Foundation
import RealmSwift

class PlayerHandler {
    private static var player: AudioPlayer?
    
    public static func startPlayback(sessionId: String, playWhenReady: Bool, playbackRate: Float) {
        guard let session = Database.shared.getPlaybackSession(id: sessionId) else { return }

        // Clean up the existing player, syncing + recording its final progress as a "Pause"
        // (matches the prior behavior when switching sessions mid-playback)
        resetPlayer(firing: .pause)

        // Cleanup and sync old sessions
        cleanupOldSessions(currentSessionId: sessionId)

        // Set now playing info
        NowPlayingInfo.shared.setSessionMetadata(metadata: NowPlayingMetadata(id: session.id, itemId: session.libraryItemId!, title: session.displayTitle ?? "Unknown title", author: session.displayAuthor, series: nil, isLocal: session.isLocal, serverAddress: session.serverAddress))

        // Create the audio player
        player = AudioPlayer(sessionId: sessionId, playWhenReady: playWhenReady, playbackRate: playbackRate)
    }

    public static func stopPlayback(currentSessionId: String? = nil) {
        resetPlayer(firing: .stop)
        cleanupOldSessions(currentSessionId: currentSessionId)
        NowPlayingInfo.shared.reset()
    }
    
    public static var paused: Bool {
        get {
            guard let player = player else { return true }
            return player.rateManager.rate == 0.0
        }
        set(paused) {
            if paused {
                self.player?.pause()
            } else {
                self.player?.play(allowSeekBack: true)
            }
        }
    }
    
    public static func getCurrentTime() -> Double? {
        self.player?.getCurrentTime()
    }
    
    public static func getPlayWhenReady() -> Bool {
        self.player?.playWhenReady ?? false
    }
    
    public static func setPlaybackSpeed(speed: Float) {
        self.player?.setPlaybackRate(speed)
    }
    
    public static func setChapterTrack() {
        self.player?.setChapterTrack()
    }

    public static func getSleepTimeRemaining() -> Double? {
        return self.player?.getSleepTimeRemaining()
    }
    
    public static func setSleepTime(secondsUntilSleep: Double) {
        self.player?.setSleepTimer(secondsUntilSleep: secondsUntilSleep)
    }
    
    public static func setChapterSleepTime(stopAt: Double) {
        self.player?.setChapterSleepTimer(stopAt: stopAt)
    }
    
    public static func increaseSleepTime(increaseSeconds: Double) {
        self.player?.increaseSleepTime(extraTimeInSeconds: increaseSeconds)
    }
    
    public static func decreaseSleepTime(decreaseSeconds: Double) {
        self.player?.decreaseSleepTime(removeTimeInSeconds: decreaseSeconds)
    }
    
    public static func cancelSleepTime() {
        self.player?.removeSleepTimer()
    }
    
    public static func getPlayMethod() -> Int? {
        self.player?.getPlayMethod()
    }
    
    public static func getPlaybackSession() -> PlaybackSession? {
        guard let player = player else { return nil }

        return player.getPlaybackSession()
    }
    
    public static func seekForward(amount: Double) {
        guard let player = player else { return }
        guard player.isInitialized() else { return }
        guard let currentTime = player.getCurrentTime() else { return }
        
        let destinationTime = currentTime + amount
        player.seek(destinationTime, from: "handler")
    }
    
    public static func seekBackward(amount: Double) {
        guard let player = player else { return }
        guard player.isInitialized() else { return }
        guard let currentTime = player.getCurrentTime() else { return }
        
        let destinationTime = currentTime - amount
        player.seek(destinationTime, from: "handler")
    }
    
    public static func seek(amount: Double) {
        guard let player = player else { return }
        guard player.isInitialized() else { return }
        
        player.seek(amount, from: "handler")
    }
    
    public static func getMetdata() -> PlaybackMetadata? {
        guard let player = player else { return nil }
        guard player.isInitialized() else { return nil }

        return PlaybackMetadata(
            duration: player.getDuration() ?? 0,
            currentTime: player.getCurrentTime() ?? 0,
            playerState: player.getPlayerState()
        )
    }
    
    public static func updateRemoteTransportControls() {
        self.player?.setupRemoteTransportControls()
    }
    
    // MARK: - Helper logic
    
    private static func cleanupOldSessions(currentSessionId: String?) {
        do {
            let realm = try Realm()
            let oldSessions = realm.objects(PlaybackSession.self) .where({
                $0.isActiveSession == true && $0.serverConnectionConfigId == Store.serverConfig?.id
            })
            try realm.write {
                for s in oldSessions {
                    if s.id != currentSessionId {
                        s.isActiveSession = false
                    }
                }
            }
        } catch {
            debugPrint("Failed to cleanup sessions")
            debugPrint(error)
        }
    }
    
    /// Which history event a torn-down player's final sync result should be attached to.
    private enum TerminalEventKind {
        case pause  // session-switch cleanup (startPlayback) — playback is continuing, just on a new session
        case stop   // an explicit stop (stopPlayback) — playback is genuinely ending
    }

    /// Tears down the current player, syncing its final progress and recording exactly one
    /// terminal history event carrying that sync's real result.
    ///
    /// Matches MediaProgressSyncer.kt's stop()/pause() flow: sync first, then fire the event
    /// with whatever result came back — rather than firing the event immediately (with no
    /// data) and syncing as an unrelated side effect afterward, which is what this used to do
    /// via AudioPlayer.pause()'s own async sync running after destroy() had already cleared
    /// PlayerHandler.player. The session is frozen and captured here, before destroy() runs
    /// and before the async sync below, since: (a) Realm objects are thread-confined and can't
    /// cross into the Task unfrozen, and (b) the sync's own "delete session after a successful
    /// sync of a no-longer-active session" cleanup (PlayerProgress.swift) can remove the live
    /// Realm row before this continuation resumes — a frozen snapshot stays valid regardless,
    /// so the event no longer silently vanishes depending on how that race lands.
    private static func resetPlayer(firing eventKind: TerminalEventKind) {
        guard let currentPlayer = player else { return }

        let session = currentPlayer.getPlaybackSession()?.freeze()
        let wasPlaying = currentPlayer.isPlaying()
        let currentTime = currentPlayer.getCurrentTime()

        currentPlayer.destroy()
        player = nil

        guard let session = session else { return }
        Task {
            var syncResult: MediaSyncResult? = nil
            if let currentTime = currentTime {
                syncResult = await PlayerProgress.shared.syncFromPlayer(currentTime: currentTime, includesPlayProgress: wasPlaying, isStopping: true)
            }
            switch eventKind {
            case .stop:
                MediaEventManager.stopEvent(session, syncResult: syncResult)
            case .pause:
                if wasPlaying {
                    MediaEventManager.pauseEvent(session, syncResult: syncResult)
                }
            }
        }
    }
}
