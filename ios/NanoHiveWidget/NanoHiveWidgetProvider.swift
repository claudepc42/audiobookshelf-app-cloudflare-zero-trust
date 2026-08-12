//
//  NanoHiveWidgetProvider.swift
//  NanoHiveWidget
//
//  Reads the latest WidgetSnapshot from the App Group shared UserDefaults
//  (written by the main app's WidgetDataBridge — this extension runs in its
//  own process and has no other way to see playback state). A single-entry
//  timeline is sufficient since the main app calls
//  WidgetCenter.reloadTimelines(ofKind:) on every real state change; this
//  widget doesn't need to predict future entries the way a live countdown
//  widget would.
//

import WidgetKit

struct NanoHiveWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct NanoHiveWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> NanoHiveWidgetEntry {
        NanoHiveWidgetEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (NanoHiveWidgetEntry) -> Void) {
        completion(NanoHiveWidgetEntry(date: Date(), snapshot: WidgetSharedStorage.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NanoHiveWidgetEntry>) -> Void) {
        let entry = NanoHiveWidgetEntry(date: Date(), snapshot: WidgetSharedStorage.read())
        // .never — the main app drives redraws explicitly via reloadTimelines(ofKind:)
        // whenever playback state actually changes, rather than this widget polling.
        completion(Timeline(entries: [entry], policy: .never))
    }
}
