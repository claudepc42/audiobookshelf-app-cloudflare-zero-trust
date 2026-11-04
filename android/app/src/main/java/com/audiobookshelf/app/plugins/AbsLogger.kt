package com.audiobookshelf.app.plugins

import android.util.Log
import com.audiobookshelf.app.device.DeviceManager
import com.fasterxml.jackson.core.json.JsonReadFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

data class AbsLog(
  var id:String,
  var tag:String,
  var level:String,
  var message:String,
  var timestamp:Long
)

data class AbsLogList(val value:List<AbsLog>)

@CapacitorPlugin(name = "AbsLogger")
class AbsLogger : Plugin() {
  private var jacksonMapper = jacksonObjectMapper().enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature())

  override fun load() {
    onLogEmitter = { log:AbsLog ->
      notifyListeners("onLog", JSObject(jacksonMapper.writeValueAsString(log)))
    }
    info("AbsLogger", "load: AbsLogger plugin initialized")
  }

  companion object {
    var onLogEmitter:((log:AbsLog) -> Unit)? = null

    // Old logs used to be cleared only when the activity was created, so an app process that stayed
    // alive for days never pruned. Also prune every so many logs, on a background thread.
    private const val CLEAN_EVERY_N_LOGS = 500
    private val logsSinceClean = AtomicInteger(0)

    fun log(level:String, tag:String, message:String) {
      val absLog = AbsLog(id = UUID.randomUUID().toString(), tag, level, message, timestamp = System.currentTimeMillis())
      DeviceManager.dbManager.saveLog(absLog)
      onLogEmitter?.let { it(absLog) }
      if (logsSinceClean.incrementAndGet() >= CLEAN_EVERY_N_LOGS) {
        logsSinceClean.set(0)
        thread(isDaemon = true) {
          try { DeviceManager.dbManager.cleanLogs() } catch (e: Exception) { Log.e("AbsLogger", "cleanLogs failed", e) }
        }
      }
    }
    fun info(tag:String, message:String) {
      Log.i("AbsLogger", message)
      log("info", tag, message)
    }
    fun error(tag:String, message:String) {
      Log.e("AbsLogger", message)
      log("error", tag, message)
    }
  }

  @PluginMethod
  fun info(call: PluginCall) {
    val msg = call.getString("message") ?: return call.reject("No message")
    val tag = call.getString("tag") ?: ""
    info(tag, msg)
    call.resolve()
  }

  @PluginMethod
  fun error(call: PluginCall) {
    val msg = call.getString("message") ?: return call.reject("No message")
    val tag = call.getString("tag") ?: ""
    error(tag, msg)
    call.resolve()
  }

  @PluginMethod
  fun getAllLogs(call: PluginCall) {
    val absLogs = DeviceManager.dbManager.getAllLogs()
    call.resolve(JSObject(jacksonMapper.writeValueAsString(AbsLogList(absLogs))))
  }

  @PluginMethod
  fun clearLogs(call: PluginCall) {
    DeviceManager.dbManager.removeAllLogs()
    call.resolve()
  }
}
