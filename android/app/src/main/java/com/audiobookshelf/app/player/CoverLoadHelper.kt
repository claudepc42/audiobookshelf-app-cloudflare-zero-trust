package com.audiobookshelf.app.player

import android.net.Uri
import com.audiobookshelf.app.device.DeviceManager
import com.audiobookshelf.app.server.ApiHandler
import com.bumptech.glide.load.model.GlideUrl
import com.bumptech.glide.load.model.LazyHeaders

/**
 * What to hand to Glide for a cover URL. Away from home, with Cloudflare protecting the server,
 * a plain URL gets the CF login page instead of the cover, so covers on the primary address are
 * loaded with the connection's custom headers. Anything else (the LAN address, local files, app
 * resources) loads as before.
 */
object CoverLoadHelper {
  fun glideModel(uri: Uri): Any {
    if (uri.scheme != "http" && uri.scheme != "https") return uri
    val headers = ApiHandler.customHeadersFor(uri.toString(), DeviceManager.serverConnectionConfig)
    if (headers.isNullOrEmpty()) return uri
    val lazyHeaders = LazyHeaders.Builder()
    headers.forEach { (name, value) -> lazyHeaders.addHeader(name, value) }
    return GlideUrl(uri.toString(), lazyHeaders.build())
  }
}
