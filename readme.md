# Audiobookshelf Mobile App — Cloudflare Zero Trust Fork

> **This is an unofficial patched build of the [Audiobookshelf Android app](https://github.com/advplyr/audiobookshelf-app).**
> It adds Cloudflare Zero Trust support — both WebView SSO login and manual service token headers — plus a cold-start auto-connect fix.
>
> **[⬇ Download the latest signed APK from Releases](https://github.com/claudepc42/audiobookshelf-app-cf-ZeroTrust/releases/latest)**

---

## What's patched

### 1. Cloudflare Zero Trust WebView SSO

When you enter a server address and tap **Submit**, the app automatically detects if your server is behind Cloudflare Zero Trust (via the CF 302 redirect to `cloudflareaccess.com`). If detected, an in-app WebView opens, you log in with your Cloudflare identity (Google, Microsoft, GitHub, etc.), and the app extracts and stores the session cookies automatically. No manual token entry required.

You can also tap **Login with Cloudflare** below the Submit button to trigger this manually.

**Re-authentication:** When your Cloudflare session expires, the app now detects it automatically and opens the WebView for a fresh login — no need to go back to the connect screen. See §4 below.

### 2. Custom HTTP headers (service tokens / advanced)

For service tokens or other header-gated reverse proxies, tap **Custom Headers** below the Submit button to enter headers manually (e.g. `CF-Access-Client-Id` / `CF-Access-Client-Secret`). Headers entered this way skip the WebView SSO detection entirely.

Headers are saved per server config and injected into every request the app makes across all HTTP stacks:

| Stack | What it covers |
|---|---|
| Capacitor/JS (`nativeHttp.js`, `ServerConnectForm.vue`) | Login, status probe, OAuth, library browsing, all API calls |
| Native Kotlin OkHttp (`ApiHandler.kt`) | Background sync, play requests, progress reporting, Android Auto, token refresh |
| ExoPlayer streaming (`PlayerNotificationService.kt`) | Direct-play audio and HLS transcoded streams — CF cookies only sent to the ABS server host, not external CDN URLs |
| WebSocket (`server.js`) | Live sync and progress push events |
| Download manager (`InternalDownloadManager.kt`) | Offline downloads |

### 3. Auto-connect race condition fix (`layouts/default.vue`)

On cold start, if the network came online during `syncLocalSessions()` (which runs before `hasMounted` is set), the `networkConnected` watcher dropped the event and the app was left on the connect screen, requiring manual server selection. The fix re-runs `attemptConnection()` once `hasMounted` is safely set. It is idempotent — `attemptConnection()` guards against concurrent execution internally.

### 4. Automatic CF session expiry detection & refresh

CF session cookies have a time-based expiry (set by the CF Access admin). When the session expires, streaming and downloads fail silently. This patch adds two detection paths and handles both automatically:

**In-session refresh button:** Open the side menu (hamburger icon) → tap **Refresh Cloudflare Login**. This re-opens the WebView, captures fresh cookies, and saves them to your server config — no need to disconnect and reconnect. The button only appears when your server config has CF cookies set.

**Auto-detection:** When a playback error or failed download is detected, the app probes the server with a HEAD request (no redirects). If the server returns a 302 to `cloudflareaccess.com`, a `cfSessionExpired` event fires on the JS layer and the WebView opens automatically — all without the user doing anything. After re-auth, tap play again.

**ExoPlayer CDN host-filter:** HLS streams can include segment URLs that point to external CDNs. Previously, CF session cookies were injected into all ExoPlayer requests, including those CDN URLs, causing those requests to fail. A custom `HostFilteredHttpDataSource` now restricts CF cookies and other custom headers to requests whose host matches the ABS server host only.

---

## Installing

1. Download `app-release-signed.apk` from the [Releases page](https://github.com/claudepc42/audiobookshelf-app-cf-ZeroTrust/releases/latest).
2. If you have the Play Store version or a previous build signed with a different key installed, **uninstall it first** before installing this APK.
3. Allow installation from unknown sources if prompted.

---

## Upstream

This fork tracks [`advplyr/audiobookshelf-app`](https://github.com/advplyr/audiobookshelf-app) `main`. The patches are designed to re-apply cleanly after upstream updates. See `CUSTOM_HEADERS_DESIGN_DOC.md` for the re-apply guide and full testing checklist.

---

## Original readme

---

Audiobookshelf is a self-hosted audiobook and podcast server.

### Android (beta)

Get the Android app on the [Google Play Store](https://play.google.com/store/apps/details?id=com.audiobookshelf.app)

### iOS (early beta)

**Beta is currently full. Apple has a hard limit of 10k beta testers. Updates will be posted in Discord.**

Using Test Flight: https://testflight.apple.com/join/wiic7QIW **_(beta is full)_**

---

[Go to the main project repo github.com/advplyr/audiobookshelf](https://github.com/advplyr/audiobookshelf) or the project site [audiobookshelf.org](https://audiobookshelf.org)

Join us on [discord](https://discord.gg/pJsjuNCKRq)

**Requires an Audiobookshelf server to connect with**

<img alt="Screenshot" src="https://github.com/advplyr/audiobookshelf-app/raw/master/screenshots/DeviceDemoScreens.png" />

## Contributing

This application is built using [NuxtJS](https://nuxtjs.org/) and [Capacitor](https://capacitorjs.com/) in order to run on both iOS and Android on the same code base.

### Localization

Thank you to [Weblate](https://hosted.weblate.org/engage/audiobookshelf/) for hosting our localization infrastructure pro-bono. If you want to see Audiobookshelf in your language, please help us localize. Additional information on helping with the translations [here](https://www.audiobookshelf.org/faq#how-do-i-help-with-translations). <a href="https://hosted.weblate.org/engage/audiobookshelf/"> <img src="https://hosted.weblate.org/widget/audiobookshelf/abs-mobile-app/horizontal-auto.svg" alt="Translation status" /> </a>

### Windows Environment Setup for Android

Required Software:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en/) (version 20)
- Code editor of choice([VSCode](https://code.visualstudio.com/download), etc)
- [Android Studio](https://developer.android.com/studio)
- [Android SDK](https://developer.android.com/studio)

<details>
<summary>Install the required software with <a href=(https://docs.microsoft.com/en-us/windows/package-manager/winget/#production-recommended)>winget</a></summary>

<p>
Note: This requires a PowerShell prompt with winget installed.  You should be able to copy and paste the code block to install.  If you use an elevated PowerShell prompt, UAC will not pop up during the installs.

```PowerShell
winget install -e --id Git.Git; `
winget install -e --id Microsoft.VisualStudioCode; `
winget install -e --id  Google.AndroidStudio; `
winget install -e --id OpenJS.NodeJS --version 20.11.0;
```

![](/screenshots/dev_setup_windows_winget.png)

</p>
</details>
<br>

Your Windows environment should now be set up and ready to proceed!

### Mac Environment Setup for Android

Required Software:

- [Android Studio](https://developer.android.com/studio)
- [Node.js](https://nodejs.org/en/) (version 20)
- [Cocoapods](https://guides.cocoapods.org/using/getting-started.html#installation)
- [Android SDK](https://developer.android.com/studio)

<details>
<summary>Install the required software with <a href=(https://brew.sh/)>homebrew</a></summary>

<p>

```zsh
brew install android-studio node cocoapods
```

</p>
</details>

### Start working on the Android app

Clone or fork the project from terminal or powershell and `cd` into the project directory.

Install the required node packages:

```shell
npm install
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_npm_install.png)

</details>
<br>

Generate static web app:

```shell
npm run generate
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_npm_run.png)

</details>
<br>

Copy web app into native android/ios folders:

```shell
npx cap sync
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_cap_sync.png)

</details>
<br>

Open Android Studio:

```shell
npx cap open android
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_cap_android.png)

</details>
<br>

Start coding!

After making changes to the JS layer you need to rebuild the nuxt pages and sync them to the native layers:

```shell
npm run sync
```

### Mac Environment Setup for iOS

Required Software:

- [Xcode](https://developer.apple.com/xcode/)
- [Node.js](https://nodejs.org/en/)
- [Cocoapods](https://guides.cocoapods.org/using/getting-started.html#installation)

### Start working on the iOS app

Clone or fork the project in the terminal and `cd` into the project directory.

Install the required node packages:

```shell
npm install
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_npm_install.png)

</details>
<br>

Generate static web app:

```shell
npm run generate
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_npm_generate.png)

</details>
<br>

Copy web app into native android/ios folders:

```shell
npx cap sync
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_cap_sync.png)

</details>
<br>

Open Xcode:

```shell
npx cap open ios
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_cap_open.png)

</details>
<br>

Start coding!

After making changes to the JS layer you need to rebuild the nuxt pages and sync them to the native layers:

```shell
npm run sync
```
