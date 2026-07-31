# NanoHive 2.0.6 `book-details.js` — Full Feature Audit (R&D only, no code written yet)

Read in full: `theme/book-details.js` (1619 lines). Cross-referenced `theme/core.js`
(CSS/shared classes) and `theme/enhancements.js` (background management +
star-rating helpers it calls into).

The changelog line "Redesigned book page: big cover, blurred cinematic
background" covers maybe 15% of what's actually in this file. The other ~85%
is net-new: a full community ratings/reviews system, a problem-report system,
editable started/finished dates, a finished badge, a custom progress bar, HD
cover zoom, and metadata reflow logic.

---

## 1. Layout/CSS redesign (the part the changelog actually describes)

Transparent page background (lets the cinematic backdrop show through),
widened content column (`min(96%,1600px)`), two-column layout — fixed-width
left sidebar (cover + metadata) on desktop (`min-width:1024px`), collapses to
single stacked column on mobile — large serif `<h1>` title, restyled action
buttons, restyled description, re-skinned tracks/chapters/files table.

- CSS injection: `book-details.js:9-503`
- Page-wrapper transparency: `book-details.js:14-17`
- Content width expansion: `book-details.js:25-29`
- Left column flex/sidebar (desktop breakpoint): `book-details.js:35-55`
- Cover aspect-ratio + shadow + zoom cursor: `book-details.js:57-70` (standard-covers variant `1/1.6` via `html.nh-covers-std`, `:68-70`)
- Cover image object-fit/radius: `book-details.js:72-78`
- Native progress-bar-on-cover hidden but kept in DOM (JS still reads its class): `book-details.js:80-90`
- Metadata grid (`.nh-metadata-container`): `book-details.js:119-165`, desktop-narrower variant `:48-54`
- Title typography: `book-details.js:167-187`
- Action button restyle: `book-details.js:194-261`
- Description formatting: `book-details.js:263-281`
- Chapters/Tracks/Files table re-skin: `book-details.js:283-377`
- Mobile breakpoint (`max-width:640px`): `book-details.js:378-422`

**Backend dependency:** none. Pure CSS/DOM against `/api/items/:id` data ABS already returns.

**Native port recipe:** straightforward Vue-layout translation — two-column
`flex` (row ≥1024px, column below), cover as `aspect-ratio:1` (or `1/1.6` if
"standard covers" library setting), metadata as CSS grid
`repeat(auto-fill, minmax(160px,1fr))`, field order driven by an explicit
array (see §6), not DOM order.

---

## 2. Cinematic blurred background (shared system — NOT book-page-specific)

A single body-level `#nh-home-bg` (two crossfading `.nh-bg-layer` divs) is
reused across home/series/item/author pages, not a per-page element. Book
page swaps to a **darker** filter variant + different gradient overlay.

- `book-details.js:9-13` — comments explain the old per-page `#nh-cinematic-bg` was removed for the shared element; `:14-17` sets `#page-wrapper.nh-cinematic-mode` (and item-page-wrapper child) transparent.
- Actual rendering: `core.js:850-863`
  - `#nh-cinematic-bg { display:none !important; }` — dead legacy element, `core.js:851`
  - `#nh-home-bg` base (fixed, `-10%` oversized inset, opacity transition 1.6s) — `core.js:852`
  - `.nh-bg-layer` (blur 55px, brightness 0.45, saturate 1.35, `nh-breathe` 20s zoom) — `core.js:853-854`
  - `::after`/`::before` both always present, crossfade via opacity for light "home" vs. darker "item" gradient — `core.js:855-860`
  - `body.nh-cinematic-item`: `brightness(0.62)` vs `0.45`, swaps which gradient shows — `core.js:861-863`
  - `body.nh-cinematic` strips background from ancestor containers so backdrop shows through — `core.js:865`
- Body-class + URL logic in `enhancements.js`:
  - `setHomeBg(url)` — creates/crossfades layers: `enhancements.js:2974-2996`
  - `manageCinematic()` route dispatcher: `enhancements.js:3003-3107`
    - Item page: `nh-cinematic` + `nh-cinematic-item`, cover URL derived directly from route id (`/api/items/:id/cover?width=800`, token appended) rather than waiting for Vue's `<img>` — `:3026-3040`
    - Series detail: same mechanism keyed off series' first book — `:3049-3065`
    - Home: lighter mode, no `nh-cinematic-item` — `:3068-3074`
    - Author page: darker mode, cover from first `<img src*="/cover">` — `:3076-3090`
    - Library sub-pages/Settings: reuse home backdrop, lighter — `:3093-3102`
- `book-details.js:1350-1356` just toggles `#page-wrapper`'s `nh-cinematic-mode` class based on path.

**Backend dependency:** none — `/api/items/:id/cover?width=800`, stock ABS.

**Native port recipe:**
1. On item-detail mount, derive cover URL: `GET {server}/api/items/{id}/cover?width=800`.
2. Full-bleed background layer behind content: blur ~55px, brightness 0.62 (darker "item" mode; 0.45 for home/library), saturate 1.3.
3. Bottom-heavy vertical gradient scrim: ~30% opacity of theme bg color at top → 100% opaque at ~55% down (`rgba(bg,0.3) 0%, rgba(bg,0.6) 55%, rgb(bg) 100%` for item pages).
4. Optional slow "breathe" zoom: scale 1.0→1.2 over 20s ease-in-out alternate (cosmetic, skip if not worth it).
5. Crossfade on cover change: opacity over ~1.6-2.8s, not instant.
6. Content above via elevated z-index.

---

## 3. Big cover + HD upscale + fullscreen zoom viewer

Detects ABS's cover `<img>` (smaller width), clones + re-requests at
`width=800`, crossfades over the low-res original (hidden via opacity, not
removed), wires click → fullscreen lightbox upscaling further to `width=1600`.

- HD swap: `book-details.js:1425-1463` (guarded by `dataset.hdFixed`, `:1427`; placeholder-art guard `:1429-1434`; URL rewrite via `URLSearchParams.set('width','800')`, `:1444-1449`; click handler `:1454-1461`)
- Fullscreen lightbox `showFullscreenCover()`: `book-details.js:514-537` — full-viewport overlay `rgba(14,12,9,0.92)`, `backdrop-filter: blur(15px)`, swaps `width=800`→`width=1600`, click-anywhere-to-close.
- Cover container CSS: `book-details.js:57-70`, image `:72-78`.

**Backend dependency:** none — `/api/items/:id/cover?width=N`, stock ABS.

**Native port note:** trivial to do better natively — request the higher-res
variant directly via the app's own image loader, no need for the
low-res-then-swap trick (that only exists here because NH overlays an
already-rendered DOM image). Fullscreen viewer = standard image
lightbox/zoom component; note `width=1600` for "tap to zoom" full-res.

---

## 4. Finished badge on cover (checkmark, top-right)

Circular badge (44px, top-right, 14px inset), checkmark glyph, when
progress data shows finished — since the native progress bar's own
"finished" indicator is hardcoded to a fixed pixel width that breaks on the
resized cover.

- Detection reads hidden native progress bar's classes for `bg-success` vs `bg-yellow-400`: `book-details.js:1547-1564` (prefers `[cy-id="progressBar"]`, falls back to positional selector)
- Badge injection/removal: `:1551-1564`
- Badge CSS: `:98-116` — `--nh-finished-bg`/`--nh-finished-fg` vars (shared with shelf-card badges), glyph is hardcoded `✔︎` via `::after` (not an icon font, specifically to stop Android rendering it as a color emoji)
- Same mark used on shelf/library cards: `core.js:504-520` (`.nh-finished::after`) — one consistent finished indicator across grid + detail page. Default colors `#4c9a5e` / `#0d1a11`.

**Backend dependency:** none — reads progress state ABS already fetched.

**Native port note:** app already has `libraryItem.userMediaProgress.isFinished`
directly — just needs a matching badge component (44dp circle, checkmark,
same or equivalent color tokens) positioned top-right over the cover.

---

## 5. Custom progress bar (replaces native "X% remaining" pill)

ABS renders a small percent/remaining-time pill; NH parses that text and
replaces it with a slim custom bar (5px, amber fill + glow) plus a styled
close button proxying clicks back to ABS's own dismiss button.

- Detection/parsing: `book-details.js:1465-1485` (finds `.bg-primary.max-w-max`, regexes `\d+%` and locale "remaining"/"pozostało"/"left" text)
- Custom UI build: `:1487-1528`
- Close-button proxy (forwards to native rather than reimplementing dismiss): `:1506-1521`
- Native pill hidden via `data-replaced="true"` + CSS: `:189-192`; companion restyle in `core.js:841-844`.

**Backend dependency:** none — restyles data ABS already computed.

**Native port note:** app has the raw progress number already (no DOM
scraping needed) — just a slim progress-bar component: track 5px, fill
amber `#e8a23e`, glow `box-shadow: 0 0 10px rgba(232,162,62,0.5)`, remaining
label left, percent label right.

---

## 6. Metadata grid relocation + reordering + locale author-prefix strip

Takes ABS's native label/value metadata rows and relocates them (under the
cover on desktop ≥1024px, above the description on mobile), re-parenting on
every breakpoint-change tick, with explicit field ordering overriding ABS's
native DOM order.

- Container detection with fallback chain: `book-details.js:1376-1380`
- Desktop-vs-mobile relocation (`matchMedia('(min-width:1024px)')`): `:1392-1399`
- Explicit field order: Narrator=1, Genre=2, Publish Year=3, Duration=4, Publisher=5, Size=6, Language=7, Tag=99 (full-width via `gridColumn:'1 / -1'`), everything else=50 — `:1401-1422`
- Polish "Autor"/"Autorzy"/"autorstwa" prefix stripped from author line (English "by " untouched): `:1358-1370`

**Backend dependency:** none — DOM/CSS reflow of `/api/items/:id` data.

**Native port note:** native app builds its own layout from the API response
directly — just define field render order
`[narrator, genre, publishYear, duration, publisher, size, language, tags-full-width]`
in the Vue component + a responsive grid
(`repeat(auto-fill,minmax(160px,1fr))` desktop / wrapping pill row mobile).

---

## 7. Started/Finished dates widget

New block under the metadata grid: "Started" and "Finished" as styled
`<input type=date readOnly>` fields with calendar icon. **Finished date is
genuinely editable and sticks; started date is NOT editable through stock
ABS** (ABS accepts the PATCH, returns 200, but silently keeps its own
value) — so NH stores its own started-date override via its own proxy.

- Block build: `nhBdDates()`, `book-details.js:636-729`
- Signature-guarded re-render: `:649-653`
- **Started date**: reads `nhBdStarted[itemId]` (NH's own store) or falls back to `prog.startedAt`; edits POST to `/_nh/api/dates` (`:686-694`) — **NH PROXY ONLY, cannot port**. Loading overrides: `nhBdLoadStarted()`, `:616-628`, `fetch('/_nh/api/dates', ...)`.
- **Finished date**: reads `prog.finishedAt` (stock ABS `mediaProgress`); edits `PATCH /api/me/progress/:itemId` with `{finishedAt: ms}` (`:710-720`) — **ABS-native, fully portable** (this is the same endpoint our fork's own finished-book-tools research already confirmed independently).
- i18n table (en/pl/de/fr/es): `:604-611`
- CSS: `:443-452`; date-input icon wrapper classes actually defined in `core.js:1963-1979`.

**Backend dependency: split.**
- Finished-date: none — `mediaProgress` (already in our app's Vuex state) + `PATCH /api/me/progress/:itemId`. Fully portable, and we already have this from the finished-book-tools work.
- Started-date: **yes**, `/_nh/api/dates` (NH proxy). Cannot port as-is. Options: (a) drop editing, display ABS's own read-only `startedAt` (zero backend needed), or (b) if we ever build a companion backend (see NANOHIVE_NOTPORTABLE_PLAN.md), add a tiny `{itemId: {startedAt}}` per-user store there.

---

## 8. Community ratings & reviews widget (biggest net-new feature — not in the changelog line at all)

Full star-rating + short-review system shared across every user of the
server (Goodreads-style aggregate, not private per-user ratings): big stars
filled to community average under the Play/Read button row, numeric score,
"N ratings · M reviews" link opening a modal, interactive click-to-rate
picker with hover preview, collapsible review-text editor, admin-only
moderation (delete others' ratings).

- CSS: `book-details.js:424-502`
- State object `nhRt`: `:553`
- Enable/disable chain (library opt-out, user-setting/server-config/env precedence): `:555-569`
- Token sourcing (prefers sniffed `window.__NH_TOKEN`, falls back to Vuex/localStorage): `:571-583`
- Current-user identity + admin permission: `:585-592`
- **Fetch**: `nhRtFetch()`, `:986-1010` — `GET /_nh/api/ratings?item={id}` (**NH proxy only**; 404/405 → removes whole widget, treats backend as absent)
- **Save**: `nhRtSave()`, `:1012-1038` — `POST /_nh/api/ratings` (self) or `POST /_nh/api/ratings-admin` (moderate another user, admin-gated server-side) (**NH proxy only, both**). Fires `nh-rating-change` CustomEvent on success so shelf badges patch without refetching.
- Main render `nhRtRender`: `:1040-1241` — average computed client-side over fetched entries; interactive star picker uses "ink-aware" clipping (half-star splits at glyph's visual middle, not naive 50% box-width) via shared helper `window.__nhStarFill` (`enhancements.js:5636-5724`); hover-preview-then-click interaction; numeric score fixed-width box to prevent layout shift; reviews list modal (name, stars, score, date, text, admin-only delete for others).
- Mount/lifecycle scheduler `nhRtMaintain`: `:1243-1292` — anchors directly after Play/Read row (fallback: before description).
- **Cross-page reuse**: same widget mountable on series page via `window.__nhRatingsMount(host, key)` (`:1300-1341`), keyed `"series:<seriesId>"` — book-page and series-page ratings are the literal same component instance.

**Backend dependency: yes, entirely.** Every read/write goes through NH's
nginx/njs proxy (`nh-ratings.js`), which verifies identity by replaying the
client's Bearer token against ABS's own `/api/me` server-side. **No
equivalent in stock ABS's API at all** — ABS has no concept of a shared
rating separate from personal library metadata. Porting the *feature* (not
just copying the UI) requires standing up an equivalent backend of our own.
See NANOHIVE_NOTPORTABLE_PLAN.md.

---

## 9. "Report a problem" feature

Dialog (reason radio-group + optional free-text note) letting a signed-in
user flag an issue with a book. Preferentially injected as the **first
entry in ABS's own native three-dot item menu** (patches the Vue
component's `items` array and intercepts its `$emit`), with a standalone
fallback link if the menu's shape isn't recognized.

- Reason list + i18n (en/pl/de/fr/es): `book-details.js:737-749`
- Dialog build: `:763-825` — accessible radiogroup, textarea capped 600 chars, Escape/click-outside to close
- **Send**: `POST /_nh/api/reports` with `{itemId, title, reason, note}` (`:811-820`) — **NH proxy only**
- Native-menu injection `nhKebabReport`: `:832-884` — identifies correct Vue instance by `items` array containing `collections`/`playlists`/`nh-report` actions (not markup/class, which shifts across ABS builds); unshifts `{text, action:'nh-report'}`, monkey-patches `vm.$emit`.
- Standalone fallback `nhReportLink`: `:886-913`.

**Backend dependency:** yes for send (`POST /_nh/api/reports`, NH proxy
only). Cannot port to native app talking only to stock ABS. Needs a custom
backend endpoint of our own, or simplest native equivalent: open the
device's email/support-contact flow instead of storing server-side.

---

## Summary table

| Feature | Entry point | Backend | Endpoint | Portable as-is? |
|---|---|---|---|---|
| Layout/CSS redesign (2-col, big square cover, typography) | book-details.js:9-422 | none | — | Yes |
| Cinematic blurred background | enhancements.js:2974-3107, core.js:850-865 | none | `/api/items/:id/cover?width=800` | Yes |
| HD cover swap + fullscreen zoom | book-details.js:514-537, 1425-1463 | none | `/api/items/:id/cover?width=800/1600` | Yes |
| Finished badge on cover | book-details.js:1543-1564, core.js:504-520 | none | reads local progress state | Yes |
| Custom progress bar restyle | book-details.js:1465-1528 | none | reads local progress state | Yes |
| Metadata grid relocate/reorder | book-details.js:1372-1423 | none | `/api/items/:id` (already fetched) | Yes |
| Finished date display+edit | book-details.js:699-724 | ABS-native | `PATCH /api/me/progress/:itemId` | Yes (already built this session) |
| Started date display+edit | book-details.js:672-698, 616-628 | NH proxy | `/_nh/api/dates` | No — display read-only version only |
| Community ratings & reviews | book-details.js:543-1341 | NH proxy | `/_nh/api/ratings`, `/_nh/api/ratings-admin` | No — needs custom backend |
| Report a problem | book-details.js:731-913 | NH proxy | `/_nh/api/reports` | No — needs custom backend or alt UX (e.g. mailto) |

**Bottom line:** sections 1-6 are a pure client-side port, zero backend
risk, straightforward Vue work on data the app already has. Section 7's
finished-date half is already done (this session's earlier finished-book-
tools work). The remaining pieces (started-date, ratings, reports) are
genuinely new server-backed functionality needing a companion service —
see NANOHIVE_NOTPORTABLE_PLAN.md for architecture options.
