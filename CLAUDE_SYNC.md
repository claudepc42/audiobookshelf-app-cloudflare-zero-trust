# Claude Sync Notes (Mac ↔ Windows)

A scratchpad for the two Claude Code sessions working on this repo from
different machines to catch each other up async — what changed, why, and
anything the other side needs to know before picking up work. Not a commit
log; git already has that. This is for context git commits don't carry.

Each side appends dated entries to its own section rather than overwriting.

---

## Future Features

Ideas under consideration, not yet scheduled or designed in detail.

### Reading wish list ("To Be Read")

A wish list of titles the user wants to read/listen to, separate from Collections.
Unlike a collection, an item automatically drops off the list once it's been
listened to (fully finished), rather than staying until manually removed.

### Book requests

A way to request a book be added to the library (e.g. to a librarian/admin, or
to whatever request-fulfillment backend the server supports), rather than only
browsing what's already there.

### watchOS companion app

A real Apple Watch app (not yet started — no watchOS target exists in this
project yet). Distinct from the NanoHive widget, which is a home-screen/lock-
screen widget extension, not a full watch app.

### iPad app

Proper iPad support/layout, rather than just running the iPhone UI scaled up.

### tvOS app

An Apple TV app.

### CarPlay support

Not started — there's currently no CarPlay integration at all (`CPTemplate`/
`CPInterfaceController` etc. don't appear anywhere in `ios/`). Note there's
already a code comment about the resulting gap in
`ios/App/Shared/util/MediaEventManager.swift` (~line 12-15): Android's
"Finished" playback-history event only ever fires from Android Auto's
podcast-auto-advance flow, so iOS has no equivalent trigger point and leaves
it intentionally unwired. Building CarPlay would need to revisit that.

---

## From Mac Claude

### 2026-08-28

First real compile of the iOS side on this Mac (previously developed entirely
on Windows, never compiled). Found and fixed, in order hit:

- **Deployment target floor**: project/Podfile were at iOS 13/14; this Xcode's
  SDK requires 15.0 minimum. Bumped everywhere, including a `post_install`
  hook in `ios/App/Podfile` since Capacitor's own `assertDeploymentTarget`
  helper only floors at 14.0 and doesn't respect a higher Podfile platform.
- **8 Swift files never added to the Xcode project**: `AbsCfZeroTrust.swift`,
  `AbsWidgetUpdater.swift`, `MediaItemEvent.swift`, `MediaItemHistory.swift`,
  `WidgetSnapshot.swift`, `EndpointResolver.swift`, `MediaEventManager.swift`,
  `WidgetDataBridge.swift` existed on disk but had zero references in
  `project.pbxproj` — classic symptom of writing Swift files without ever
  opening Xcode to add them to a target. Added via the `xcodeproj` gem.
- **`MediaItemEvent.swift`**: `required init()` needed to be `override init()`
  to match the `EmbeddedObject` convention used elsewhere in the codebase
  (e.g. `MediaItemHistory.swift`).
- **Real launch crash, not a debugger nag**: the app never adopted `UIScene`
  lifecycle (still used the legacy `AppDelegate.window` + storyboard pattern).
  This iOS SDK hard-requires Scene adoption to launch at all — confirmed via
  system log: `Application failed to launch: UIScene life cycle is required
  for apps built with this SDK.` Added `SceneDelegate.swift` +
  `UIApplicationSceneManifest` in `Info.plist`.
- **Opus code review caught a regression from that last fix**: registering a
  scene delegate stops iOS from calling `AppDelegate`'s `application(_:open:)`
  / `application(_:continue:restorationHandler:)`, which is how Capacitor's
  `appUrlOpen` / universal-link plugin listeners get fed (via
  `ApplicationDelegateProxy.shared`). Fixed by forwarding from
  `SceneDelegate` (both cold-launch `connectionOptions` and live
  `scene(_:openURLContexts:)` / `scene(_:continue:)`) to that same proxy.
  Also removed `AppDelegate.window`, now dead code since `SceneDelegate` owns
  the real window (confirmed nothing else in the codebase referenced it).

**Confirmed working**: builds clean for Simulator, installs, launches without
crashing, and renders the actual NanoHive-themed UI (verified via screenshot —
"Bookshelf empty / server not connected / Connect" on fresh install, as
expected).

**Known open items, not yet addressed:**
- `xcodebuild test` is unreliable in this Xcode 27 beta — its private
  XCTest-clone-simulator mechanism hangs on boot. Looks like a beta
  infrastructure issue, not a code problem; `PlayerTimeUtilsTests.swift`
  and the Podfile wiring for the test target (`inherit! :search_paths`,
  which was also missing and got added) both look correct.
- Widget target (`ios/NanoHiveWidget/`) still needs manual Xcode setup
  (target, App Group, entitlements) — not attempted yet.
- No paid Apple Developer account yet, only a free/family Apple ID —
  real-device builds not attempted, Simulator-only so far.
- Untested: anything requiring a live Audiobookshelf server (CF-ZT headers,
  LAN auto-routing, actual deep-link opens) — only static/headless
  verification so far.

---

## From Windows Claude

### 2026-08-29

Pushed the full iOS port to `origin/wip` (previously only existed locally on
this Windows machine) and got Greptile's first-ever review of the iOS Swift
code (PR #14). It came back at **Confidence Score: 2/5** with two P1 bugs,
both verified by actually executing the code (Greptile's T-Rex feature), not
just static pattern matching:

1. **CF Zero Trust credentials were being sent to the LAN address.**
   `ApiClient.baseHeaders()` (and the refresh/retry header-building sites)
   attached every `Store.customHeaders` entry unconditionally, with no check
   on whether the request target was the primary Cloudflare-fronted address
   or the LAN address `EndpointResolver` had switched to. The
   download/streaming paths already had this host-scoping guard
   (`AudioPlayer.swift`'s `requestHostMatchesServer`) — the plain API layer
   never got it. **Fixed**: added `ApiClient.requestTargetIsPrimaryServer()`,
   mirroring that same host-check pattern, and gated all three
   customHeaders-attachment sites on it.

2. **Stopping playback lost the final progress sync entirely.**
   `PlayerHandler.stopPlayback()` wrote a "Stop" history event immediately
   (with no sync data), then called `player?.pause()` — whose *own* async
   sync tried to re-fetch the session by ID afterward, by which point
   `resetPlayer()` had already cleared `player`. Root cause was actually one
   level deeper: `PlayerProgress.swift`'s sync-success path deletes the Realm
   session row once it's no longer active, which raced against that
   re-fetch regardless of `player` being nil'd — a live Realm re-fetch by ID
   can't survive its own sync deleting the row out from under it. **Fixed**:
   restructured `PlayerHandler` so `resetPlayer()` (renamed
   `resetPlayer(firing:)`, shared by both `startPlayback`'s session-switch
   cleanup and `stopPlayback`) captures a **frozen** session snapshot before
   touching anything, syncs, and attaches the real result directly to
   whichever terminal event fires (`.pause` for session-switch, `.stop` for
   an explicit stop) — a frozen snapshot survives the sync's own deletion of
   the live row, and doesn't need re-fetching after the fact. Also added
   `AudioPlayer.pauseAudioOnly()` (physical pause only, no sync/event) so
   `destroy()` doesn't redundantly re-run the sync `resetPlayer(firing:)`
   already just did.

Also fixed two bugs from a local `/code-review` pass before this (already on
`wip`, predates this Greptile round): a Realm cross-thread access crash in
`AbsDatabase.swift`'s `setCurrentServerConnectionConfig`, and a separate
CF-challenge-reported-as-success bug in `ApiClient.swift` where a stale CF
login page returned with a 2xx status was silently treated as sync success.

**Status**: both Greptile fixes pushed to `wip`. A follow-up Greptile review
scoped to just `wip-macos-ios`'s diff (the Xcode project setup work) is
queued next — small diff, doesn't touch either file above, so no conflict
with this work.

**Worth knowing before continuing Mac-side work**: the `EmbeddedObject`
`required init()` → `override init()` convention noted above for
`MediaItemEvent.swift` — if the widget target setup requires touching
`MediaItemHistory.swift` or `WidgetSnapshot.swift`, they follow the same
Realm model conventions, so the same class-hierarchy expectations apply.
