//
//  AbsWidgetUpdater.swift
//  App
//
//  Swift port of AbsWidgetUpdater.kt — lets the JS side ask the widget to
//  redraw right now with its last known playback content, for purely
//  cosmetic changes (currently just the NH UI Glass Effect Tuner's
//  widget-opacity slider) that otherwise wouldn't show up until the next
//  real play/pause event.
//

import Foundation
import Capacitor

@objc(AbsWidgetUpdater)
public class AbsWidgetUpdater: CAPPlugin, CAPBridgedPlugin {
    public var identifier = "AbsWidgetUpdaterPlugin"
    public var jsName = "AbsWidgetUpdater"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise)
    ]

    @objc func refresh(_ call: CAPPluginCall) {
        WidgetDataBridge.shared.refreshCosmeticOnly()
        call.resolve()
    }
}
