//
//  WidgetSnapshot.swift
//  App
//
//  Shared between the main app target and the NanoHiveWidget extension via an
//  App Group. This file must have BOTH targets checked under Target Membership
//  in Xcode (see the setup checklist) — it's the only thing the widget process
//  is allowed to know about playback state, since it can't see the app's
//  in-memory Store/PlayerHandler directly (separate process).
//

import Foundation

struct WidgetSnapshot: Codable {
    var title: String
    var author: String
    var coverUrlString: String?
    var isPlaying: Bool
    var isAppClosed: Bool
    var progress: Double      // 0.0 - 1.0
    var currentTime: Double   // seconds
    var duration: Double      // seconds
    var accentColorHex: String
    var canvasColorHex: String
    var opacity: Double       // 0.0 - 1.0, NH Glass Effect Tuner's widget-opacity slider

    static let empty = WidgetSnapshot(
        title: "Not Playing",
        author: "",
        coverUrlString: nil,
        isPlaying: false,
        isAppClosed: true,
        progress: 0,
        currentTime: 0,
        duration: 0,
        accentColorHex: "#e0c27a",
        canvasColorHex: "#181512",
        opacity: 0.67
    )

    // Mirrors Vue.prototype.$secondsToTimestamp / formatWidgetTimestamp in
    // NanoHiveMediaPlayerWidget.kt — "m:ss", or "h:mm:ss" once there's a whole hour.
    static func formatTimestamp(_ seconds: Double) -> String {
        var secs = Int(seconds.rounded(.down))
        if secs < 0 { secs = 0 }
        let hours = secs / 3600
        secs %= 3600
        let minutes = secs / 60
        secs %= 60
        if hours == 0 {
            return String(format: "%d:%02d", minutes, secs)
        }
        return String(format: "%d:%02d:%02d", hours, minutes, secs)
    }
}

// App Group identifier shared between the App target and the NanoHiveWidget
// extension target. MUST match the App Group capability added to both targets
// in Xcode (Signing & Capabilities → + Capability → App Groups) — update this
// string once the real bundle identifier is chosen (see setup checklist).
enum WidgetSharedStorage {
    static let appGroupId = "group.com.audiobookshelf.app.widget"
    static let snapshotKey = "widgetSnapshot"

    static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    static func write(_ snapshot: WidgetSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: snapshotKey)
    }

    static func read() -> WidgetSnapshot {
        guard let data = defaults?.data(forKey: snapshotKey),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data) else {
            return .empty
        }
        return snapshot
    }
}
