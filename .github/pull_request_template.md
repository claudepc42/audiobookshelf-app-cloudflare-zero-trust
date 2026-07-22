<!-- TITLE: feat: NanoHive theme — Phase 1 (color system, ambient background, frosted appbar, toggle) -->

## Overview

Ports the NanoHive ABS theme (https://github.com/rodzalendo/nanohive-abs-theme) to the native Android app as a pixel-for-pixel match of the web theme's warm palette and core visual style. Adds a NanoHive ↔ Stock toggle in the hamburger drawer above the CF/LAN indicator. Lays iOS groundwork (no platform guards needed — the CSS and Capacitor Preferences storage work identically on both platforms; iOS-only gaps are documented in CLAUDE.md).

## Changes

- `assets/tailwind.css` — Added `html[data-theme='nanohive']` CSS variable block mapping NanoHive warm palette (#181512 canvas, #221e1a raised, #e0c27a amber) to existing ABS color tokens. All `bg-bg`, `bg-primary`, `text-fg`, etc. Tailwind utilities automatically adopt NH colors when the theme is active.
- `assets/nh-theme.css` (new) — NanoHive-specific visual CSS scoped under `html[data-theme='nanohive']`: ambient radial-gradient background on `body::before`, transparent layout wrapper so gradient shows through, frosted glass appbar (`backdrop-filter: blur(28px)`), amber accent/success/info color overrides, amber scrollbar thumbs, Spectral serif heading font.
- `nuxt.config.js` — Added `@/assets/nh-theme.css` to the CSS array.
- `store/index.js` — Added `nhThemeActive: false` state and `setNhThemeActive` mutation for reactive toggle state.
- `plugins/localStore.js` — Added `setNhSettings(settings)` / `getNhSettings()` using Capacitor Preferences key `nhSettings`.
- `plugins/init.client.js` — On startup, loads NH settings and if `active: true`, commits `setNhThemeActive`, sets `data-theme='nanohive'`, and injects the Spectral Google Font `<link>` so NH persists across app restarts without flash.
- `components/app/Appbar.vue` — Added `id="nh-appbar-wrapper"` to the outer div so `nh-theme.css` can target it precisely for frosted glass.
- `components/app/SideDrawer.vue` — Added `nhThemeActive` computed, `toggleNhTheme()` method, `_loadNhFont()` helper, and toggle UI (label + pill switch) above the CF/LAN indicator.

## Testing Done

- [ ] Toggle ON: drawer shows NanoHive label active, app background switches to warm cinematic gradient, appbar frosts
- [ ] Toggle OFF: reverts to previous stock theme (or default if no stock theme was set)
- [ ] App restart with NH on: NH applies before first paint (no flash of stock UI)
- [ ] App restart with NH off: stock theme applies as before, no regression
- [ ] Amber accent visible on progress bars, connection indicator, active states
- [ ] Amber scrollbar thumbs visible on scrollable lists
- [ ] Stock CF/LAN indicator and version tag still visible below the toggle
- [ ] iOS: no crash (Capacitor Preferences and CSS both work on iOS)

## Concerns for Greptile

- `nh-theme.css` uses `!important` extensively to override hardcoded Tailwind utility classes (`accent` and `success` are fixed hex values in `tailwind.config.js`, not CSS variables). Intentional — standard Tailwind theme override approach — but worth flagging in case there's a cleaner path.
- The `body::before` ambient gradient relies on `.layout-wrapper { background: transparent }`. Any component that sets an opaque background on an ancestor will block the gradient. Worth a scan of `layouts/` and `pages/` for hardcoded background colors.
- `_loadNhFont()` appends a Google Fonts `<link>` on first activation but never removes it when NH is toggled off. Font stays loaded for the session. Intentional — removing mid-session causes FOUT. Never injected on cold start unless NH is active.

## Related Areas to Check

- `tailwind.config.js` — `accent` is hardcoded `#1ad691`, not a CSS variable. NH CSS override approach works but a future improvement could make `accent` a CSS variable.
- `assets/app.css` — Any global styles that might conflict with the transparent layout-wrapper approach.
- Pages/components using `bg-primary` directly on a full-screen container (could block the ambient gradient).

---
<!-- Trigger Greptile by posting @greptileai as a PR comment — not here -->
