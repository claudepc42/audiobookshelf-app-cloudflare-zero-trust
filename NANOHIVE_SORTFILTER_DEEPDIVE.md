# NanoHive 2.0.6 Sort/Filter Subsystem — Deep-Dive (R&D only, no code written yet)

Subsystem: "Library Rating Sort & Filter (A8 v2)," `theme/enhancements.js`
roughly lines 5878-6580 (~700 lines), plus supporting pieces: shared ratings
cache (4694-4744), auth-token helper (3834-3842), reactive scheduler
(11656-11764), CSS in `theme/core.js` ~339-446 and 1233-1994. All line
numbers below are `enhancements.js` unless noted.

---

## 1. Where the UI lives

Genuinely injects **into ABS's own native Filter and Sort dropdowns**, not a
separate control surface.

- `nhLfDropdowns(toolbar)` (6005-6008): grabs toolbar's two `button[aria-haspopup="menu"]` — `[0]`=filter, `[1]`=sort, by DOM order.
- `nhLfInjectMenus(toolbar, T)` (6115-6245): core injector, called every reactive tick from `nhLibFilter()` (6327). Walks up to outer wrapper `.w-36` holding both button and Vue's own `<ul>`.
- Distinguishes native value-listbox submenu (e.g. ABS's genre list) from the main filter list by checking if the first `<li>`'s icon is `arrow_left` (`isNatSub`, 6141-6144) — native submenus tagged `.nh-lf-natsub`, never injected into.
- Sort menu found via `ul.librarySortMenu` (native class), fallback for series page (plain listbox, 6152).
- Rows built with `nhLfMenuItem()` (6075-6110): **clones native `<li>`/`<span>` classes and `data-v-*` scoped-style attributes** from a real non-selected native row, so injected rows are pixel-identical to native Vue rows.
- Injected sections: "More filters" header (6205) + 4 quick rating filters (`NH_LF_FILTERS`, 5893) + 6 stackable-dimension rows with `›` chevron opening a value submenu (6216-6222); "Multi-sort" header (6227) + up to 8 sort-dimension rows (6229-6242).
- Funnel SVG in filter button, sort-arrows SVG in sort button (`NH_LF_ICONS`, 6255-6258; `nhLfButtonLabels`, 6259-6307).
- Button label composed on top of Vue's own label: native `<span class="truncate">` hidden, sibling `.nh-lf-lbl` shows combined text, rebuilt each tick from still-live native text — specifically to avoid detaching Vue's text node from the vdom (6247-6251).
- Count "chip" + "✕" clear button injected as siblings left of the filter dropdown, not inside any menu (`hostEl`, 6373-6378; pill 6411-6419; clear button 6383-6407).
- Empty-state panel (`#nh-lf-none`, 6548-6580) replaces shelf body when a filter matches nothing.

**For a native port:** design equivalent Vue components
(`SortMenu.vue`/`FilterMenu.vue` or a shared `LibraryToolbar.vue`) with the
same three regions — quick filters, stackable dimension list with per-value
submenu, multi-level sort list — rather than DOM cloning, since we control
our own Vue templates directly.

---

## 2. Data model — sort spec, filter selection, persistence

Single in-memory plain object (NOT Vuex in NH — just a module-level object
mutated directly), declared at 5892:

```js
const nhLf = {
  mode: 'items',       // 'items' | 'series' — page context
  sort: '',             // derived STRING signature, kept for back-compat truthiness
  sorts: [],             // ORDERED array of levels: [{d: 'author', dir: 1}, {d: 'series', dir: -1}, ...]
  filter: '',            // single quick rating filter: '' | 'rated' | 'unrated' | 'min4' | 'min3'
  filters: {},            // stackable dims: { genre: ['Fantasy','Mystery'], author: ['Tolkien'], ... }
  sub: null,               // which filter dimension's value-submenu is open (or null)
  libId: null, items: null, itemsKey: '', fetching: false,
  view: null, viewSig: '', needReset: false,
  libTotal: null, libTotalKey: '', libTotalFetching: false,
}
```

**Multi-level sort:** `nhLf.sorts` is an array in pick order — array order
IS precedence, no separate priority number stored. Each element
`{d: <dimension>, dir: 1|-1}`. `nhLfSyncSortSig()` (5897-5899) derives
display string, e.g. `"author+,series+,title+"`.

**Stackable filter:** `nhLf.filters` is a plain object, dimension name →
array of selected values, e.g. `{genre: ['Fantasy'], language: ['English','Polish']}`.
`nhLfFxSig()` (5900-5903) derives a canonical signature (sorted keys, sorted
values) for cache invalidation. `nhLfFxCount()` (5904-5906) sums selected
values for the "+N" badge.

**Persistence: pure client-side, in-memory only.** No `localStorage` writes
anywhere in this subsystem (grepped, zero hits), no `/_nh/` endpoint for
saving selections. Resets on every library/mode change via `nhLfReset()`
(5977-5996, called from `nhLibFilter()` at 6320) — does NOT survive a page
reload or navigating away and back. (Contrast with ratings themselves,
which do persist via `/_nh/api/ratings` — a different feature reusing the
same shared cache.)

**Implication for our port:** nothing in NH's data model assumes
ephemerality — we can freely persist the equivalent Vuex state to
localStorage for better UX if we want; NH's session-only behavior looks
like path-of-least-resistance for a DOM-overlay theme, not a deliberate
constraint.

---

## 3. Computation — client vs. server

**Hybrid.** ABS's own native filter/sort still applies server-side (query
params); NH's rating-filter + stacked-dimension-filter + multi-level-sort
are computed **entirely client-side** over a full, unpaginated fetch.

- `nhLfNative()` (6015-6022): reads current native filter/sort from `window.$nuxt.$store.state.user.settings` (`filterBy`/`orderBy`/`orderDesc`, or series-page variants).
- `nhLfEnsureItems(libId)` (6043-6068): fetches the ENTIRE native-filtered/sorted list in one request:
  ```
  /api/libraries/{libId}/items?limit=0&filter={fb}&sort={ob}&desc={0|1}
  ```
  (`limit=0` = unlimited for items; series endpoint needs a large numeric cap since `limit=0` returns zero rows there, per comment at 6055). Cached in `nhLf.items`, keyed by `mode|libId|filterBy|orderBy|orderDesc` (`itemsKey`, 6045-6050) — refetched only when native filter/sort changes. Also fetches `.../items?limit=1` (6034) just for the unfiltered library total.
- Composition in `nhLibFilter()` (6431-6511), gated by `viewSig` cache key (`itemsKey|sort|filter|fxSig|ratingsCacheTimestamp`, 6438):
  1. Build `{e: item, t: title, avg, n}` per item (6443-6454), pulling ratings from shared `nhRs` cache.
  2. Apply stacked dimension filters client-side (AND across dims, OR within a dim's values) — 6457-6471.
  3. Apply single quick rating filter — 6472-6475.
  4. Apply multi-level sort via one `Array.sort` comparator — 6480-6507.
  5. Result → `nhLf.view` (array of raw items).
- **Delivery back into the shelf**: NH monkey-patches the bookshelf Vue component's `fetchEntites` method (6519-6536) — swaps `this.$axios.$get` for one call so the native shelf's paginator gets served a slice of `nhLf.view` instead of hitting the network. This is a DOM-overlay-specific trick we won't need — our port binds our own list directly to our own card component instead.
- `vm.resetEntities()` called whenever `nhLf.needReset` is set (6537-6540).

**Design implication for our native app:** ABS's items endpoint supports
real pagination, but NH deliberately bypasses server-side pagination for
the composed view (fetch everything with `limit=0`, sort/filter in JS, fake
pagination client-side). For our Vuex port: fetch the full (native-filtered)
item list into memory once per library/native-filter-change, then do
multi-level-sort/stack-filter/pagination as pure client-side array ops —
mirrors NH's approach and avoids needing new backend endpoints. Watch
memory/CPU on very large libraries (§6).

---

## 4. The 8 sort dimensions + precedence UI

`NH_LF_SORT_DIMS` (5894): `['author', 'series', 'title', 'year', 'added', 'duration', 'narrator', 'rating']`
— exactly 8. Series-mode page only offers `['rating']` (6228, series lack per-book author/title/etc).

**Interaction pattern** (6224-6243):
- All 8 dimensions always visible as rows (not picked from a separate list).
- Click cycles: off → ascending → descending → off (`!lvl → push{dir:def}`, `lvl.dir===def → flip to -def`, `else → splice out`, 6236-6238).
- Default `dir`: `-1` (descending, best-first) for `rating`; `+1` (ascending, A→Z) for everything else (6234).
- **Precedence = array position** — no separate numeric field; `idx = nhLf.sorts.findIndex(...)`, `idx+1` computed only for the display badge (`"1↑"`, `"2↓"`, 6230-6232). Toggling a dimension off (`splice`) implicitly shifts later dimensions' precedence — no explicit renumbering needed.
- Clicking does NOT close the menu (`touch()` only clears `viewSig`, 6171) — deliberately, so several levels can be stacked in one interaction.
- Button label: `sorts.map(s => label(s.d) + (dir<0?' ↓':' ↑')).join(' · ')`, e.g. `"Author ↑ · Series ↑"` (6303-6306).
- Comparator (6495-6507): iterates `nhLf.sorts` in order; each level's `one(a,b,dim)` does dimension-specific comparison (locale-aware `.localeCompare` for text, numeric for year/added/duration/rating), multiplied by `dir`, short-circuits on first non-zero result. Full tie → fallback title A→Z (6505).
- `series` is a **composite key**: `nhLfSeriesKey(md)` (5916-5925) parses `seriesName` (`"Name #2"` format, first of comma-separated multi-series wins) into `{group: lowercased name (or title if standalone), seq: parsed sequence or Infinity}`. Comparator compares group, then sequence, then title fallback — standalone books interleave alphabetically where their would-be series name would sort ("Plex-style," comment 6477-6479).
- Sort keys precomputed once per item into `x.k = {author, seriesG, seriesQ, title, year, added, duration, narrator, rating}` (6481-6494) before sorting — avoids repeated field extraction during comparisons.

**For our Vue port:** model as `sortLevels: Array<{dim: string, dir: 1|-1}>`;
same three-state click cycle; precedence badges from
`array.indexOf(level)+1`; replicate the composite series-key comparator for
series-aware sort parity if wanted.

---

## 5. Per-value filter counts

**Purely client-side aggregation over `nhLf.items`** (the already-fetched,
native-filter-scoped array) — no backend precomputation, no counts
endpoint. `nhLfValues(dim, T)` (5938-5958):

```js
function nhLfValues(dim, T) {
  const cnt = new Map()
  const add = (v) => { if (v) cnt.set(v, (cnt.get(v) || 0) + 1) }
  const pg = dim === 'progress' ? nhLfProgressMap() : null
  (nhLf.items || []).forEach((li) => {
    const md = nhLfMeta(li)
    if (dim === 'genre') (md.genres || []).forEach(add)
    else if (dim === 'author') String(md.authorName || '').split(', ').forEach(add)
    else if (dim === 'narrator') String(md.narratorName || '').split(', ').forEach(add)
    else if (dim === 'language') add(md.language)
    else if (dim === 'decade') { const y = parseInt(md.publishedYear, 10); if (y) add(Math.floor(y/10)*10 + 's') }
    else if (dim === 'progress') add(nhLfProgressOf(pg, li.id))
  })
  let vals = [...cnt.entries()].map(([v,n]) => ({v, n}))
  return vals.slice(0, 60) // capped
}
```

Key details:
- Counts run over `nhLf.items` (native-filter scope), **not further narrowed
  by other currently-active stack filters** — selecting Genre=Fantasy does
  NOT change Author's displayed counts afterward. A real design choice, not
  a bug — worth deciding whether to replicate or improve (live
  cross-filtering counts would mean recomputing against the filtered
  subset instead of raw `nhLf.items`).
- Author/narrator are comma-split multi-value fields — a book with two authors increments both.
- Progress bucket via `nhLfProgressMap()` (5927-5936), built once per call from `mediaProgress`, mapping `libraryItemId → 'finished'|'progress'|'none'`.
- Decade: `Math.floor(year/10)*10 + 's'`.
- **Capped at 60 distinct values** (5957) — a hard DOM-size cutoff, not "top N by relevance." A library with >60 distinct genres only shows the top 60 by count.
- Recomputed on every tick while a submenu is open (`nhLf.sub === dim`, 6189) — no separate memoization of `nhLfValues` itself; acceptable since item counts are typically thousands, not millions.

**For our port:** plan a Vuex getter aggregating counts from the currently-
loaded (native-filter-scoped) item array per dimension, computed on demand
when a filter panel opens. Decide explicitly: counts reflect only native
filter scope (matches NH) vs. currently-stacked-filter-narrowed scope
(arguably better UX, NH just didn't bother) — worth doing better here since
this a real product decision, not a technical constraint we inherit.

---

## 6. Performance considerations for our reimplementation

- **Full-library single fetch, no server pagination for the composed view**
  — the single biggest cost for large libraries (network payload + JS
  sort/filter passes). Options for us: paginated background loading with
  progressive availability, a size warning/cap, or — since we control our
  OWN backend surface unlike NH's passive proxy — extending the server-side
  query API instead of full materialization. This constraint is specific to
  NH being a reverse-proxy with no control over ABS's query engine; we
  aren't bound by it the same way.
- **Signature-string caching** rather than object diffing: `itemsKey`
  (native-filter cache key), `viewSig` (composed-view key, folds in the
  ratings-cache timestamp so rating-driven views only recompute when
  ratings actually changed), `nhLfFxSig()`/`nhLfSyncSortSig()`. Cheap-string
  compare-and-bail avoids recompute on every reactive tick (~every 80ms,
  see below).
- **Sort key precomputation** once per item before `Array.sort` runs —
  meaningful since a comparator runs O(n log n) times.
- **Reactive scheduler**: coalesces DOM-mutation-triggered reruns of the
  whole enhancement suite (including `nhLibFilter`) to at most one pass per
  animation frame, with an 80ms floor between ticks (11742-11764), plus a
  500ms heartbeat fallback for non-DOM state changes. Not sort/filter-
  specific, but explains why `nhLibFilter()` doesn't run on every
  keystroke/click directly.
- **Narrator search box debounce**: 150ms (`nhNr.qTimer`, 6681-6684) — a
  directly analogous pattern we'd want for any text-filter input, though
  A8 itself has no text-search box.
- **Relayout debounce**: 60ms `setTimeout` (6354) coalesces the shelf
  grid's card-size recompute after a filter/sort signature change, masked
  behind a shelf overlay so the rebuild isn't visually visible mid-thrash.
- **Value-list capped at 60 rows**, submenu scroll container capped at
  360px with `overflow-y:auto` — bounds DOM size for high-cardinality
  dimensions (author/genre lists on big libraries can have hundreds of
  distinct values). We should cap or virtualize similarly.
- **No explicit item-grid virtualization** in this subsystem — NH relies on
  ABS's own native shelf's pagination (`booksPerFetch`, typically 36/page)
  and only fakes the paginated fetch responses. Our reimplementation needs
  its own virtualized/paginated list rendering for the final result set —
  holding thousands of rendered cards simultaneously is the real risk, not
  the sort/filter computation itself (comfortably fast in JS for typical
  library sizes).
- **Ratings cache**: single `/_nh/api/ratings` fetch feeds card badges +
  A8 filter/sort + series header, 60s staleness window, max-5-tries
  backoff, `dead` flag on 404/405 to stop retrying an absent backend. This
  specific mechanism is NH-proxy-only, but the pattern (one shared cache,
  staleness-gated background refresh, instant local patch via an event on
  save) is worth replicating for a Vuex ratings module IF we ever build our
  own ratings backend.

---

## File/line index

| Concern | Location |
|---|---|
| State object `nhLf` | enhancements.js:5892 |
| Sort dims (8) | enhancements.js:5894 (`NH_LF_SORT_DIMS`) |
| Filter dims (6 stackable) | enhancements.js:5895 (`NH_LF_FILTER_DIMS`) |
| Quick rating filters (4) | enhancements.js:5893 (`NH_LF_FILTERS`) |
| Sort signature derivation | enhancements.js:5897-5899 |
| Filter signature derivation | enhancements.js:5900-5903 |
| Per-value counts | enhancements.js:5938-5958 |
| Native filter/sort read | enhancements.js:6015-6022 |
| Full item-list fetch | enhancements.js:6043-6068 |
| Menu DOM injection | enhancements.js:6115-6245 |
| Sort-row click cycling | enhancements.js:6229-6242 |
| Filter-row/value click | enhancements.js:6172-6223 |
| Button label composition | enhancements.js:6259-6307 |
| Main orchestrator | enhancements.js:6309-6542 (`nhLibFilter`) |
| Filter/sort/rank computation | enhancements.js:6443-6507 |
| Series composite sort key | enhancements.js:5916-5925 |
| Native-shelf fetch patch | enhancements.js:6519-6536 |
| Empty-state panel | enhancements.js:6548-6580 |
| Shared ratings cache | enhancements.js:4694-4744 |
| Auth token helper | enhancements.js:3834-3842 |
| Reactive scheduler | enhancements.js:11742-11764 |
| CSS for injected menu/pill | core.js:1233-1244, 339-446, 1990-1994 |

---

## Bottom line for building this in our native app

Fully portable — zero backend dependency, confirmed no `/_nh/` calls
anywhere in this subsystem. This is real UI/state-management scope (roughly
matching NH's own ~700-line subsystem, likely more given we'd build proper
Vue components instead of DOM injection), not a quick add. Recommended
approach if we build it: a dedicated Vuex module (`libraryFilter`) holding
`sortLevels`/`filters` exactly as modeled in §2, a full-list fetch+cache
per §3, a `LibraryToolbar.vue` (or split `SortMenu.vue`/`FilterMenu.vue`)
component per §1, and our own virtualized result list rather than NH's
shelf-patching trick — we don't need it since we own the rendering.
