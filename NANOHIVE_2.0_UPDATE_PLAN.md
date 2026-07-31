# NanoHive 2.0.6 — Update / Gap-Analysis Plan

Source: `https://github.com/rodzalendo/nanohive-abs-theme`, local clone at
`../nanohive-abs-theme`, fast-forwarded from the fork's last-audited state
(`v1.8.0`, 2026-07-20 local HEAD) to **`v2.0.6`** on 2026-07-30. Diff span:
26 commits, 45 files changed, +13,823/-573 lines. `theme/enhancements.js`
alone gained 10,099 lines in this span — this is a major version, not an
incremental update.

**Ground rule (per project convention):** every claim below is checked against
actual source in `theme/core.js`, `theme/enhancements.js`, `theme/book-details.js`,
`theme/nh-early.js`, or `docs/reddit-2.0-post.md` (the author's own 2.0
changelog draft) — not inferred from screenshots. Where a feature is a
web-proxy/backend feature that cannot apply to this native app, that's stated
explicitly rather than silently skipped.

**Important context this fork already reflects:** the previous audit
(`NANOHIVE_PARITY_AUDIT.md`) ported the **Look** layer only — themes, fonts,
accent color, hero carousel, cinematic background, home-shelf toggles, series
card stacking. None of the ratings/stats/sort-filter/social backend from 2.0
exists in this app (confirmed via grep — no rating, autoplay-next-in-series,
or finished-tools code present). That's expected: this is a native mobile
client talking to a real ABS server API, not a reverse-proxy skin, so an
entire class of NH 2.0 features (server-wide ratings DB, admin stats, cross-
user ranking) would require a *server-side companion service* we don't
control, not a client-side port.

---

## 1. The background/carousel question — answered

**Your observation:** on NH's official GitHub home-page screenshot
(`docs/main.png`, "Around the World in 80 Days" by Jules Verne — actually
opened and viewed, not inferred from description), the hero carousel
background reads with clear teal cover color, while the full-page background
surrounding it reads almost flat near-black, with barely any of that color
showing through. Your own screenshot of your own server (`Capture.PNG`,
"Major Operation" by James White) shows the same pattern — color and
positioning genuinely continuous between the carousel and the page, but the
carousel itself noticeably brighter/more saturated on the right side than
the left.

**Finding, confirmed against both real screenshots and exact source lines:
same image, same position, no flip/rotate/crop trick — but the full-page
background has an entire second darkening layer that the hero banner does
not have.**

Both elements pull from the identical `coverUrl` of the currently-active hero
slide (`enhancements.js:2866`, `2888`: `nhHomeCover = slides[idx].coverUrl;
setHomeBg(slides[idx].coverUrl)`), and I grepped `core.js`, `enhancements.js`,
and `nh-early.js` for `rotate`, `scaleY`, `flip`, `transform` near every
background rule — nothing touches orientation anywhere. The actual cause is
two completely different opacity treatments stacked on top of that one image:

**Hero banner background** (`enhancements.js:2402-2403`, inside
`.nh-hero-banner`):
```css
.nh-hero-bg { inset: -12%; background-size: cover; background-position: center;
  filter: blur(60px) brightness(0.5) saturate(1.4); }
/* the only overlay the banner has: a diagonal fade, not a solid wash */
background: linear-gradient(110deg,
  rgba(bg, 0.92) 0%,   /* left, over the text — mostly opaque */
  rgba(bg, 0.62) 50%,
  rgba(bg, 0.22) 100%);/* right, near the cover — 78% of the real image shows through */
```

**Full-page background** (`core.js:852-863`, `#nh-home-bg`):
```css
.nh-bg-layer { filter: blur(55px) brightness(0.45) saturate(1.35); }
/* a SECOND layer with no equivalent on the hero banner at all */
#nh-home-bg::after {
  background: linear-gradient(180deg,
    rgba(bg, 0.5) 0%,
    rgba(bg, 0.8) 55%,   /* already 80% solid opaque background color by the halfway point */
    rgb(bg) 100%);        /* fully solid by the bottom */
  opacity: 1;              /* always on, in home mode */
}
```

The hero banner is built to let the real cover color show through (down to
just 22% dark overlay on its brightest side). The full-page background is
built to actively suppress it — by 55% of the way down the screen it's
already 80% covered in flat, solid background color, layered on top of an
already-dimmer `brightness(0.45)` base. That's a deliberate design choice
(keep the small hero vivid to draw the eye; keep the large ambient backdrop
subtle so it doesn't fight with foreground content), not a bug, not a
different image, and not a crop artifact — it fully explains "lighter and
darker at the same time, at a different rate" exactly as you originally
described it, in both screenshots.

*(A secondary, smaller contributor: `.nh-hero-banner`'s own box height is
book-specific — driven by that book's title/description length, not fixed —
so `background-size: cover` will crop each book's own image slightly
differently into the banner vs. the full viewport. This is real but minor
next to the `::after` wash above, and doesn't require matching browser width
to reason about — it only matters as a secondary layer on top of the
opacity difference, not as the explanation on its own.)*

**Not a bug to fix, nothing currently ported incorrectly** — this fork's
carousel/background implementation doesn't run NH's two-layer full-page
`#nh-home-bg` system at all today (our `.nh-slide-bg` covers only the
carousel itself, via `NH_GLASS_EFFECT_CONTROLS`'s "Cinematic Background" and
"Carousel Background" groups), so this specific effect doesn't exist in our
app yet either way. Relevant if we ever port NH's full-page ambient
background as a separate feature — worth reproducing the `::after` solid-wash
layer deliberately if so, not just copying the blur/brightness/saturate
values, since the wash is most of what makes NH's version read the way it
does.

### Matching NH's hero-screenshot look (separate ask: closer defaults)

Source values for the two layers, for reference when tuning our own defaults
to visually match NH's hero screenshot:

- Hero carousel banner background (`enhancements.js:2402`): `inset: -12%`,
  `filter: blur(60px) brightness(0.5) saturate(1.4)`, overlaid with
  `linear-gradient(110deg, rgba(bg,0.92) 0%, rgba(bg,0.62) 50%, rgba(bg,0.22) 100%)`
  (`enhancements.js:2403`) — a diagonal fade so the cover reads clearly under
  the title/button text on the left, fading to more-visible cover art on the
  right.
- Full-page home background (`core.js:852-863`): two-layer `#nh-home-bg
  .nh-bg-layer`, `filter: blur(55px) brightness(0.45) saturate(1.35)`
  (darker variant on item pages: `brightness(0.62)`), plus a bottom gradient
  `linear-gradient(180deg, rgba(bg,0.5) 0%, rgba(bg,0.8) 55%, rgb(bg) 100%)`
  and a continuous `nh-breathe` 20s ease-in-out alternating scale animation
  for subtle ambient motion.

Our current `NH_GLASS_EFFECT_CONTROLS` "Cinematic Background" group
(blur 12 / brightness 1.08 / saturate 1.9) and "Carousel Background" group
(blur 28 / brightness 0.5 / saturate 1.4) are both meaningfully lighter/less
blurred than NH's own defaults (55-60px blur, 0.45-0.5 brightness). If you
want the GitHub-hero look specifically, the biggest lever is blur radius —
NH runs roughly double ours on both layers. Recommend as a follow-up (not
done yet, pending your go-ahead): bump `--nh-cine-blur` default toward
45-55px and `--nh-cine-brightness` down toward 0.45-0.5 to match: our current
brightness default (1.08) is actually brighter than the *unblurred* source
image, which is the opposite direction from NH's darker/moodier hero look.

---

## 2. Feature-by-feature gap analysis (NH 2.0.6 vs. this fork)

Legend: ✅ already ported · 🟡 partially ported / adjacent feature exists ·
⬜ not ported, portable · 🚫 not portable (requires a server-side companion
NH doesn't ship as a standalone API, or is inherently web-proxy-only)

### Ratings
- ⬜ Server-wide star ratings + short reviews (shared across users) — 🚫
  requires a database NH's nginx proxy owns; nothing in stock ABS's API
  stores this. Not portable without running NH's proxy alongside the ABS
  server and having this app call its custom endpoints — a real architecture
  decision, not a quick port.
- ⬜ "Rate what you finished" home row — depends on the rating store above.
- ⬜ Admins remove any rating — same dependency.

### Sorting and filtering
- ⬜ Multi-level sort (up to 8 dimensions, numbered precedence) — ✅ confirmed
  no proxy dependency: grepped every `/_nh` call in `enhancements.js` and
  none belong to the sort/filter subsystem — it's pure client-side logic
  over data ABS's own library-listing endpoints already return. Portable,
  but real UI/UX rebuild scope, not a quick add.
- ⬜ Stackable filters with per-value counts — same confirmation, same
  caveat: portable, no backend, but this is one of NH's largest 2.0
  subsystems (filtering logic in `enhancements.js` runs to thousands of
  lines) — plan it as its own project, not a bolt-on.

### Stats
- ⬜ Server Ranking (cross-user, medals, leaderboard) — 🚫 requires NH's
  proxy-side per-user listening aggregation service; not in stock ABS.
- ⬜ Server statistics (admin) — 🚫 same dependency.
- ✅ confirmed portable — "Your listening" (streaks, weekday habits, top
  books/authors/narrators) runs entirely off ABS's own native
  `/api/me/listening-stats` (`enhancements.js:8555,9736,9787` — same
  endpoint reused across the streak calculation, the weekday heatmap, and
  the shared-summary push to the ranking board). No NH backend needed for
  the personal-stats half at all — only the *cross-user ranking board* built
  on top of it (below) needs the proxy. This fork already has
  `pages/stats.vue` and `components/stats/YearInReview*.vue` built against
  the same category of ABS data, so this is additive UI work on an endpoint
  we already consume elsewhere, not new integration work.
- ⬜ Year in Review — 🟡 we already have `YearInReview.vue`/`YearInReviewShort.vue`;
  compare feature depth in a follow-up pass rather than assuming parity.

### "Three things people keep asking upstream for"
- ⬜ Autoplay next book in series — ✅ confirmed portable. Verified in source:
  `nhSettings.autoplaySeries` (`enhancements.js:66`) is a plain client-side
  toggle checked at playback-end (`enhancements.js:8358`) — no server/proxy
  endpoint involved at all. Good candidate for direct porting as-is.
- ⬜ Finished-book tools — ✅ **fully portable, both halves — this reverses my
  previous round's correction, which was itself wrong.** Last pass I saw
  `/_nh/api/dates` exists in `default.conf.template` and assumed it backed
  this feature — I hadn't actually checked whether the client code calls it.
  It doesn't. Traced the real call chain instead:
  - Both actions go through one helper, `nhFdPatch()` (`enhancements.js:8664`),
    which PATCHes ABS's own native `/api/me/progress/:id` — not any NH
    endpoint.
  - "Change the finished date" → `nhFdPatch(id, { finishedAt: ms }, ...)`
    (`enhancements.js:8711`).
  - "Mark as finished" (the 97-99% fix) →
    `nhFdPatch(id, { isFinished: true }, ...)` (`enhancements.js:8736`).
  - The 97-99% list itself is a client-side filter over
    `mediaProgress` the store already has (`NH_ALMOST_MIN = 0.97`,
    `enhancements.js:8638-8647`).
  So ABS's own API *does* support editable `finishedAt`/`isFinished` on
  progress records — no backend companion needed for this feature at all.
  **What `/_nh/api/dates` is actually for** (traced into
  `njs/nh-ratings.js:582`, function `dates`): a small, unrelated, cosmetic
  feature — a per-user override for the *displayed "started reading"* date
  (`{ startedAt }`), stored at `/data/nh/dates.json`, explicitly documented
  in NH's own source as "nothing is written to ABS; clearing the override
  falls back to ABS's date." Wasn't called out by name in the reddit
  changelog. 🚫 for that one specific sub-feature only if we ever want it —
  low priority, cosmetic-only, not part of "finished-book tools."
- ⬜ "Report a problem" + admin queue — 🚫 needs a place to store reports;
  NH's proxy owns that store (`/_nh/api/reports`, `/_nh/api/reports-admin`,
  confirmed in `default.conf.template`). Not portable without a server
  companion.

### Browsing
- ⬜ Cross-library merged search — portable; client-side fan-out over ABS's
  existing per-library search endpoint, badge the library per result.
- 🟡 Collections rebuilt — **split verdict, confirmed by checking the actual
  fetch calls, not assumed:** collection create/edit/add-books
  (`enhancements.js:7191,7297,7710,7716`) all call ABS's own native
  `/api/collections` endpoints — fully portable, we already have
  `pages/bookshelf/collections.vue`/`pages/collection/_id.vue` to build on.
  The **icon-emblem mapping specifically** is 🚫: it's stored via NH's own
  proxy file, `/_nh/collection-art.json` → `/data/nh/collection-art.json`
  (`enhancements.js:7549`, `default.conf.template:69-70`), not through ABS.
  So: collection CRUD/editing is portable now; the icon-emblem-instead-of-
  cover-wall *look* needs either our own storage mechanism or falls back to
  the existing cover-wall rendering.
- ⬜ Narrator/Author card pages (cover collages, counts, filter/sort) — ✅
  confirmed portable: narrator data comes from ABS's own
  `/api/libraries/:id/narrators` (`enhancements.js:6635`), no proxy call
  involved. `pages/bookshelf/authors.vue` already exists here; would need a
  matching narrators page and the collage/card visual treatment, both
  buildable on data we can already fetch.
- 🚫 Custom series covers/descriptions (uploaded, with generated fallback
  cover) — **confirmed, corrected from "not yet verified":** proxy-hosted,
  not ABS-native. `default.conf.template` has dedicated locations
  `/_nh/series-covers/`, `/_nh/series-desc/`, and `/_nh/api/series-meta` —
  NH's own file storage (DAV-backed), not an ABS API call. Not portable
  without a server companion, same as the ratings/reports/stats endpoints.
- ⬜ Pick your own start page — small, portable, purely a settings + router
  default change.

### Look
- ✅ 12 base themes, any accent color, per user — already ported
  (`NH_BASE_THEMES` in `store/index.js` matches NH's 12 themes 1:1).
- ✅ Hero carousel of in-progress books — already ported
  (`components/nh/HeroCarousel.vue`), including this session's swipe-gesture
  and title-centering fixes.
- 🟡 Redesigned book page, big cover + blurred cinematic background — we
  have cinematic background (item-page mode already implemented per the
  prior audit); "big cover" redesign specifically not yet compared against
  `book-details.js`'s 2.0 changes (that file alone grew by 1,051 lines this
  release — worth a dedicated follow-up pass).
- ⬜ Reorderable home sections — ✅ confirmed portable: `homeOrder` is just
  another plain field on NH's client-side `nhSettings` object
  (`enhancements.js:68,11202-11326`), saved through the same local
  `saveSettings()` mechanism as every other NH preference — no backend
  involved. We already have *hide* toggles per section
  (`hideHomeRecentlyAdded` etc.) using the same kind of settings field; add
  an order array alongside them the same way.
- 🚫 User profile photos (top bar + ranking) — **corrected, both halves are
  proxy-dependent, not just the ranking half.** `default.conf.template` has
  `/_nh/user-avatars/` and `/_nh/api/avatar-admin` as dedicated NH-proxy
  storage locations — the photo itself is uploaded to and served by NH's
  proxy, not stored as an ABS user field. Not portable without a server
  companion for either half.
- 🟡 Upload your own logo, proxy-hosted for air-gapped servers — we already
  have `logoUrl` + `colorizeLogo` settings; NH's specific "proxy hosts the
  file for air-gapped servers" guarantee is a web-proxy hosting detail that
  doesn't apply to a native app pointed at a real server URL.
- ⬜ Extended ereader with typeface picker incl. OpenDyslexic — portable,
  ties into whatever ereader font-selection already exists in this app
  (not yet checked this pass).
- ⬜ Book lookup links (Goodreads + biggest regional site, 25 logos bundled) —
  portable; pure UI + external link construction from existing metadata
  (author/title), no backend dependency. NH ships the 25 site logos as PNGs
  in `theme/booksites/` — usable directly if we want the same icon set.
- ⬜ Translated into all 40 ABS languages — this app already has
  `plugins/i18n.js`; scope is "does our translation set match ABS's 40", a
  separate localization task, not visual/theme work.

### Admin
- ⬜ Save current look as server default (selective) — 🚫 needs a
  server-side default-settings store shared across users; not applicable to
  a per-device native app in the same way.
- ⬜ Force-disable features per server — same dependency, 🚫.
- ⬜ Tidy authors (remove authorless entries) — ✅ confirmed portable, no NH
  backend involved. `enhancements.js:6861` calls
  `fetch('/api/authors/' + a.id, { method: 'DELETE', ... })` — that's ABS's
  own native admin API, not an NH-proxy endpoint. NH is just providing the
  UI to find authors with zero books and batch-call an endpoint stock ABS
  already exposes. Good, low-effort candidate for direct porting.

### Mobile (NH's own notes on what 2.0 did for their embedded mobile view)
NH explicitly says 2.0 improved *their web theme's* mobile rendering (cover-
first hero fits one screen, centered grids, single-scroll series page, charts
that fit instead of overflow). This is NH fixing their own responsive CSS for
phone browsers hitting the proxied web client — it doesn't describe our
native app at all, but it's a useful reference for the same layout goals
(hero fits first screen, grids centered) if we want to sanity-check our own
mobile layout against their target.

---

## 3. Suggested next steps (no action taken yet — awaiting direction)

1. **Cinematic background defaults** — decide whether to nudge our
   `--nh-cine-blur`/`brightness` defaults toward NH's own (see §1) to better
   match the GitHub hero look. Small, contained change.
2. **Pick 1-2 "portable, no backend dependency" items to prototype first** —
   strongest candidates by effort/value: autoplay-next-in-series,
   finished-book tools (fix date / stuck-at-97-99% list), cross-library
   search, book lookup links. All four need zero new server infrastructure.
3. **Deeper read of `book-details.js` (1,051 new lines)** specifically for
   the "redesigned book page" claim — not yet done at line level this pass,
   flagged above as the one area where I'm summarizing from the changelog
   rather than a full source read.
4. **Deeper read of the multi-level sort / stackable filter subsystem** in
   `enhancements.js` if that's a priority — it's one of the largest pieces
   of new code in 2.0 and deserves its own pass rather than the changelog
   summary above.
