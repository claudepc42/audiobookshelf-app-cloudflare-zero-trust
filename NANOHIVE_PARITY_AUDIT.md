# NanoHive Theme — Source Parity Audit

Findings from a full audit of the app's NanoHive theme against the actual NanoHive
source (`https://github.com/rodzalendo/nanohive-abs-theme`, cloned locally at
`../nanohive-abs-theme/theme/`). All four source files were read in full:
`core.js`, `book-details.js`, `enhancements.js`, `nh-early.js`.

**Ground rule for this audit:** source code is the source of truth. Screenshots are
only used to verify how a source rule renders in practice, never as the primary
reference. Where this app's DOM structure genuinely differs from the ABS web client
NH's source targets (this is a separate mobile app, not a reflow of the web client),
that's noted explicitly as an adaptation rather than treated as a mismatch.

---

## Fixed this pass

1. **Cinematic background** — was tied to "currently playing item" with a static
   gradient. Rebuilt to match source: page-context driven (item detail → its own
   cover, series detail → first book's cover, home → active hero-carousel slide,
   other pages → cached last cover), two-layer crossfade, `blur(55px)
   brightness(0.45/0.62) saturate(1.35/1.3)`, the `nh-breathe` scale animation,
   correct bottom-fade gradient using live `--nh-bg-rgb`.
2. **Hero carousel per-slide background** — was `blur(24px) brightness(0.18)`;
   now `blur(60px) brightness(0.5) saturate(1.4)` with source's 110° diagonal
   gradient.
3. **Series card stacking** — was 6 covers fading via `translateY` only; now 3
   covers, diagonal `translate(x,x)` offsets, brightness 0.78/0.60, hover-darken
   on the front cover, gated behind an `.nh-stock-series` toggle class.
4. **Settings system implemented** — accent color, 12 base themes, 16 fonts, font
   scale, logo URL + colorize, hero carousel on/off + timing, continue-reading
   mode, stacked-series toggle, home-shelf hide toggles, bottom-tab/stats
   visibility. New page at `/settings/nanohive`.
5. **Accent color / font-picker settings were cosmetic-only** — dozens of rules
   hardcoded `#e0c27a` / `'Spectral'` instead of `var(--nh-amber)` /
   `var(--nh-serif)`. Swept across `nh-theme.css` and the affected `.vue` files.
6. **Base-theme switching was broken for chrome** — appbar, bottom nav, mini
   player, shelf labels hardcoded the "warm" theme's literal RGB instead of
   `var(--nh-bg-rgb)`.
7. **Real value mismatches fixed**: appbar opacity (0.70 → 0.45), mini player
   opacity (0.45 → 0.4), side drawer (flat opacity → source's two-stop gradient
   at `blur(24px)`, not `blur(32px)`), book-card shadow (removed an invented
   amber micro-border, fixed blur/spread to match `core.js` exactly), success/info
   colors (removed an invented lighter amber — source uses the same `--nh-amber`
   everywhere).
8. **Missing feature added**: finished-book checkmark badge on shelf cards
   (`LazyBookCard.vue`), matching source exactly.
9. **`DevPanel.vue`** (internal dev tool) — "Reset to Defaults" was resetting to
   wrong numbers; removed sliders for vars that no longer exist after the
   cinematic-bg/carousel fixes.

---

## Open findings, by priority

### Confirmed bugs — concrete, ready to fix

- **Bottom-tab icons checked against the wrong source file.** `SideRail.vue`
  (ABS's native web-client icons) was used, but NanoHive overrides those with
  its own `RAIL_ICONS` table in `enhancements.js` (line 987) — the actual source
  of truth for what NH displays. Confirmed mismatch: **Series should be `layers`,
  not `view_column`**. Every mapping needs re-checking against `RAIL_ICONS`, not
  `SideRail.vue`.
- **Global `.bg-primary`/`.bg-fg` and `.text-gray-*` utility overrides never
  ported.** `core.js` lines 69-77 recolor these Tailwind base classes app-wide
  (`.bg-primary`/`.bg-fg` → `var(--nh-raised)`, `.text-gray-400/300/200/100/50` →
  the muted/text vars). Our port only touches `.bg-primary` in two narrow scoped
  spots and `.text-gray-*` only inside the search page. Since these are the base
  classes used throughout settings rows, buttons, modals, and panels everywhere,
  **this is likely the single biggest remaining visual gap** — most raised
  surfaces and secondary text across the whole app are still the stock ABS dark
  palette, not NH's warm one. Confirmed by direct check: `account.vue`,
  `stats.vue`, and every modal component have zero dedicated NH styling and rely
  entirely on this missing cascade.
- **`html[data-theme='nanohive']` background-color is a hardcoded literal**
  (`#181512`) instead of `var(--nh-canvas)` — same class of base-theme-switching
  bug already fixed elsewhere, missed on the root rule itself.
- **Book-card title/author text has zero NH styling.** Source styles this via
  `[cy-id="title"]`/`[cy-id="subtitle"]` (font `var(--nh-serif)`, colors
  `var(--nh-text-2)`/`var(--nh-muted-2)`); our app has no such hooks and
  `LazyBookCard.vue`'s alt-view title/author text renders in the stock font/color.
- **Series card shows a progress bar source explicitly hides**
  (`[cy-id="seriesProgressBar"] { display: none }`), and its "X books" badge is
  styled/positioned nothing like source (source: bottom-left frosted white pill;
  ours: top-right black pill, never checked against spec).
- **Author cards use the wrong shadow treatment entirely.** Source gives
  narrator/author cards their own look (16px radius, softer shadow, hairline
  border, hover-lift with `var(--nh-raised-hover)` — a var that was never even
  added to our CSS). Our `AuthorCard.vue` has no per-card ID hook and falls back
  to the generic book-cover `.box-shadow-book` treatment.
- **Two settings missing from the panel**: `hideHomeContinueSeries` (a real,
  distinct native shelf) and `hideHomeRecentSeries`.

### Real features present in source, missing entirely from the app

- **Synthetic "Recent Series" expanded shelf** — triple-stacked-cover horizontal
  scroller, fetches series sorted by `addedAt`, own CSS/click-routing
  (`enhancements.js` lines 1686-1948). Fully unbuilt.
- **Series detail page header** — name, up to 2 authors, book count + total
  duration, book #1's description, laid out beside/above the grid
  (`nhSeriesHeader()`, lines 1973-2058). Our series detail page currently renders
  nothing but the bare book grid. Bundle with: the series-page toolbar
  transparency/hide-text treatment gated on the same `body.nh-series-page` class
  (`core.js` lines 695-701).
- **Four item-detail-page JS-driven features** (`book-details.js`): finished-badge
  on the item page's own cover (distinct from the shelf-card badge, already
  added), cinematic slim progress bar replacing the native pill, metadata field
  reordering into a fixed order (Narrator, Genre, Publish Year, Duration,
  Publisher, Size, Language, Tag), and a Goodreads search-link button next to
  Play/Read — appears entirely absent from our item page.
- **Ereader (EPUB) font/color customization** — typeface picker across 16 fonts,
  6 page-color presets + custom fg/bg pickers, live preview, hooks into epub.js
  rendition (`enhancements.js` lines 2060-2338). Large feature; need to check
  what our reader already supports before deciding scope.
- **Fullscreen "now playing" player has zero NH styling.** Confirmed directly —
  no amber, no Spectral, nothing in `AudioPlayer.vue`. Our mini-player CSS
  explicitly excludes `.fullscreen` state. No literal source counterpart (the ABS
  web client has no equivalent dedicated screen), but shouldn't be left
  completely unthemed.
- **All four readers (Epub/Comic/PDF/Mobi) have zero NH styling**, separate from
  the ereader customization feature above — even the base chrome (toolbar,
  background, buttons) is untouched.
- **Version footer** in sidebar/drawer showing ABS + NH version — small, may
  already be substantially covered by what `SideDrawer.vue` shows.

### Never actually audited — pure verification work

- **Mini player** — only background opacity/color-var and play-button color were
  fixed so far. The rest of `core.js`'s `#mediaPlayerContainer` block (lines
  545-560) has never been compared: the text-shadow treatment applied to every
  piece of player text (`0 1px 4px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.6)`,
  needed because the pill sits over cover art of unpredictable brightness), the
  `bg-white` text-color exception for light backgrounds, the `bg-gray-700`
  progress-track recolor to amber, cover-image sizing (60px, 12px radius, its own
  drop shadow), the play/pause button's amber glow box-shadow, and a rule that
  hides the sidebar's bottom border while the player is open — that last one
  likely has no target in our layout at all, but should be confirmed rather than
  assumed.
- **Modal/window sizing and page-width constraints** — not looked at once. Source
  bumps the outer modal box from ABS's native `max-height: 80vh` to `90vh`, and
  separately caps *nested* scroll regions inside a modal (e.g. a results list) at
  `60vh` so header/footer buttons don't get pushed off-screen. It also widens
  several page containers on desktop (`max-w-6xl` → `min(96%, 1500px)` for
  narrator/author pages, `max-w-3xl/4xl/5xl` → `min(96%, 1600px)` for
  settings/config, the item page wrapper likewise). None of this has been
  checked against our own modal components or settings/account page widths.
- **Library/series toolbar** — source runs two entirely different toolbar
  treatments depending on page, switched by JS watching the route and scroll
  position (`core.js` lines 180-254): a frosted, fully opaque bar (`blur(28px)
  saturate(150%)`, `rgba(--nh-bg-rgb, 0.45)`) on library/series/collections/
  authors pages, versus a fully transparent "push" bar on the home page that
  fades to `opacity: 0` and `pointer-events: none` after 80px of scroll. Our
  `#bookshelf-toolbar` rule in `nh-theme.css` is currently just `box-shadow:
  none` plus a border — none of this frosted/transparent/scroll-hide split has
  been ported, or even compared against what our toolbar component actually
  looks like today.
- **Item detail page** — never actually diffed value-by-value against
  `book-details.js`. The prior pass asserted "different DOM, so it's a
  reasonable adaptation" and stopped there, without checking specific numbers —
  which is exactly the shortcut that hid the invented amber border and wrong
  shadow spread on book cards until a closer look caught it. The same close
  read needs to happen here: button colors/sizes, metadata typography, title
  font-size, description line-height, all need actual side-by-side values, not
  just "the selectors differ so it's fine."
- **Search page, `#app-content table` styling, dropdown/context menu
  components** — three areas that got a glance and a shrug rather than a real
  check. Search only has its section-header and subtitle text styled; nothing
  else on that page has been compared to source. The `#app-content table` rule
  in `core.js` (used for admin-style data tables) may or may not apply anywhere
  in this app — never confirmed either way. The dropdown/context-menu styling
  (`.border-black-200.shadow-lg`, `core.js` lines 256-296) was confirmed absent
  by class name, but whether our own `components/ui/Menu.vue` and
  `DropdownMenu.vue` have *any* NH treatment under a different selector, or
  render completely unstyled, was never actually looked at.
- **Collection detail page** (`collection/_id.vue`) — renders a
  `tables-collection-books-table` component, i.e. an actual **table** of books,
  not the card grid every other library page uses. This is structurally
  unrelated to anything already covered (series/collection card stacking, book
  cover shadows, etc. — none of it applies to a table row). Completely
  unchecked, and it's not obvious yet whether `core.js`'s generic table styling
  is even the right thing to reach for here.
- **Episode detail page** (`item/_id/_episode/index.vue`) — confirmed via direct
  grep to share none of the `#item-page`/`box-shadow-book` hooks the book item
  page uses. It's a wholly separate template, so none of the item-detail fixes
  or gaps above transfer to it automatically — it needs its own pass from
  scratch.
- **Series-card size-slider parity** (`nhSeriesScale()` in `enhancements.js`,
  lines 1907-1948) — source dynamically resizes the depth-stack
  (`--nh-series-w/-cover/-off1/-off2`) in response to a user-facing cover-size
  slider (`user/getSizeMultiplier`). Whether this app has an equivalent
  size-multiplier control anywhere hasn't been checked; if it does, the stacking
  vars we already ported should scale with it instead of staying frozen at the
  196/168/12/24 baseline.
- **Stats page** — will likely inherit correct surface/text colors once the
  global `.bg-primary`/`.text-gray-*` fix lands, but if it renders any charts or
  graphs via inline SVG fills, a `<canvas>`, or a charting library, those colors
  are supplied in JS/props and are invisible to a stylesheet override entirely —
  a CSS fix wouldn't reach them. Nobody has actually looked at what the stats
  page renders yet to know which case applies.
- **Fullscreen cover viewer** — the app already has a native implementation
  (`modals-fullscreen-cover`, referenced from `pages/item/_id/index.vue`) that
  predates this NH work, so it isn't a missing feature — but its actual styling
  has never been checked against `book-details.js`'s `showFullscreenCover()`
  values (`rgba(14, 12, 9, 0.92)` backdrop, `blur(15px)`) to see whether it
  happens to already match, or needs adjusting.
- **Trix rich-text editor styling and the frosted zoom-button** (`core.js`
  lines 298-301 and 490-521) — both assumed not applicable to this mobile app
  (no in-app rich-text editing, and the zoom button looks tied to a
  desktop-only cover-zoom control), but that assumption was never actually
  confirmed by checking whether either element exists anywhere in this
  codebase. Worth a two-minute grep before crossing them off for good.

### Architectural, not a quick fix

- **FOUC / early-boot theming gap.** Source paints resolved theme CSS vars via
  an inline `<head>` script *before first paint* specifically to avoid a flash of
  the wrong theme (`nh-early.js`). This app is a client-rendered Vue SPA — the
  equivalent logic runs inside `mounted()` hooks, inherently later. Likely means
  a brief flash of default (warm-theme, no cached cover) styling before Vue
  corrects it. Proper fix needs an early inline script before Vue hydrates, not
  a CSS change — flagging as a real decision point (worth the engineering effort
  vs. an acceptable minor flash) rather than silently ignoring it.

---

## Screen-by-screen status

Quick-reference table first, detail below it for anything not simply "covered."

| Screen | Status |
|---|---|
| Home (`bookshelf/index.vue`) | Covered, with known gaps |
| Library grid | Covered via shared rules, toolbar gap applies |
| Series grid | Covered, progress-bar/marker gap applies |
| Series detail | **Not covered** |
| Collections grid | Covered via shared card rules |
| Collection detail | **Never checked** |
| Authors grid | Partially covered |
| Playlists grid / detail | Never checked |
| Item (book) detail | Partially covered |
| Episode detail | **Never checked** |
| Search | Barely covered |
| Account | Zero dedicated styling |
| Stats | Zero dedicated styling |
| Settings | Covered |
| NH Customizations (new page) | Covered |
| Connect / Downloads / Local Media / Logs / History | No source equivalent |
| Fullscreen player | **Zero NH styling** |
| Mini player | Partially covered |
| Readers (Epub/Comic/PDF/Mobi) | **Zero NH styling** |
| Modals (all) | Zero dedicated styling |
| Side drawer / bottom nav | Covered, minor gaps |
| Settings modals (sleep timer, etc.) | Never checked |

**Home** (`bookshelf/index.vue`) — the hero carousel, welcome heading, and shelf
filtering are all wired up and source-verified. What's still missing here isn't
styling, it's settings-panel wiring: `hideHomeContinueSeries` and
`hideHomeRecentSeries` aren't exposed yet, and the synthetic Recent Series shelf
feature doesn't exist at all, so toggling it does nothing.

**Library grid** — book covers, shadows, and the bottom-tab nav are all
source-verified. The one open question is the toolbar: this page should get
source's frosted, fully-opaque treatment, and that split (versus home's
transparent version) has never actually been compared to what our toolbar
component currently does.

**Series grid** — the depth-stack cover treatment (3 covers, diagonal offset,
correct brightness falloff) is done and verified against `core.js` line by
line. Two things on individual cards still need fixing: the series-level
progress bar should be hidden entirely and currently isn't, and the "X books"
badge is in the wrong place with the wrong styling.

**Series detail** — this is one of the more significant gaps. Source adds an
entire header component here (series name, authors, book count, total
duration, and the first book's description) that simply doesn't exist in our
app today; the page is just the bare grid. The toolbar's transparent/hidden-text
treatment for this page is also unbuilt, but it's meaningless on its own since
it's gated behind a class the (currently nonexistent) header would set.

**Collections grid** — inherits the same card-shadow and stacking fixes as the
series grid via shared selectors; no separate work needed beyond what's already
verified there.

**Collection detail** — flagged as a genuine unknown, not a known gap. This
page renders an actual HTML table of books rather than a card grid, which is a
different enough structure that none of the card-based fixes elsewhere in this
audit have any bearing on it. Nobody has looked at this page against source at
all yet.

**Authors grid** — the cards render, but with the wrong shadow entirely: they
currently fall back to the generic book-cover treatment (14px radius, that
shadow spec) instead of source's distinct author/narrator card look (16px
radius, softer shadow, hairline border, and a hover-lift animation that needs a
CSS variable — `--nh-raised-hover` — we haven't even added yet).

**Playlists grid / detail** — never checked. Notably, source's own icon-remap
table doesn't even list a playlists entry, which suggests NanoHive's target
(the ABS web client) may not surface playlists as prominently as this app
does. Likely low visual impact since it probably inherits the same card
styling as everything else, but that's an assumption, not a verified fact.

**Item (book) detail** — the page people will spend the most time on
besides the home screen, and it's only partially done. The typography,
gradient, and general layout treatment are in place, but two things are
outstanding: nobody has actually diffed the exact values (button sizes, colors,
metadata typography) against `book-details.js` line by line, and four
concrete features from source are simply missing — the item-page finished
badge, the slim cinematic progress bar that should replace the native one, a
fixed ordering for the metadata fields, and a Goodreads search-link button.

**Episode detail** — confirmed via direct code search to share zero structure
with the book item page. Whatever gets fixed on the item detail page will not
automatically apply here; it's a separate page that needs its own pass.

**Search** — only the section headers and subtitle text have been styled.
Everything else on this page (result rows, icons, spacing) hasn't been looked
at since this audit began.

**Account** — has no NH-specific styling of its own at all. Whatever it looks
like today is entirely a byproduct of the missing global `.bg-primary`/
`.text-gray-*` fix — once that lands, this page should fall into line
automatically without needing any page-specific work.

**Stats** — same situation as Account for its general surfaces and text, with
one added wrinkle: if this page renders any charts or graphs, those are likely
colored via JS/props rather than CSS classes, which the global fix can't
reach. Nobody has confirmed yet whether that applies here.

**Settings** — covered; a link to the new NH Customizations page was added at
the top, visible only when the NH theme is active.

**NH Customizations** (`/settings/nanohive`, new this session) — self-consistent
by construction; built directly from source's `defaultSettings` object and
`createCustomizationsPanel()` layout, so there's nothing to "diff" against a
prior state here the way there is elsewhere.

**Connect / Downloads / Local Media / Logs / History** — none of these screens
have any equivalent in the ABS web client NanoHive themes, since they're
concepts specific to being a native mobile app with local storage and a
connection flow. Low priority by definition, but they'll still pick up
whatever the global surface-color fix provides, which is likely enough for
them not to look jarringly out of place.

**Fullscreen player** — confirmed by direct inspection of `AudioPlayer.vue`:
no amber, no Spectral font, nothing NH-related anywhere in the file. This is
the actual "now playing" screen a user sees for as long as they're listening,
so despite having no literal source equivalent to copy from (the ABS web
client doesn't have a dedicated fullscreen player the way a mobile app does),
leaving it completely unthemed is a real visible gap, not just a technicality.

**Mini player** — background color/opacity and the play button are fixed and
verified; everything else in source's `#mediaPlayerContainer` block (listed in
detail above) hasn't been touched.

**Readers** (Epub/Comic/PDF/Mobi) — confirmed by direct inspection: zero
NH-related code in any of the four reader components. This is broader than
just the ereader font/color customization feature being unbuilt — even basic
chrome like the toolbar and background canvas is still fully stock ABS styling.

**Modals** (library switcher, playlist create, local folder picker, RSS feed) —
like Account and Stats, these have no dedicated NH styling and are currently
relying entirely on the missing global CSS fix for their colors.

**Side drawer / bottom nav** — largely covered (frosted background, amber
active states, the new Customizations link), but with two open items: the
Series tab icon is wrong because it was checked against the wrong source file
originally, and the ABS-version/NH-version footer source shows in the sidebar
hasn't been confirmed as either present or missing from `SideDrawer.vue`.

**Settings modals** (sleep timer length, auto-sleep-timer rewind length, etc.)
— never checked, and probably low-impact since they're small, infrequently
used pickers, but that's an assumption rather than a verified conclusion.

---

## Suggested starting point

The global `.bg-primary`/`.text-gray-*` fix (see "Confirmed bugs" above) is the
highest-leverage item — it's the one change that brings account, stats, every
modal, and most settings rows into line at once, rather than needing bespoke CSS
per page.
