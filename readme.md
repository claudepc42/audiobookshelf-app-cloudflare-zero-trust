# Audiobookshelf Mobile App — Cloudflare Zero Trust

![Latest release](https://img.shields.io/github/v/release/claudepc42/audiobookshelf-app-cloudflare-zero-trust?label=version&color=orange) ![Build](https://img.shields.io/github/actions/workflow/status/claudepc42/audiobookshelf-app-cloudflare-zero-trust/build.yml?branch=master&label=build) ![Kotlin](https://img.shields.io/badge/Kotlin-2.x-7F52FF?logo=kotlin&logoColor=white) ![Android](https://img.shields.io/badge/Android-8.0%2B-3DDC84?logo=android&logoColor=white) ![License](https://img.shields.io/badge/license-GPL--3.0-blue)

> **This is an unofficial patched build of the [Audiobookshelf Android app](https://github.com/advplyr/audiobookshelf-app).**
> It adds Cloudflare Zero Trust support — both WebView SSO login and manual service token headers — plus LAN address auto-routing for full local network speed at home, encrypted credential storage, and a cold-start auto-connect fix.
>
> **[⬇ Download the latest signed APK from Releases](https://github.com/claudepc42/audiobookshelf-app-cloudflare-zero-trust/releases/latest)**
>
> ⚠️ **This is the only official repository for this project.** A copycat repo using this exact name has been spotted funneling downloads through an external site with no real source code behind it — GitHub releases on *this* repo are the only legitimate build. If you landed here from somewhere else, verify the URL matches `github.com/claudepc42/audiobookshelf-app-cloudflare-zero-trust` before downloading anything.

---

## Contents

- [What's patched](#whats-patched)
  1. [Cloudflare Zero Trust WebView SSO](#1-cloudflare-zero-trust-webview-sso)
  2. [Custom HTTP headers (service tokens / advanced)](#2-custom-http-headers-service-tokens--advanced)
  3. [Auto-connect race condition fix](#3-auto-connect-race-condition-fix-layoutsdefaultvue)
  4. [Automatic CF session expiry detection & refresh](#4-automatic-cf-session-expiry-detection--refresh)
  5. [LAN address auto-routing](#5-lan-address-auto-routing-home-network-fast-lane)
  6. [Security hardening](#6-security-hardening)
  7. [In-app update checker](#7-in-app-update-checker)
- [Installing](#installing)
- [Upstream](#upstream)
- [Contributing](#contributing)

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

### 5. LAN address auto-routing (home network fast lane)

When adding or editing a server, an optional **LAN address** field appears below the main server address. Enter your server's local IP (e.g. `http://192.168.1.100:13378`).

**How it works:**

- On connect and on app resume from background, the app probes your LAN address with a 500 ms timeout and checks that whatever answers actually looks like an audiobookshelf server (see §6) before trusting it.
- If it responds and passes that check, all streaming and downloads go through the LAN address — full local network speed, no Cloudflare overhead, no bandwidth cap.
- If it doesn't respond, or something else entirely is listening on that address (you're away from home), the app falls back to your main Cloudflare address automatically.
- Your server config, library, progress sync, and download history stay unified under a single entry — no duplicate configs to manage.

**Downloads at full LAN speed:** Downloads to custom folders use an in-app HTTP client rather than the Android system Download Manager, so they aren't subject to VPN split-tunnel routing restrictions that affect system services. The file is written to your chosen folder at full local network speed and tagged with your primary server address, so progress syncs correctly whether you're on LAN or away.

> **Typical result:** streaming and downloads at 50–250 MB/s on a gigabit LAN, automatically, with zero extra setup after the initial field is filled in.

### 6. Security hardening

**LAN probe identity verification:** A probe now sends a `GET /status` and requires the response body to match audiobookshelf's known unauthenticated status shape (`isInit`, `language`, `authMethods`) before trusting the address. No credentials are sent as part of this check — `/status` is unauthenticated on every audiobookshelf server by design. This is an identity/liveness check, not an authentication check: it confirms *an* audiobookshelf server answered, not that it's *your* server at a spoofed address.

**Encrypted credential storage:** Your Cloudflare session cookie and any manually entered service token headers are now encrypted at rest using an AES-256/GCM key held in the Android Keystore, rather than being stored in plaintext. The app also disables Android's automatic backup (`allowBackup=false`), so this data is never eligible for device or cloud backup extraction (Seedvault, `adb backup`, etc.). This protects against filesystem-level extraction (a stolen backup, a disk image from an unrooted device) — it does not, and cannot, protect against a rooted device or compromised OS, where no app-level scheme holds.

### 7. In-app update checker

The app checks GitHub for a newer stable release shortly after launch (at most once every 5 days). If one's available, a small dismissible card appears — open the release notes, silence it until the next version, or close it for now. Can be turned off entirely in **Settings → CF Zero Trust**.

---

## Installing

1. Download `app-release-signed.apk` from the [Releases page](https://github.com/claudepc42/audiobookshelf-app-cloudflare-zero-trust/releases/latest).
2. If you have the Play Store version or a previous build signed with a different key installed, **uninstall it first** before installing this APK.
3. Allow installation from unknown sources if prompted.

---

## Upstream

This project is built on top of [`advplyr/audiobookshelf-app`](https://github.com/advplyr/audiobookshelf-app) `main`. The patches are designed to re-apply cleanly after upstream updates. See `CUSTOM_HEADERS_DESIGN_DOC.md` for the re-apply guide and full testing checklist.

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

<details>
<summary>Full dev environment setup — Android (Windows/Mac)</summary>

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

</details>

<details>
<summary>Full dev environment setup — iOS (Mac only)</summary>

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

</details>
