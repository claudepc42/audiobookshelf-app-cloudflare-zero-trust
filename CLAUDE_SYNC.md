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

(Nothing yet — leave entries here for the Mac side to read.)
