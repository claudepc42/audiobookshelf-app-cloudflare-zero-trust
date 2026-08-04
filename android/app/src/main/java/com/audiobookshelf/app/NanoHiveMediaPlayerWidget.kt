package com.audiobookshelf.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.media.session.MediaButtonReceiver
import com.audiobookshelf.app.data.PlaybackSession
import com.audiobookshelf.app.device.DeviceManager
import com.audiobookshelf.app.managers.DbManager
import com.bumptech.glide.Glide
import com.bumptech.glide.request.RequestOptions
import com.bumptech.glide.request.target.AppWidgetTarget
import com.bumptech.glide.request.transition.Transition
import org.json.JSONObject

/**
 * NanoHive-themed copy of MediaPlayerWidget.kt — a second, separate widget
 * registered alongside the original, not a replacement for it. Same data
 * source and behavior, different look: a single translucent glass bar
 * (small cover, title/author, transport controls, thin progress track)
 * deliberately shaped after the in-app mini player rather than the
 * original widget's boxy grid layout — "the mini player, just bigger."
 * Kept as a full duplicate rather than a shared layout because RemoteViews
 * widgets can't runtime-swap layouts/colors the way the Vue UI does.
 */
class NanoHiveMediaPlayerWidget : AppWidgetProvider() {
  val tag = "NanoHiveMediaPlayerWidget"
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    Log.d(tag, "onUpdate $appWidgetIds")
  }

  override fun onEnabled(context: Context) {
    Log.i(tag, "onEnabled check context ${context.packageName}")

    DbManager.initialize(context)

    DeviceManager.deviceData.lastPlaybackSession?.let {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val componentName = ComponentName(context, NanoHiveMediaPlayerWidget::class.java)
      val ids = appWidgetManager.getAppWidgetIds(componentName)
      Log.d(tag, "Setting initial widget state with last playback session ${it.displayTitle}")
      for (widgetId in ids) {
        updateNanoHiveAppWidget(context, appWidgetManager, widgetId, it, false, true)
      }
    }

    DeviceManager.initializeWidgetUpdater(context)
  }
}

internal val NH_AMBER_COLOR = Color.parseColor("#e0c27a")

// The NH UI Glass Effect Tuner's "Home Screen Widget" opacity slider (store/index.js's
// --nh-widget-opacity) has no CSS effect at all — the widget isn't part of the WebView.
// It rides along in that array purely to reuse the tuner's existing UI/persistence
// machinery; this is where its value actually gets consumed. Read straight out of
// Capacitor's Preferences plugin, which backs onto this exact SharedPreferences file/key
// (see node_modules/@capacitor/preferences's Android source — "CapacitorStorage" is its
// hardcoded default group name, keys are stored as their raw JSON.stringify'd JS values).
internal fun getNhWidgetOpacity(context: Context): Double {
  return try {
    val prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
    val nhSettingsJson = prefs.getString("nhSettings", null) ?: return 0.9
    val cssVars = JSONObject(nhSettingsJson).optJSONObject("nhGlassEffect")?.optJSONObject("cssVars") ?: return 0.9
    val value = cssVars.optDouble("--nh-widget-opacity", 0.9)
    if (value.isNaN()) 0.9 else value.coerceIn(0.0, 1.0)
  } catch (e: Exception) {
    Log.w("NanoHiveMediaPlayerWidget", "getNhWidgetOpacity failed, using default", e)
    0.9
  }
}

internal fun withAlpha(baseColor: Int, opacity: Double): Int {
  val alpha = (opacity * 255).toInt().coerceIn(0, 255)
  return Color.argb(alpha, Color.red(baseColor), Color.green(baseColor), Color.blue(baseColor))
}

// Bookmark and sleep-timer aren't system media-session actions like
// play/pause/rewind/forward — they need to actually open a modal in the Vue
// app (BookmarksModal / SleepTimerModal), which nothing in RemoteViews can
// render directly. Routed through the app's existing custom-URL-scheme deep
// link mechanism (already used for the Cloudflare SSO callback — see
// plugins/init.client.js's App.addListener('appUrlOpen', ...) and
// AudioPlayerContainer.vue's matching listener) instead of building a new
// mechanism: MainActivity is singleTask, so this reuses the running instance
// via onNewIntent() if the app's already open, or cold-launches it straight
// to the right modal if not.
internal fun widgetActionPendingIntent(context: Context, type: String): PendingIntent {
  val intent = Intent(Intent.ACTION_VIEW, Uri.parse("audiobookshelf://widget-action?type=$type"), context, MainActivity::class.java)
  intent.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
  return PendingIntent.getActivity(context, type.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
}

internal fun updateNanoHiveAppWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, playbackSession: PlaybackSession?, isPlaying: Boolean, isAppClosed: Boolean) {
  val tag = "NanoHiveMediaPlayerWidget"
  val views = RemoteViews(context.packageName, R.layout.nanohive_media_player_widget)
  Log.i(tag, "updateNanoHiveAppWidget ${playbackSession?.displayTitle ?: "No Title"} isPlaying=$isPlaying isAppClosed=$isAppClosed")
  val wholeWidgetClickI = Intent(context, MainActivity::class.java)
  wholeWidgetClickI.flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
  val wholeWidgetClickPI = PendingIntent.getActivity(
    context,
    System.currentTimeMillis().toInt(),
    wholeWidgetClickI,
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  val playPausePI = MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_PLAY_PAUSE)
  views.setOnClickPendingIntent(R.id.widgetPlayPauseButton, playPausePI)

  val fastForwardPI = MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_FAST_FORWARD)
  views.setOnClickPendingIntent(R.id.widgetFastForwardButton, fastForwardPI)

  val rewindPI = MediaButtonReceiver.buildMediaButtonPendingIntent(context, PlaybackStateCompat.ACTION_REWIND)
  views.setOnClickPendingIntent(R.id.widgetRewindButton, rewindPI)

  views.setOnClickPendingIntent(R.id.widgetBookmarkButton, widgetActionPendingIntent(context, "bookmark"))
  views.setOnClickPendingIntent(R.id.widgetSleepTimerButton, widgetActionPendingIntent(context, "sleep-timer"))

  views.setViewVisibility(R.id.widgetButtonContainer, if (isAppClosed) View.GONE else View.VISIBLE)

  views.setOnClickPendingIntent(R.id.widgetBackground, wholeWidgetClickPI)

  val imageUri = playbackSession?.getCoverUri(context) ?: Uri.parse("android.resource://${BuildConfig.APPLICATION_ID}/" + R.drawable.icon)
  val awt: AppWidgetTarget = object : AppWidgetTarget(context.applicationContext, R.id.widgetAlbumArt, views, appWidgetId) {
    override fun onResourceReady(resource: Bitmap, transition: Transition<in Bitmap>?) {
      super.onResourceReady(resource, transition)
    }
  }

  val artist = playbackSession?.displayAuthor ?: "Unknown"
  views.setTextViewText(R.id.widgetArtistText, artist)

  val title = playbackSession?.displayTitle ?: "Unknown"
  views.setTextViewText(R.id.widgetMediaTitle, title)

  val options = RequestOptions().override(300, 300).placeholder(R.drawable.icon).error(R.drawable.icon)
  Glide.with(context.applicationContext).asBitmap().load(imageUri).apply(options).into(awt)

  Log.i(tag, "Update NanoHive App Widget | Is Playing=$isPlaying | isAppClosed=$isAppClosed")

  val playPauseResource = if (isPlaying) androidx.mediarouter.R.drawable.ic_media_pause_dark else androidx.mediarouter.R.drawable.ic_media_play_dark
  views.setImageViewResource(R.id.widgetPlayPauseButton, playPauseResource)

  // Amber-tint the transport icons, which otherwise come from androidx.mediarouter/
  // ExoPlayer as plain black/white glyphs with no NH-aware color of their own.
  views.setInt(R.id.widgetPlayPauseButton, "setColorFilter", NH_AMBER_COLOR)
  views.setInt(R.id.widgetRewindButton, "setColorFilter", NH_AMBER_COLOR)
  views.setInt(R.id.widgetFastForwardButton, "setColorFilter", NH_AMBER_COLOR)
  views.setInt(R.id.widgetBookmarkButton, "setColorFilter", NH_AMBER_COLOR)
  views.setInt(R.id.widgetSleepTimerButton, "setColorFilter", NH_AMBER_COLOR)

  // True backdrop blur isn't possible for a RemoteViews widget (no API to blur
  // whatever's behind it), but real translucency is just an alpha channel —
  // tunable from the app via the Glass Effect Tuner's widget-opacity slider.
  val opacity = getNhWidgetOpacity(context)
  views.setInt(R.id.widgetBackground, "setBackgroundColor", withAlpha(Color.parseColor("#1a1611"), opacity))

  // Mirrors the mini player's thin progress track (#playerTrack in
  // AudioPlayer.vue) — playbackSession.progress is already a 0-1 fraction.
  val progressFraction = playbackSession?.progress ?: 0.0
  views.setProgressBar(R.id.widgetProgressBar, 1000, (progressFraction * 1000).toInt().coerceIn(0, 1000), false)
  // ColorStateList tinting on a RemoteViews ProgressBar needs API 31+ (no
  // equivalent int-arg setter exists for older RemoteViews) — below that it
  // just keeps the system's default progress color, a harmless degradation.
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    views.setColorStateList(R.id.widgetProgressBar, "setProgressTintList", ColorStateList.valueOf(NH_AMBER_COLOR))
    views.setColorStateList(R.id.widgetProgressBar, "setProgressBackgroundTintList", ColorStateList.valueOf(withAlpha(Color.WHITE, 0.15)))
  }

  // Instruct the widget manager to update the widget
  appWidgetManager.updateAppWidget(appWidgetId, views)
}
