package com.audiobookshelf.app.plugins

import android.annotation.SuppressLint
import android.app.Dialog
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import com.audiobookshelf.app.device.DeviceManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.audiobookshelf.app.data.ServerConnectionConfig
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

@CapacitorPlugin(name = "AbsCfZeroTrust")
class AbsCfZeroTrust : Plugin() {
  private val tag = "AbsCfZeroTrust"

  companion object {
    var instance: AbsCfZeroTrust? = null

    fun notifyCfSessionExpired() {
      instance?.let { plugin ->
        Log.d("AbsCfZeroTrust", "Notifying JS of CF session expiry")
        plugin.notifyListeners("cfSessionExpired", JSObject(), true)
      }
    }

    // One client for every probe (each one used to build two, with their own pools and threads)
    private val probeClient: OkHttpClient by lazy {
      OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .followRedirects(false)
        .build()
    }

    // CF Zero Trust only protects specific paths. Probe media paths first (/hls/, /s/)
    // since those are what CF guards in a typical ABS setup, then fall back to /status.
    private val probePaths = listOf("/hls/", "/s/", "/status")

    private val cfCheckInFlight = AtomicBoolean(false)

    /** The same test the JS side uses to decide a connection went through Cloudflare */
    fun isCfConnection(config: ServerConnectionConfig?): Boolean {
      return config != null && (config.isSsoAuth || !config.customHeaders?.get("Cookie").isNullOrEmpty())
    }

    /** True if [path] on the server answers with a redirect to Cloudflare Access. Null on a network error. */
    private fun redirectsToCf(serverAddress: String, path: String, cookies: String): Boolean? {
      return try {
        val builder = Request.Builder().url("$serverAddress$path").head()
        if (cookies.isNotEmpty()) builder.addHeader("Cookie", cookies)
        probeClient.newCall(builder.build()).execute().use { response ->
          val location = response.header("Location") ?: ""
          if (response.code in 300..399 && location.isNotEmpty()) {
            val host = Uri.parse(location).host ?: ""
            host == "cloudflareaccess.com" || host.endsWith(".cloudflareaccess.com")
          } else {
            false
          }
        }
      } catch (e: Exception) {
        null
      }
    }

    /**
     * Finds a path that Cloudflare Access protects, i.e. one that redirects an unauthenticated
     * request to the CF login. Returns null if none does, or if the server couldn't be reached.
     */
    fun findCfProtectedPath(serverAddress: String): String? {
      for (path in probePaths) {
        val redirected = redirectsToCf(serverAddress, path, "")
        if (redirected == true) return path
        // The server can't be reached; the remaining paths would only repeat the timeout
        if (redirected == null) return null
      }
      return null
    }

    fun probeCfChallenge(serverAddress: String): Boolean = findCfProtectedPath(serverAddress) != null

    enum class CookieState { VALID, STALE, UNKNOWN }

    /** Tests [cookies] against the path that was found to be protected */
    fun checkCookies(serverAddress: String, path: String, cookies: String): CookieState {
      if (cookies.isEmpty()) return CookieState.STALE
      return when (redirectsToCf(serverAddress, path, cookies)) {
        true -> CookieState.STALE
        false -> CookieState.VALID
        null -> CookieState.UNKNOWN // a timeout says nothing about the cookie
      }
    }

    /**
     * Called by native code that got a CF-looking failure (a non-JSON reply, a failed download, a
     * stream error). Looks at the real session of the saved primary address, off the calling thread,
     * one check at a time, and tells JS only if the session really is stale.
     * [onExpired] runs on the background thread.
     */
    fun checkSessionAndNotify(onExpired: () -> Unit = {}) {
      val config = DeviceManager.serverConnectionConfig
      // No CF session to go stale on a connection that never went through CF
      if (!isCfConnection(config) || config == null) return
      if (!cfCheckInFlight.compareAndSet(false, true)) return
      thread(isDaemon = true) {
        try {
          // The primary address, not whatever route (LAN or primary) the failing request used
          val path = findCfProtectedPath(config.address)
          if (path != null && checkCookies(config.address, path, config.customHeaders?.get("Cookie") ?: "") == CookieState.STALE) {
            Log.w("AbsCfZeroTrust", "CF session is stale — notifying JS")
            notifyCfSessionExpired()
            onExpired()
          }
        } finally {
          cfCheckInFlight.set(false)
        }
      }
    }
  }

  @PluginMethod
  fun probeCfChallenge(call: PluginCall) {
    val serverAddress = call.getString("serverAddress") ?: run {
      call.reject("serverAddress is required")
      return
    }
    val existingCookies = call.getString("cookies") ?: ""
    Thread {
      val protectedPath = findCfProtectedPath(serverAddress)
      val cookieState = if (protectedPath != null) checkCookies(serverAddress, protectedPath, existingCookies) else CookieState.STALE
      val result = JSObject()
      result.put("isCfProtected", protectedPath != null)
      result.put("cookiesValid", cookieState == CookieState.VALID)
      // The check itself failed (timeout, no signal): callers keep the saved cookie and skip the login
      result.put("cookiesUnknown", cookieState == CookieState.UNKNOWN)
      call.resolve(result)
    }.also { it.isDaemon = true }.start()
  }

  override fun load() {
    instance = this
  }

  @SuppressLint("SetJavaScriptEnabled")
  @PluginMethod
  fun openCfWebView(call: PluginCall) {
    val serverAddress = call.getString("serverAddress") ?: run {
      call.reject("serverAddress is required")
      return
    }

    val serverHost = try { Uri.parse(serverAddress).host ?: "" } catch (e: Exception) { "" }
    if (serverHost.isEmpty()) {
      call.reject("Invalid serverAddress")
      return
    }

    activity.runOnUiThread {
      val dialog = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
      val webView = WebView(activity)

      webView.settings.javaScriptEnabled = true
      webView.settings.domStorageEnabled = true
      // A bare WebView with neither of these set falls back to Android's legacy
      // default of assuming a ~980px desktop-width layout regardless of actual
      // screen size — pages render huge and unscaled instead of at their real
      // mobile-responsive size. Every other WebView in this app already gets
      // this from Capacitor's own setup; this one's created fresh just for
      // this dialog and never inherited it.
      webView.settings.useWideViewPort = true
      webView.settings.loadWithOverviewMode = true

      CookieManager.getInstance().setAcceptCookie(true)
      CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

      var resolved = false

      // URL indicator so the user can see what host they're authenticating against
      val urlBar = TextView(activity).apply {
        text = serverHost
        setTextColor(Color.parseColor("#AAAAAA"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        gravity = Gravity.CENTER_VERTICAL
        setPadding(16, 12, 16, 12)
      }

      // Only escape route used to be the hardware back button (dialog is already
      // cancelable — see setOnDismissListener below, which every caller already
      // handles gracefully by proceeding without the refreshed session). Nobody
      // finds that from what looks like a stuck loading webpage, especially if
      // the device has just enough signal to start the page load but not enough
      // to ever finish it — this can sit there indefinitely with nothing on
      // screen telling the user they aren't stuck.
      val cancelText = TextView(activity).apply {
        text = "Cancel"
        setTextColor(Color.parseColor("#DDDAD6"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
        gravity = Gravity.CENTER_VERTICAL
        paintFlags = paintFlags or Paint.UNDERLINE_TEXT_FLAG
        setPadding(16, 12, 16, 12)
        setOnClickListener { dialog.dismiss() }
      }

      val headerBar = LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        setBackgroundColor(Color.parseColor("#111111"))
        addView(urlBar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        addView(cancelText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      }

      webView.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
          return false
        }

        override fun onPageFinished(view: WebView?, url: String?) {
          if (url == null || resolved) return
          val currentHost = try { Uri.parse(url).host ?: "" } catch (e: Exception) { "" }
          urlBar.text = currentHost

          if (currentHost == serverHost || currentHost.endsWith(".$serverHost")) {
            val serverOrigin = try {
              val u = Uri.parse(serverAddress)
              "${u.scheme}://${u.host}${if (u.port != -1) ":${u.port}" else ""}"
            } catch (e: Exception) { serverAddress }
            val allCookies = CookieManager.getInstance().getCookie(serverOrigin)
            if (!allCookies.isNullOrEmpty() && allCookies.contains("CF_Authorization=")) {
              Log.d(tag, "CF auth complete, cookies extracted for host $currentHost")
              resolved = true
              dialog.dismiss()
              val result = JSObject()
              result.put("cookieHeader", allCookies)
              call.resolve(result)
            }
          }
        }
      }

      val layout = LinearLayout(activity)
      layout.orientation = LinearLayout.VERTICAL
      layout.addView(headerBar, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ))
      layout.addView(webView, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.MATCH_PARENT
      ))

      dialog.setContentView(layout)
      dialog.setCancelable(true)
      dialog.setOnDismissListener {
        if (!resolved) {
          call.reject("cancelled")
        }
        // Without this every login leaks its WebView until garbage collection
        webView.stopLoading()
        webView.destroy()
      }
      dialog.show()
      webView.loadUrl(serverAddress)
    }
  }
}
