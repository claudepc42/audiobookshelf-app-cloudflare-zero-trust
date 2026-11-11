package com.audiobookshelf.app.plugins

import android.content.ComponentName
import android.content.pm.PackageManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * The home-screen icons the app can switch between. Each one is an activity-alias in AndroidManifest.xml
 * that points at MainActivity and carries its own icon; exactly one alias is enabled at a time and the
 * launcher shows that one.
 *
 * To add an icon:
 *  1. Add the icon resources (mipmap-anydpi-v26/ic_launcher_<name>.xml and its _round twin, plus the
 *     foreground PNGs and a background color).
 *  2. Add an <activity-alias> for it in AndroidManifest.xml, android:enabled="false", like the others.
 *  3. Add its id and alias name to [aliases] below.
 *  4. Add the same id to LAUNCHER_ICONS in plugins/capacitor/AbsLauncherIcon.js, with its label string.
 */
object LauncherIcons {
  // id (what the JS side uses) to the alias's full class name. The first entry is the default: the alias
  // that is enabled in the manifest until the user picks another.
  val aliases = linkedMapOf(
    "default" to "com.audiobookshelf.app.LauncherDefault",
    "nanohive" to "com.audiobookshelf.app.LauncherNanoHive",
    "dark" to "com.audiobookshelf.app.LauncherDark",
    "gold" to "com.audiobookshelf.app.LauncherGold",
    "midnight" to "com.audiobookshelf.app.LauncherMidnight"
  )
}

@CapacitorPlugin(name = "AbsLauncherIcon")
class AbsLauncherIcon : Plugin() {
  private val defaultId = LauncherIcons.aliases.keys.first()

  private fun component(id: String) = ComponentName(context, LauncherIcons.aliases.getValue(id))

  // COMPONENT_ENABLED_STATE_DEFAULT means whatever the manifest says: enabled for the default alias, disabled for the others
  private fun isEnabled(id: String): Boolean {
    val state = context.packageManager.getComponentEnabledSetting(component(id))
    return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && id == defaultId)
  }

  @PluginMethod
  fun getIcon(call: PluginCall) {
    val current = LauncherIcons.aliases.keys.firstOrNull { isEnabled(it) } ?: defaultId
    call.resolve(com.getcapacitor.JSObject().put("id", current))
  }

  @PluginMethod
  fun setIcon(call: PluginCall) {
    val id = call.getString("id")
    if (id == null || !LauncherIcons.aliases.containsKey(id)) {
      call.reject("Unknown icon: $id")
      return
    }
    val pm = context.packageManager
    // Enable the new one first so there is never a moment with no launcher entry
    pm.setComponentEnabledSetting(component(id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
    LauncherIcons.aliases.keys.filter { it != id }.forEach {
      pm.setComponentEnabledSetting(component(it), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
    }
    call.resolve(com.getcapacitor.JSObject().put("id", id))
  }
}
