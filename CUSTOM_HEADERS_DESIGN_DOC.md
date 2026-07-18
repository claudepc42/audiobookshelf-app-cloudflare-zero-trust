# CF Zero Trust & Custom Headers — Design Document
## Audiobookshelf Android App Fork

**Purpose:** Enable Cloudflare Zero Trust authentication and custom HTTP request headers on every request the app makes, so the app works behind header-authenticated or CF-protected reverse proxies.

---

## Background

`ServerConnectionConfig` already has a `customHeaders: Map<String, String>?` field (`DeviceClasses.kt` line 36–47). The UI modal (`CustomHeadersModal.vue`) already exists and works. The feature was designed but never fully wired to the HTTP stacks the app uses.

**Persistence (updated):** `customHeaders` is never written to the plaintext Paper/Kryo blob. `DbManager.saveDeviceData()`/`getDeviceData()` is the single chokepoint that redacts it before every disk write and rehydrates it from Keystore-backed `SecureStorage` (AES-256/GCM) after every disk read — see `SecureStorage.kt`'s `storeCustomHeaders`/`getCustomHeaders`/`removeCustomHeaders`. `AbsDatabase.kt` remains the plugin layer JS talks to, but it no longer directly determines how the data is persisted; that logic lives in `DbManager`. In-memory, the live `ServerConnectionConfig` object still carries the real value at all times — only the on-disk copy is ever redacted.

---

## Features

### 1. CF Zero Trust WebView SSO

When the user submits a server address on Android with no custom headers set, the app probes the server with `disableRedirects: true`. If the server returns a 302 redirect to `cloudflareaccess.com`, CF Zero Trust is detected automatically and an in-app WebView opens for the user to authenticate with their CF identity provider.

After successful authentication, CF redirects back to the server domain. The app extracts **all cookies** from the WebView's `CookieManager` for the server host (not just `CF_Authorization`, because CF binding cookies must also travel with the auth cookie or requests will be rejected). The full cookie string is stored as `customHeaders: { Cookie: "<full-cookie-string>" }` and applied to all subsequent requests.

The user can also trigger the WebView manually via the **Login with Cloudflare** link below the Submit button.

**Re-authentication:** When the CF session expires (purely time-based JWT `exp`), the app now auto-detects expiry and re-opens the WebView without requiring the user to go back to the connect screen. See §4 below.

### 2. Custom HTTP headers (service tokens / advanced)

For CF service tokens (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) or other header-gated proxies, the user taps **Custom Headers** to enter headers manually. When custom headers are already set, the CF auto-detection and WebView SSO are skipped entirely.

### 3. Auto-connect race condition fix

On cold start, if the network came online during `syncLocalSessions()`, the `networkConnected` watcher dropped the event and left the app on the connect screen. The fix re-runs `attemptConnection()` once `hasMounted` is safely set. Safe to call twice — `attemptConnection()` has its own concurrency guard.

### 4. CF session expiry detection & in-session refresh

CF session cookies expire based on the TTL set by the CF Access admin. This was previously silent — playback and downloads would fail with no clear cause and no recovery path short of disconnecting and reconnecting.

**Manual refresh button (SideDrawer):** When `serverConnectionConfig.customHeaders.Cookie` is set (i.e. the server config has CF cookies), a **Refresh Cloudflare Login** item appears in the side menu. Tapping it re-opens the WebView, captures fresh cookies, updates DB and Vuex store without losing any other server config state.

**Auto-detection (two paths):**
1. `PlayerListener.onPlayerError` → daemon thread calls `AbsCfZeroTrust.probeCfChallenge()` → if confirmed CF, fires `cfSessionExpired` Capacitor event.
2. `InternalDownloadManager.onResponse` → if final response host ≠ original URL host, fires `cfSessionExpired`.

**JS-side handler (`default.vue`):** `cfSessionExpired` event triggers `handleCfExpired()`, which opens the WebView automatically. A `cfRefreshInProgress` flag prevents concurrent refresh attempts.

**ExoPlayer host filtering:** HLS manifests can point to external CDN URLs for media segments. Before this fix, custom headers (including CF cookies) were injected into all ExoPlayer requests via `setDefaultRequestProperties`, meaning CF cookies were sent to CDN hosts — causing those requests to fail or behave incorrectly. `HostFilteredHttpDataSource` wraps `DefaultHttpDataSource` and only injects custom headers when the request URI host matches the ABS server host.

---

## Architecture: HTTP Stacks Patched

The app has five independent HTTP layers, all of which inject custom headers:

| Stack | Files | Handles |
|---|---|---|
| Capacitor/JS | `plugins/nativeHttp.js`, `components/connection/ServerConnectForm.vue` | Login, library browsing, API calls, token refresh |
| Native Kotlin API | `android/.../server/ApiHandler.kt` | Background sync, play requests, progress reporting, Android Auto, Kotlin-layer token refresh |
| ExoPlayer streaming | `android/.../player/PlayerNotificationService.kt` | Audio file streaming (direct play and HLS) |
| WebSocket | `plugins/server.js` | Live sync and progress push events |
| Download manager | `android/.../managers/InternalDownloadManager.kt`, `android/.../managers/DownloadItemManager.kt` | Offline downloads |

---

## What the Patch Does

**10 files changed.**

### 1. `components/connection/ServerConnectForm.vue`

- **"Custom Headers" link** below the Submit button — opens `CustomHeadersModal.vue`.
- **"Login with Cloudflare" link** (Android only) — manually triggers CF WebView SSO.
- **CF auto-detection in `submit()`**: if no custom headers are set, calls `checkAndHandleCfZeroTrust()` before attempting server connection.
- **`checkAndHandleCfZeroTrust()`**: probes `<address>/status` with `disableRedirects: true`, checks for 302 to `cloudflareaccess.com`, opens WebView via `AbsCfZeroTrust`, stores result cookie string as `customHeaders.Cookie`.
- **`openCfSsoLogin()`**: manual trigger for the WebView SSO flow.
- **`getServerAddressStatus()`**: passes `this.serverConfig.customHeaders` to `getRequest()`.
- **`connectToServer()`**: passes `config.customHeaders` to `pingServerAddress()`.
- **`oauthRequest()`**: adds `headers: this.serverConfig.customHeaders || {}` to the OAuth call.

### 2. `plugins/nativeHttp.js`

- **`request()`**: spreads `serverConnectionConfig.customHeaders` into every request's headers.
- **`handleTokenRefresh()`**: passes full `serverConnectionConfig` to `refreshAccessToken()`.
- **`refreshAccessToken()`**: signature changed to accept `serverConnectionConfig` (not just address), spreads `customHeaders` into the refresh request.

### 3. `android/.../server/ApiHandler.kt`

- **`getRequest()`**, **`postRequest()`**, **`patchRequest()`**: loop `customHeaders` via `builder.addHeader()`.
- **`handleTokenRefresh()`**: loops `customHeaders` on the `/auth/refresh` retry request.

### 4. `android/.../player/PlayerNotificationService.kt`

- **Direct play and HLS**: replaced `setDefaultRequestProperties` with `HostFilteredHttpDataSourceFactory`. When the server config has custom headers and a parseable server host, all ExoPlayer requests go through the host filter — custom headers (CF cookies, etc.) are only injected when the request host matches the ABS server host. External CDN segment URLs receive only the `Authorization` header.
- When no custom headers are configured, falls back to `DefaultHttpDataSource.Factory` with only the auth header (no behavior change from before).

### 4a. `android/.../player/HostFilteredHttpDataSource.kt` *(new)*

`HostFilteredHttpDataSourceFactory` implements `HttpDataSource.Factory`. Each `createDataSource()` call returns a `HostFilteredHttpDataSource` wrapping a `DefaultHttpDataSource` delegate.

`HostFilteredHttpDataSource.open(dataSpec)`:
1. Always sets `Authorization: Bearer <token>` on the delegate.
2. If `dataSpec.uri.host` matches the server host (exact or subdomain): injects all `customHeaders`.
3. Otherwise: clears all custom header keys from the delegate so they don't leak to CDN requests.
4. Delegates `open()` to the underlying `DefaultHttpDataSource`.

All other `HttpDataSource` interface methods (`read`, `close`, `getUri`, `getResponseHeaders`, `addTransferListener`, `setRequestProperty`, `clearRequestProperty`, `clearAllRequestProperties`, `getResponseCode`) delegate directly.

### 5. `layouts/default.vue`

- **Auto-connect fix**: `if (!this.user) await this.attemptConnection()` after `this.hasMounted = true`.
- **CF session expiry listener**: on `mounted()` (Android only), registers `AbsCfZeroTrust.addListener('cfSessionExpired', this.handleCfExpired)`. Removed in `beforeDestroy()`.
- **`handleCfExpired()`**: debounced via `cfRefreshInProgress` flag. Opens the WebView, saves new cookies to DB and Vuex store, shows a toast. If the user cancels, shows an error toast pointing them to the side menu refresh button.

### 5a. `components/app/SideDrawer.vue`

- **`hasCfCookies` computed**: returns `true` on Android when `serverConnectionConfig.customHeaders.Cookie` is set.
- **"Refresh Cloudflare Login" nav item**: added to the side menu when `hasCfCookies` is true (after the logout item).
- **`refreshCfLogin()`**: opens the WebView, saves fresh cookies to DB + Vuex, shows a success toast.

### 6. `plugins/server.js`

- **WebSocket `connect()`**: passes `customHeaders` as `extraHeaders` in socket.io options.

### 7. `android/.../managers/InternalDownloadManager.kt`

- **`download()`**: signature changed to accept `customHeaders: Map<String, String>? = null`; loops headers onto the `Request.Builder`.
- **CF redirect check**: after `onResponse`, compares the final response host against the original URL host. If they differ (CF challenge redirect), calls `AbsCfZeroTrust.notifyCfSessionExpired()` and fails the download — rather than silently downloading an HTML challenge page.

### 8. `android/.../managers/DownloadItemManager.kt`

- **`startInternalDownload()`**: passes `DeviceManager.serverConnectionConfig?.customHeaders` to `InternalDownloadManager.download()`.

### 9. `android/.../plugins/AbsCfZeroTrust.kt` *(new)*

Capacitor plugin that opens a full-screen `Dialog` containing a WebView. Loads the server URL, monitors `onPageFinished` for return to the server host, extracts all cookies from `CookieManager`, resolves the Capacitor `PluginCall` with `{ cookieHeader: String }`. Handles user cancellation via dialog dismiss listener.

**Companion object** (added for cross-class notification):
- `instance`: holds a reference to the live plugin instance (set in `load()`).
- `notifyCfSessionExpired()`: calls `instance.notifyListeners("cfSessionExpired", JSObject(), true)` — the `retainUntilConsumed = true` flag ensures the event is delivered even if no JS listener is registered yet.
- `probeCfChallenge(serverAddress)`: makes a HEAD request to `<serverAddress>/status` with `followRedirects(false)`. Returns `true` if the response is a 3xx redirect to `cloudflareaccess.com` or `*.cloudflareaccess.com`.

`PlayerListener.kt` calls `probeCfChallenge()` on a daemon thread after any `onPlayerError`, then calls `notifyCfSessionExpired()` if the probe confirms CF.

### 10. `plugins/capacitor/AbsCfZeroTrust.js` *(new)*

JS bridge wrapper that registers the `AbsCfZeroTrust` Capacitor plugin. Exports `AbsCfZeroTrust.openCfWebView({ serverAddress })` which returns `Promise<{ cookieHeader: string }>`. Also exposes `addListener(eventName, listenerFunc)` (delegating to `WebPlugin.addListener`) so the `cfSessionExpired` event can be subscribed from JS.

---

## CF Zero Trust Cookie Notes

- CF Zero Trust sets a `CF_Authorization` cookie (JWT) on the domain after auth.
- CF may also set **binding cookies** (enabled by default on CF Access applications) that must accompany `CF_Authorization` or requests are rejected at CF's edge.
- The plugin extracts the **full cookie string** from `CookieManager.getCookie(url)` (e.g. `CF_Authorization=...; CF_AppSession=...`) and stores it as the `Cookie:` header value. This ensures binding cookies are always included.
- Cookie lifetime is configured by the CF Access admin (`exp` in the JWT). Expiry is time-based only; network changes do not invalidate the cookie.

---

## Header Precedence

In `nativeHttp.js`, the merge order is:
1. `Authorization: Bearer <token>` (set first)
2. `options.headers` (passed by caller)
3. `serverConnectionConfig.customHeaders` (applied last — can override anything above)

In the Kotlin stacks, `addHeader()` adds duplicate headers; OkHttp sends all of them and the server typically uses the last value.

---

## How to Re-Apply After an Upstream Update

1. Pull the new upstream HEAD.
2. Run `git diff HEAD~1 HEAD` on each patched file to check for upstream changes.
3. If unchanged, `git apply` the saved patch.
4. If changed, re-apply manually:
   - **`ApiHandler.kt`**: find each `Request.Builder()` call in `getRequest`, `postRequest`, `patchRequest`, `handleTokenRefresh`. Add `customHeaders?.forEach` loop before `.build()`.
   - **`PlayerNotificationService.kt`**: find both `setDefaultRequestProperties(...)` calls. Replace with `HostFilteredHttpDataSourceFactory` when custom headers are present (see §4 above for the full pattern).
   - **`nativeHttp.js`**: customHeaders block goes after `options.headers` merge. `refreshAccessToken` signature takes `serverConnectionConfig`.
   - **`ServerConnectForm.vue`**: template links (2 lines), import `AbsCfZeroTrust`, CF detection block in `submit()`, three new methods (`openCfSsoLogin`, `checkAndHandleCfZeroTrust`), one-line tweaks to `getServerAddressStatus`, `connectToServer`, `oauthRequest`.
   - **`layouts/default.vue`**: one line after `this.hasMounted = true`; `cfSessionListener` wiring in `mounted()` and `beforeDestroy()`; `handleCfExpired()` method.
   - **`SideDrawer.vue`**: import `AbsCfZeroTrust`; `hasCfCookies` computed; nav item in `navItems`; `refreshCf` branch in `clickAction`; `refreshCfLogin()` method.
   - **`server.js`**: `extraHeaders: customHeaders` in socket.io options.
   - **`InternalDownloadManager.kt`**: add `customHeaders` parameter, builder pattern, loop before `.build()`; CF redirect host check + `notifyCfSessionExpired()` call.
   - **`DownloadItemManager.kt`**: pass `customHeaders` as second arg to `InternalDownloadManager.download()`.
   - **`AbsCfZeroTrust.kt`**: new file — companion object with `instance`, `notifyCfSessionExpired()`, `probeCfChallenge()`, and `load()` override. No upstream conflict.
   - **`AbsCfZeroTrust.js`**: new file — add `addListener` override. No upstream conflict.
   - **`HostFilteredHttpDataSource.kt`**: new file — no upstream conflict.
   - **`PlayerListener.kt`**: `onPlayerError` — daemon thread probe + `notifyCfSessionExpired()`.
   - **`MainActivity.kt`**: add `registerPlugin(AbsCfZeroTrust::class.java)` and import.
   - **`plugins/capacitor/index.js`**: add import and export.

---

## Testing Checklist

- [ ] Enter server address → "Custom Headers" and "Login with Cloudflare" links appear below Submit
- [ ] On CF-protected server: Submit auto-detects CF (no manual action needed) → WebView opens
- [ ] CF WebView: user logs in with identity provider → WebView closes automatically
- [ ] After CF WebView auth: connect screen proceeds to library without error
- [ ] "Login with Cloudflare" manual trigger works (enters address, taps link before Submit)
- [ ] Saved CF session: close app, re-open → cookies still in serverConfig → no WebView needed on next cold start
- [ ] CF session expiry (manual): open side menu → tap **Refresh Cloudflare Login** → WebView opens, fresh cookies saved, toast shown
- [ ] CF session expiry (auto): let session expire; attempt playback → `onPlayerError` fires → probe detects CF → WebView opens automatically
- [ ] CF session expiry (auto via download): let session expire; attempt download → host redirect detected → `cfSessionExpired` fires → WebView opens
- [ ] ExoPlayer CDN isolation: during HLS playback, verify CF cookies are NOT sent to CDN segment URLs (only to ABS server host requests)
- [ ] Manual custom headers: enter service tokens → CF detection skipped, tokens sent on all requests
- [ ] Login completes with custom headers (headers sent on `/ping`, `/status`, `/login`)
- [ ] Library loads (headers sent via nativeHttp on all API calls)
- [ ] Direct play audio streams (headers sent via ExoPlayer DefaultHttpDataSource)
- [ ] HLS transcoded stream plays (headers sent via ExoPlayer HlsMediaSource)
- [ ] Token refresh works after expiry — JS layer (headers in `/auth/refresh` via nativeHttp)
- [ ] Token refresh works after expiry — Kotlin layer (headers in ApiHandler `handleTokenRefresh`)
- [ ] OpenID/OAuth login flow works (headers in OAuth redirect request)
- [ ] WebSocket connects (headers in socket.io `extraHeaders`)
- [ ] Offline download completes (headers in InternalDownloadManager request)
- [ ] Custom headers survive app restart (persisted in ServerConnectionConfig via AbsDatabase)
- [ ] App auto-connects on cold start without manual server selection (default.vue race condition fix)

---

## Files Changed

```
layouts/default.vue
components/app/SideDrawer.vue
components/connection/ServerConnectForm.vue
plugins/nativeHttp.js
plugins/server.js
plugins/capacitor/AbsCfZeroTrust.js           (new)
plugins/capacitor/index.js
android/app/src/main/java/com/audiobookshelf/app/MainActivity.kt
android/app/src/main/java/com/audiobookshelf/app/plugins/AbsCfZeroTrust.kt  (new, expanded with companion object)
android/app/src/main/java/com/audiobookshelf/app/player/HostFilteredHttpDataSource.kt  (new)
android/app/src/main/java/com/audiobookshelf/app/player/PlayerListener.kt
android/app/src/main/java/com/audiobookshelf/app/player/PlayerNotificationService.kt
android/app/src/main/java/com/audiobookshelf/app/server/ApiHandler.kt
android/app/src/main/java/com/audiobookshelf/app/managers/InternalDownloadManager.kt
android/app/src/main/java/com/audiobookshelf/app/managers/DownloadItemManager.kt
```

Base: `advplyr/audiobookshelf-app` `main` branch, commit `815cd07` / `d25e744` range (June 2026).
