# NanoHive 2.0.6 Not-Portable Features — Companion Service Architecture Plan

R&D only. Nothing here is implemented — this is the answer to "how would we
make these work" for every NH 2.0.6 feature that needs a backend we don't
have, now that both deep-dives (book page, sort/filter) confirmed the exact
endpoint surface required.

---

## 1. What actually needs a companion service — the full endpoint list

Every one of these is confirmed via source (either this doc's own earlier
grep pass, or the two deep-dive reports) to depend on NH's own
nginx+njs proxy — none exist in stock ABS's API.

| Feature | Endpoint(s) | Storage shape (per NH's own source) |
|---|---|---|
| Community ratings + reviews | `GET/POST /_nh/api/ratings`, `POST /_nh/api/ratings-admin` | per-item, per-user: `{stars, reviewText}` |
| Report a problem + admin queue | `POST /_nh/api/reports`, admin resolve via `/_nh/api/reports-admin` | per-report: `{itemId, title, reason, note, resolved}` |
| Started-date override (book page) | `GET/POST /_nh/api/dates` | `/data/nh/dates.json`: `{users: {userId: {itemId: {startedAt}}}}` |
| Server Ranking / shared listening stats | `GET/POST/DELETE /_nh/api/stats`, admin view `/_nh/api/stats-admin` | per-user periodic summary push of their own `/api/me/listening-stats` |
| Custom series covers/descriptions | `/_nh/series-covers/*`, `/_nh/series-desc/*`, `/_nh/api/series-meta` | file storage (image/text files) + a metadata JSON |
| User profile photos | `/_nh/user-avatars/*`, `/_nh/api/avatar-admin` | file storage (image files) |
| Collection icon-emblems | `/_nh/collection-art.json` → `/data/nh/collection-art.json` | single JSON: `{collectionId: iconName}` |
| Admin "save as server default" | (implied, `server-config.json` referenced in `enhancements.js` comments) | JSON: shared default settings shadow |
| Admin "force-disable features" | same server-config mechanism | JSON: per-feature boolean flags |
| Auth verification | `auth_request /_nh/api/whoami`, `/_nh/admincheck` | not storage — replays the client's Bearer token against ABS's own `/api/me` server-side to verify identity/role before allowing a write |

**The common pattern across all of them:** every write is gated by
replaying the caller's existing ABS auth token against ABS's own `/api/me`
endpoint to confirm who they are and whether they're an admin, THEN
read/write a small JSON or file store keyed by user id / item id /
collection id. None of this requires touching ABS's own database — it's a
sidecar store that trusts ABS for identity only.

---

## 2. Architecture options

### Option A — Mirror NH's own approach: nginx + njs + flat files

Run an nginx instance (or reuse Caddy/Traefik with a scripting layer) in
front of, or alongside, each user's ABS server, with njs (or a small Lua/
JS handler) doing exactly what `nh-ratings.js` does: verify the Bearer
token against `/api/me`, then read/write flat JSON files (`ratings.json`,
`reports.json`, `dates.json`, etc.) on a persistent volume.

**Pros:** proven pattern (literally NH's own architecture, already battle-
tested by its userbase), no new language/runtime to introduce, works
identically regardless of what ABS server version someone's running,
zero database to operate.

**Cons:** this app is a *client* — we don't control what's running on the
user's server. Unlike NH (a reverse proxy the server owner deliberately
puts in front of ABS), our app would need every user who wants these
features to ALSO deploy and maintain a companion proxy in front of their
own ABS instance — real operational burden shifted onto every user, not
something we can ship "in the app." This only works if we're willing to
treat "deploy the companion service" as a per-user setup step, similar to
how CF-ZeroTrust/custom-headers already require server-side configuration
this app doesn't control end-to-end.

### Option B — A small standalone API service (Node/Express or similar), not a reverse proxy

Instead of sitting *in front of* ABS (proxying every request), run a
lightweight, separate API service — just the `/nh-companion/*` surface —
that the app talks to directly (a second server URL in its connection
config, alongside the existing ABS server URL), using the ABS auth token
the app already holds to authenticate against this service too (the
service verifies it the same way NH does: call the user's real ABS
`/api/me` with that token to confirm identity/role, then serve/store data).

**Pros:** doesn't require modifying anything about how the user's ABS
server or existing reverse-proxy setup works — purely additive. Could be
packaged as a single small Docker container (SQLite or flat JSON file
storage, no separate DB server needed for the data volumes involved here).
Fits this app's existing pattern of "another endpoint the connection form
knows about" — the app already stores `serverConnectionConfig` with
`customHeaders`/CF settings (`store/user.js:8,181,251`), so a second,
optional "companion service URL" field is architecturally consistent with
what's already there, not a new paradigm.

**Cons:** still something every user who wants these features has to
stand up and maintain themselves (same operational burden as Option A,
just a different shape of service) — this app still can't ship the feature
"for everyone" without a server-side component existing. New codebase to
build and maintain (even if small).

### Option C — Extend ABS itself (if self-hosting a patched ABS build is viable)

Since ABS itself is open source, features like ratings/reports/started-date
could theoretically be implemented as real additions to a patched ABS
server (a fork of `advplyr/audiobookshelf`, not just this app), stored in
ABS's own database alongside real progress/library data.

**Pros:** no separate service to run at all — one server, one deploy,
matches how the base app already expects to talk to ABS. No auth-relay
trick needed since it'd be first-party ABS functionality.

**Cons:** biggest maintenance burden by far — means tracking and patching
ABS server releases indefinitely, on top of everything already being
tracked for this app's own upstream (`advplyr/audiobookshelf-app`, see
this project's `CUSTOM_HEADERS_DESIGN_DOC.md`). Users would need to run a
patched ABS server, not stock — a much bigger ask than "add an optional
companion container." Not recommended unless there's separately a strong
reason to be running a patched ABS server anyway.

### Option D — Don't build a backend; scope features down to what's client-only-viable

For each not-portable feature, ask whether a reduced, backend-free version
still delivers real value:

- **Ratings:** drop the "shared across all users" requirement, keep a
  **private, per-device rating** stored in this app's own local settings
  (`localStore`/Vuex, same mechanism as everything else this app already
  persists locally) — loses the social/aggregate angle entirely, but needs
  zero backend and could ship immediately.
- **Report a problem:** replace "store server-side, admin sees a queue"
  with a **mailto: link or a pre-filled support-contact flow** — the user's
  device composes an email/message to whoever they've configured as
  "admin contact" (a new simple text setting), no storage needed at all.
- **Started-date override:** simplest of all — just **display ABS's own
  `startedAt` read-only**, drop editing entirely. Confirmed in the
  deep-dive that ABS silently ignores attempts to edit this anyway, so
  NH's own workaround exists purely because ABS doesn't support the write
  — dropping edit capability isn't a regression from "what ABS lets you
  do," it's matching it.
  - This one specifically: not a placeholder, all sub-tasks are complete.
- **Collection icon-emblems, custom series covers, profile photos:** all
  three are **file uploads with an app-hosted display layer** — without a
  backend, these just aren't buildable in any reduced form (there's no
  client-only equivalent of "upload a photo and show it to other users").
  Same for Server Ranking (inherently a multi-user feature, no
  single-device reduction makes sense) and admin server-defaults.

---

## 3. Recommendation

**Split by feature, don't pick one architecture for everything:**

1. **Started-date:** ship display-only immediately (Option D) — zero cost, zero backend, closes this gap completely as far as ABS itself allows.
2. **Ratings:** ship a **private per-device rating** now (Option D) as a stopgap real feature; if there's later appetite for the full shared/social version, that's when Option B (a small standalone companion API) becomes worth building — it's the lowest-operational-burden path since it doesn't require touching anyone's existing ABS/reverse-proxy setup, and slots into the connection-config pattern this app already has.
3. **Report a problem:** ship the mailto/support-contact stub (Option D) — genuinely solves the underlying need ("tell someone about a bad file") without any backend at all.
4. **Everything else** (Server Ranking, custom series covers, profile photos, admin server-defaults, force-disable-features): these are inherently multi-user/admin features with no meaningful client-only reduction. If ever prioritized, Option B (standalone companion service) is the right shape — same reasoning as ratings: additive, doesn't require modifying the user's existing ABS deployment, fits the existing connection-config pattern. Option A (mirror NH's reverse-proxy approach) only makes sense if we specifically want feature-parity with running NH itself rather than building our own equivalent — probably not worth it since we'd be maintaining a second theme-injection layer alongside our own native port. Option C (patch ABS itself) is not recommended given the maintenance burden already carried for two upstreams.

**Net effect if this plan is followed:** most of the "not portable" list
actually gets *something* shipped without ever building a server — only
the genuinely multi-user pieces (ranking, shared photos/covers, admin
tooling) stay blocked on a real backend decision, and that decision can
wait until there's clear demand, since nothing else here depends on it.

---

## 4. If Option B is ever built — rough shape

Not designing this now (explicitly out of scope per "R&D only"), but for
future reference: a single small service exposing roughly the same
surface NH's proxy does (ratings, reports, stats, series-meta, avatars),
authenticating every request the same way NH does (replay the caller's
existing ABS bearer token against their own ABS server's `/api/me` to
confirm identity + admin role), storing data in SQLite or flat JSON files
per the volumes NH itself uses (`/data/nh/*.json` pattern), and configured
in this app the same way the existing server connection is — as an
additional, optional field alongside the current server URL and custom
headers in `serverConnectionConfig`.
