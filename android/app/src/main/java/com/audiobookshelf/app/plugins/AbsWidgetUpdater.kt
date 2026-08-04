package com.audiobookshelf.app.plugins

import com.audiobookshelf.app.device.DeviceManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Lets the JS side ask both home-screen widgets to redraw right now, using
 * their last known playback content — for purely cosmetic changes (currently
 * just the NH UI Glass Effect Tuner's widget-opacity slider) that otherwise
 * wouldn't show up on the home screen until the next real play/pause event.
 */
@CapacitorPlugin(name = "AbsWidgetUpdater")
class AbsWidgetUpdater : Plugin() {
  @PluginMethod
  fun refresh(call: PluginCall) {
    DeviceManager.refreshWidgets(context)
    call.resolve()
  }
}
