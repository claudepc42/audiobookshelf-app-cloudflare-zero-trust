//
//  NanoHiveWidgetBundle.swift
//  NanoHiveWidget
//
//  Entry point for the widget extension target. The kind string
//  ("NanoHiveWidget") must match WidgetDataBridge.swift's
//  reloadTimelines(ofKind:) calls in the main app target.
//

import WidgetKit
import SwiftUI

struct NanoHiveWidget: Widget {
    let kind: String = "NanoHiveWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NanoHiveWidgetProvider()) { entry in
            NanoHiveWidgetView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Audiobookshelf")
        .description("NanoHive-themed widget for audiobookshelf playback")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct NanoHiveWidgetBundle: WidgetBundle {
    var body: some Widget {
        NanoHiveWidget()
    }
}
