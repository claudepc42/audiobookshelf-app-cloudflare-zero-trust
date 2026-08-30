//
//  WidgetDataBridge.swift
//  App
//
//  Main-app-only. Listens for playback events (same NotificationCenter posts
//  AbsAudioPlayer.swift already listens to) and writes a WidgetSnapshot into
//  the App Group shared UserDefaults, then asks WidgetKit to redraw.
//
//  Mirrors DeviceManager.initializeWidgetUpdater on Android, but instead of
//  building RemoteViews directly, it hands a plain data snapshot to a
//  separate process (the widget extension can't see this app's in-memory
//  Store/PlayerHandler state at all — App Group storage is the only bridge).
//
//  Reload cadence is throttled to real state changes (play/pause, track
//  change, session close) plus a coarse 15s bucket on top of that — WidgetKit
//  budgets timeline reloads system-wide, so reloading on every 1s playback
//  tick (like the now-playing UI does) would both waste that budget and get
//  silently throttled by the system anyway. Android's own widget has the same
//  non-realtime cadence — it only redraws on real player-state callbacks, not
//  a per-second timer.
//

import Foundation
import WidgetKit

class WidgetDataBridge {
    static let shared = WidgetDataBridge()

    private var lastTitle: String?
    private var lastIsPlaying: Bool?
    private var lastTimeBucket: Int?

    private init() {
        NotificationCenter.default.addObserver(self, selector: #selector(onUpdate), name: NSNotification.Name(PlayerEvents.update.rawValue), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onClosed), name: NSNotification.Name(PlayerEvents.closed.rawValue), object: nil)
    }

    @objc private func onUpdate() {
        guard let session = PlayerHandler.getPlaybackSession() else { return }
        let isPlaying = !PlayerHandler.paused
        let currentTime = PlayerHandler.getCurrentTime() ?? session.currentTime
        let bucket = Int(currentTime / 15)

        let titleChanged = session.displayTitle != lastTitle
        let playingChanged = isPlaying != lastIsPlaying
        let bucketAdvanced = bucket != lastTimeBucket

        guard titleChanged || playingChanged || bucketAdvanced else { return }

        lastTitle = session.displayTitle
        lastIsPlaying = isPlaying
        lastTimeBucket = bucket

        writeSnapshot(session: session, isPlaying: isPlaying, isAppClosed: false, currentTimeOverride: currentTime)
        WidgetCenter.shared.reloadTimelines(ofKind: "NanoHiveWidget")
    }

    @objc private func onClosed() {
        lastTitle = nil
        lastIsPlaying = nil
        lastTimeBucket = nil
        writeSnapshot(session: nil, isPlaying: false, isAppClosed: true, currentTimeOverride: nil)
        WidgetCenter.shared.reloadTimelines(ofKind: "NanoHiveWidget")
    }

    /// Called by AbsWidgetUpdater's `refresh()` for cosmetic-only changes (NH
    /// Glass Effect Tuner's widget-opacity slider) — redraws with whatever the
    /// last known playback content was, same as Android's refreshWidgets().
    func refreshCosmeticOnly() {
        let session = PlayerHandler.getPlaybackSession()
        writeSnapshot(session: session, isPlaying: !PlayerHandler.paused, isAppClosed: session == nil, currentTimeOverride: nil)
        WidgetCenter.shared.reloadTimelines(ofKind: "NanoHiveWidget")
    }

    private func writeSnapshot(session: PlaybackSession?, isPlaying: Bool, isAppClosed: Bool, currentTimeOverride: Double?) {
        let nh = Self.readNhSettings()
        let currentTime = currentTimeOverride ?? session?.currentTime ?? 0
        let duration = session?.duration ?? 0
        let progress = duration > 0 ? (currentTime / duration).clamped(to: 0...1) : 0

        let snapshot = WidgetSnapshot(
            title: session?.displayTitle ?? "Not Playing",
            author: session?.displayAuthor ?? "",
            coverUrlString: Self.coverUrlString(for: session),
            isPlaying: isPlaying,
            isAppClosed: isAppClosed,
            progress: progress,
            currentTime: currentTime,
            duration: duration,
            accentColorHex: nh.accent,
            canvasColorHex: nh.canvas,
            opacity: nh.opacity
        )
        WidgetSharedStorage.write(snapshot)
    }

    private static func coverUrlString(for session: PlaybackSession?) -> String? {
        guard let session = session, let libraryItemId = session.libraryItemId else { return nil }
        let address = session.serverAddress ?? Store.effectiveAddress
        guard !address.isEmpty else { return nil }
        if Store.isServerVersionGreaterThanOrEqualTo("2.17.0") {
            return "\(address)/api/items/\(libraryItemId)/cover"
        }
        return "\(address)/api/items/\(libraryItemId)/cover?token=\(Store.serverConfig?.token ?? "")"
    }

    // Same "CapacitorStorage.<key>" UserDefaults.standard convention as
    // node_modules/@capacitor/preferences's iOS plugin — see NanoHiveMediaPlayerWidget.kt's
    // readNhSettingsJson for the Android-side equivalent this mirrors.
    private static func readNhSettings() -> (accent: String, canvas: String, opacity: Double) {
        let fallback = (accent: "#e0c27a", canvas: "#181512", opacity: 0.67)
        guard let raw = UserDefaults.standard.string(forKey: "CapacitorStorage.nhSettings"),
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return fallback
        }

        let accent = (json["accentColor"] as? String) ?? fallback.accent

        let baseTheme = (json["baseTheme"] as? String) ?? "warm"
        let canvas = Self.nhBaseThemeCanvas[baseTheme] ?? fallback.canvas

        var opacity = fallback.opacity
        if let glassEffect = json["nhGlassEffect"] as? [String: Any],
           let cssVars = glassEffect["cssVars"] as? [String: Any],
           let value = cssVars["--nh-widget-opacity"] as? Double {
            opacity = value.clamped(to: 0...1)
        }

        return (accent, canvas, opacity)
    }

    // Ported from store/index.js's NH_BASE_THEMES — keep in sync with
    // NanoHiveMediaPlayerWidget.kt's NH_BASE_THEME_CANVAS if a theme changes.
    private static let nhBaseThemeCanvas: [String: String] = [
        "warm": "#181512", "slate": "#111625", "black": "#080808", "navy": "#0a111a",
        "mocha": "#231c18", "pine": "#121a15", "plum": "#1a1320", "crimson": "#1d1212",
        "ocean": "#0b1618", "sand": "#1c1814", "steel": "#13171c", "wine": "#1a1014"
    ]
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
