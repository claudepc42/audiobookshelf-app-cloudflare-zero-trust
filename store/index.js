import { Network } from '@capacitor/network'
import { AbsDatabase } from '@/plugins/capacitor'
import { AbsAudioPlayer } from '@/plugins/capacitor'
import { PlayMethod } from '@/plugins/constants'

// NanoHive customization settings — ported from nanohive-abs-theme/theme/enhancements.js
// defaultSettings (lines 27-53). Fields with no destination in this mobile app
// (appName/showLogoText — no app-name text element in Appbar) are intentionally
// left out rather than added as no-op controls. hideRailNarrators used to be in
// that excluded list too (no Narrators page existed) — added for real once the
// Narrator card page was built (pages/bookshelf/narrators.vue).
export const NH_SETTINGS_DEFAULTS = {
  accentColor: '#e0c27a',
  baseTheme: 'warm',
  mainFont: 'Merriweather',
  fontScale: 1.0,
  // Extra multiplier applied on top of fontScale, for the hamburger drawer's
  // nav-item text only — lets it be tuned independently since it's often
  // the tightest-fitting text in the app (long labels in a narrow drawer).
  drawerFontScale: 1.0,
  // Output of the NH UI Glass Effect Tuner (hamburger menu). nhGlassEffect is
  // whichever snapshot (a slot, most recently) is currently active — restored
  // on next launch. nhGlassEffectSlots holds up to 3 independently named
  // snapshots so a user can A/B between saved looks by tapping between them.
  // Both null/empty means nothing's been saved yet — DevPanel.vue's own
  // hardcoded CONTROLS/panelState defaults apply instead. Snapshot shape:
  // { cssVars: { '--nh-cine-blur': 12, ... }, panel: { bgOpacity, scrimOpacity, blur } }.
  // Tuner adjustments preview live via direct CSS var writes regardless of
  // these settings; they only decide what survives an app restart.
  nhGlassEffect: null,
  nhGlassEffectSlots: { slot1: null, slot2: null, slot3: null },
  carouselTiming: 15,
  logoUrl: '',
  colorizeLogo: false,
  customSeriesCards: true,
  showHeroCarousel: true,
  continueReadingMode: 'combine', // 'combine' | 'separate' | 'hidden'
  hideRailSeries: false,
  hideRailCollections: false,
  hideRailAuthors: false,
  hideRailNarrators: false,
  hideRailStats: false,
  hideHomeRecentlyAdded: false,
  hideHomeContinueSeries: false,
  hideHomeListenAgain: false,
  hideHomeDiscover: false,
  hideHomeNewAuthors: false,
  hideHomeRecentSeries: false,
  showCustomRecentSeries: true,
  recentSeriesCount: 12,
  // NH source uses a muted gray (--nh-muted-2) for the home greeting label
  // ("FRIDAY - GOOD EVENING"); default true keeps it on the accent color
  // instead, matching the app's existing look before this toggle was added.
  greetingUsesAccent: true,
  // Finished-book checkmark badge (shelf cards + item page). Off by default —
  // NH's real badge color is fixed regardless of accent, kept that way here so
  // a finished book stays instantly identifiable no matter the accent color;
  // this toggle lets users opt into tying it to their accent color instead.
  finishedBadgeUsesAccent: false,
  // NH source: enhancements.js autoplaySeries (line 66). Off by default —
  // it decides what your speakers do next, so opt-in only.
  autoplaySeries: false,
  // NH source: enhancements.js finishedTools (line 67, "recently finished" +
  // "almost done" cards in your stats), same default true, its own panel
  // toggle — a correct 1:1 port, not novel work as an earlier version of
  // this comment claimed.
  showFinishedBookTools: true,
  // NH's cross-library search (2.0's "search every library at once") has no
  // corresponding NH setting either — added here since our default search
  // scope (current library only) predates this feature.
  crossLibrarySearch: true,
  // NH source: enhancements.js homeOrder (line 68) — empty array = default
  // (unmodified) order. Array of home-section keys in display order.
  homeOrder: [],
  // NH source: nhBookSitesSelected() (enhancements.js:3160-3164) — null/undefined
  // means "not customized yet", resolved to nhBookSitesDefault()'s language-based
  // pick at render time (see NH_BOOK_SITES). An explicit [] is a valid choice
  // (show none), same distinction NH's own source makes.
  bookSites: null,
  // NH source: nhSettings.familyStats (enhancements.js:9557, A5 opt-in shared
  // listening summaries). Off by default — opting in posts a rounded summary of
  // your own /api/me/listening-stats to the NH backend every ~6h so non-admins
  // can see a shared ranking without anyone handing out admin rights.
  familyStats: false,
  // NH source: defaultSettings.showRatings/showCardRatings (enhancements.js:69-70),
  // starStep (drives nhStarStep()), ratingLibs (per-library override, enhancements.js:74).
  // Community ratings talk to a NanoHive server's own /_nh/api/ratings — present only
  // if the configured ABS server also runs behind NH's reverse proxy. Absent entirely
  // on a stock ABS server: every ratings call fails (404/network error) and the whole
  // feature hides itself, same graceful-degrade behavior as NH's own client.
  showRatings: true,
  showCardRatings: true,
  starStep: 0.5,
  ratingLibs: {},
  // NH source: nhRfHome() gate (enhancements.js:10774-10780) — "Rate what you
  // finished" home shelf. Own toggle, default on like NH's; also requires
  // ratings to be on for the current library (see nhRatingsLibOn below).
  showRateFinished: true,
  // NH source: manageCinematic() cinematicBg off-switch (enhancements.js:3004).
  // Full kill-switch for the cinematic blurred-cover background (layouts/default.vue's
  // nhCinematicMode/#nh-home-bg) — does not affect the separate always-on ambient
  // gradient wash (#nh-ambient-bg), which NH's own source doesn't gate on this setting.
  cinematicBg: true
}

// NH source: enhancements.js baseThemes (lines 67-80)
// NH UI Glass Effect Tuner (components/nh/DevPanel.vue) controls, plus the
// unit each CSS var needs when written directly (e.g. blur values must be
// '<n>px', not a bare number — layouts/default.vue's applyNhCustomizations()
// needs this same metadata to correctly reapply saved values on mount, not
// just DevPanel's own live sliders. Shared here instead of duplicated so
// they can't drift out of sync with each other.
// Appbar/mini-player defaults match NH source exactly (rgba(--nh-bg-rgb, 0.45/0.4)
// blur(28px)) — a 2026-07-25 on-device tuning pass tried heavier values (0.73
// opacity, 48px blur) but that never actually landed as the real default; these
// `default` fields are also what the tuner's "reset" button restores, so they
// have to track assets/nh-theme.css's :root block, not the abandoned experiment.
// Cinematic background blur/brightness/saturate/gradient values below ARE the
// deliberately re-tuned set (blur 12 vs NH's 55, brightness 1.08 vs 0.45,
// saturate 1.9 vs 1.35) — tuned for a phone viewport, kept as-is.
export const NH_GLASS_EFFECT_CONTROLS = [
  { group: 'Cinematic Background', prop: '--nh-cine-blur', label: 'Blur', default: 12, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Cinematic Background', prop: '--nh-cine-brightness', label: 'Brightness', default: 1.08, min: 0, max: 1.5, step: 0.01, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-saturate', label: 'Saturate', default: 1.9, min: 0, max: 3, step: 0.05, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-grad-top', label: 'Gradient Top', default: 0.77, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-grad-mid', label: 'Gradient Mid', default: 0.8, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Cinematic Background', prop: '--nh-cine-grad-bottom', label: 'Gradient Bottom', default: 1, min: 0, max: 1, step: 0.01, unit: '' },
  // Home page's #nh-home-bg cinematic background (above) and the hero
  // carousel's own per-slide blurred cover background (.nh-slide-bg) are
  // separate elements with separate effects — this used to be hardcoded
  // (filter: blur(28px) brightness(0.5) saturate(1.4) in nh-theme.css) with
  // no way to tune it at all.
  { group: 'Carousel Background', prop: '--nh-carousel-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Carousel Background', prop: '--nh-carousel-brightness', label: 'Brightness', default: 0.5, min: 0, max: 1.5, step: 0.01, unit: '' },
  { group: 'Carousel Background', prop: '--nh-carousel-saturate', label: 'Saturate', default: 1.4, min: 0, max: 3, step: 0.05, unit: '' },
  { group: 'Appbar', prop: '--nh-appbar-opacity', label: 'Opacity', default: 0.45, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Appbar', prop: '--nh-appbar-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Drawer', prop: '--nh-drawer-opacity', label: 'Opacity', default: 0, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Drawer', prop: '--nh-drawer-blur', label: 'Blur', default: 13, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Mini Player', prop: '--nh-miniplayer-opacity', label: 'Opacity', default: 0.4, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Mini Player', prop: '--nh-miniplayer-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' }
  // Library-switcher button (--nh-libbtn-opacity/--nh-libbtn-blur, defined in
  // nh-theme.css's :root) deliberately has NO tuner entry here for now — the
  // button doesn't visibly respond to either var yet (confirmed on-device: a
  // full 0-to-1 sweep of both produced no change), root cause not yet found.
  // No point exposing sliders that don't do anything. See NANOHIVE_STATUS.md's
  // "Known, real, still-unfixed gaps" for the full investigation so far. Once
  // that's actually fixed, re-add the two entries here (same shape as the
  // Appbar/Mini Player groups above) to bring the sliders back.
]

export const NH_BASE_THEMES = {
  warm: { name: 'Warm Dark', canvas: '#181512', rail: '#120f0d', raised: '#221e1a', rgb: '24, 21, 18' },
  slate: { name: 'Cool Slate', canvas: '#111625', rail: '#0d111c', raised: '#1a2238', rgb: '17, 22, 37' },
  black: { name: 'True Black', canvas: '#080808', rail: '#050505', raised: '#141414', rgb: '8, 8, 8' },
  navy: { name: 'Deep Navy', canvas: '#0a111a', rail: '#070c12', raised: '#101b29', rgb: '10, 17, 26' },
  mocha: { name: 'Mocha', canvas: '#231c18', rail: '#1c1613', raised: '#2e2520', rgb: '35, 28, 24' },
  pine: { name: 'Deep Pine', canvas: '#121a15', rail: '#0e1410', raised: '#19241d', rgb: '18, 26, 21' },
  plum: { name: 'Plum', canvas: '#1a1320', rail: '#140e19', raised: '#261b2e', rgb: '26, 19, 32' },
  crimson: { name: 'Crimson', canvas: '#1d1212', rail: '#160d0d', raised: '#2b1b1b', rgb: '29, 18, 18' },
  ocean: { name: 'Ocean', canvas: '#0b1618', rail: '#081011', raised: '#122124', rgb: '11, 22, 24' },
  sand: { name: 'Sand', canvas: '#1c1814', rail: '#15120f', raised: '#2a241d', rgb: '28, 24, 20' },
  steel: { name: 'Steel', canvas: '#13171c', rail: '#0e1114', raised: '#1e242b', rgb: '19, 23, 28' },
  wine: { name: 'Wine', canvas: '#1a1014', rail: '#140c0f', raised: '#281820', rgb: '26, 16, 20' }
}

// NH source: enhancements.js GOOGLE_FONTS (line 9)
export const NH_GOOGLE_FONTS = ['Spectral', 'Inter', 'Merriweather', 'Montserrat', 'Playfair Display', 'Oswald', 'Raleway', 'Nunito', 'Ubuntu', 'Lora', 'Work Sans', 'Fira Sans', 'Poppins', 'Cinzel', 'Bitter', 'Quicksand']

// NH source: enhancements.js presetColorsRow1-5 (lines 82-87)
export const NH_PRESET_COLORS = ['#c88d36', '#5b8a62', '#4f728c', '#836589', '#b85b49', '#b5767a', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#f44336', '#e91e63', '#d4b383', '#8c9a83', '#798492', '#9b859d', '#c08779', '#a89f91', '#e0c27a', '#7fa7c4', '#a88bbf', '#d98c7a', '#6fae8e', '#c77fa0', '#ffc107', '#00bcd4', '#673ab7', '#8bc34a', '#ff5722', '#03a9f4']

// NH source: enhancements.js NH_BOOK_SITES (lines 3118-3144). Text/icon pills for
// "find this book elsewhere" on the item detail page — Goodreads plus a per-language
// local book site. Icons are bundled locally (static/booksites/<id>.png), not pulled
// from each site's CDN — same offline-friendly reasoning as NH's own source.
export const NH_BOOK_SITES = [
  { id: 'goodreads', name: 'Goodreads', langs: ['*'], url: 'https://www.goodreads.com/search?q=' },
  { id: 'storygraph', name: 'StoryGraph', langs: ['*'], url: 'https://app.thestorygraph.com/browse?search_term=' },
  { id: 'openlibrary', name: 'Open Library', langs: ['*'], url: 'https://openlibrary.org/search?q=' },
  { id: 'lubimyczytac', name: 'Lubimyczytać', langs: ['pl'], url: 'https://lubimyczytac.pl/szukaj/ksiazki?phrase=' },
  { id: 'lovelybooks', name: 'LovelyBooks', langs: ['de'], url: 'https://www.lovelybooks.de/suche/?searchTerm=' },
  { id: 'babelio', name: 'Babelio', langs: ['fr'], url: 'https://www.babelio.com/resrecherche.php?Recherche=' },
  { id: 'casadellibro', name: 'Casa del Libro', langs: ['es'], url: 'https://www.casadellibro.com/busqueda-generica?busqueda=' },
  { id: 'hebban', name: 'Hebban', langs: ['nl'], url: 'https://www.hebban.nl/zoeken?q=' },
  { id: 'databazeknih', name: 'Databáze knih', langs: ['cs'], url: 'https://www.databazeknih.cz/search?q=' },
  { id: 'moly', name: 'Moly', langs: ['hu'], url: 'https://moly.hu/kereses?q=' },
  { id: 'livelib', name: 'LiveLib', langs: ['ru'], url: 'https://www.livelib.ru/find/' },
  { id: 'bookmeter', name: 'Bookmeter', langs: ['ja'], url: 'https://bookmeter.com/search?keyword=' },
  { id: 'douban', name: 'Douban', langs: ['zh'], url: 'https://search.douban.com/book/subject_search?search_text=' },
  { id: 'kitap1000', name: '1000Kitap', langs: ['tr'], url: 'https://1000kitap.com/arama?q=' },
  { id: 'amazon_com', name: 'Amazon.com', langs: ['en'], url: 'https://www.amazon.com/s?i=stripbooks&k=' },
  { id: 'amazon_uk', name: 'Amazon.co.uk', langs: ['en'], url: 'https://www.amazon.co.uk/s?i=stripbooks&k=' },
  { id: 'amazon_de', name: 'Amazon.de', langs: ['de'], url: 'https://www.amazon.de/s?i=stripbooks&k=' },
  { id: 'amazon_pl', name: 'Amazon.pl', langs: ['pl'], url: 'https://www.amazon.pl/s?i=stripbooks&k=' },
  { id: 'amazon_fr', name: 'Amazon.fr', langs: ['fr'], url: 'https://www.amazon.fr/s?i=stripbooks&k=' },
  { id: 'amazon_es', name: 'Amazon.es', langs: ['es'], url: 'https://www.amazon.es/s?i=stripbooks&k=' },
  { id: 'amazon_it', name: 'Amazon.it', langs: ['it'], url: 'https://www.amazon.it/s?i=stripbooks&k=' },
  { id: 'amazon_nl', name: 'Amazon.nl', langs: ['nl'], url: 'https://www.amazon.nl/s?i=stripbooks&k=' },
  { id: 'amazon_jp', name: 'Amazon.co.jp', langs: ['ja'], url: 'https://www.amazon.co.jp/s?i=stripbooks&k=' },
  { id: 'amazon_br', name: 'Amazon.com.br', langs: ['pt'], url: 'https://www.amazon.com.br/s?i=stripbooks&k=' },
  { id: 'audible', name: 'Audible', langs: ['*'], url: 'https://www.audible.com/search?keywords=' }
]

// Site ids with a bundled logo under static/booksites/<id>.png. Anything not listed
// falls back to a single-letter monogram (NH source: NH_BS_LOGOS, same list).
export const NH_BOOK_SITE_LOGOS = ['amazon_br', 'amazon_com', 'amazon_de', 'amazon_es', 'amazon_fr', 'amazon_it', 'amazon_jp', 'amazon_nl', 'amazon_pl', 'amazon_uk', 'audible', 'babelio', 'bookmeter', 'casadellibro', 'databazeknih', 'douban', 'goodreads', 'hebban', 'kitap1000', 'livelib', 'lovelybooks', 'lubimyczytac', 'moly', 'openlibrary', 'storygraph']

// NH source: nhStarStep/nhStarSnap/nhStarText (enhancements.js:5669-5682), values
// ported exactly. Star precision is a real NH setting (whole/half/quarter stars) —
// the step governs both what a new rating can BE and how any value is drawn.
export function nhStarStep(step) {
  const s = parseFloat(step)
  return s === 1 || s === 0.5 || s === 0.25 ? s : 0.5
}
export function nhStarSnap(v, step) {
  const st = nhStarStep(step)
  return Math.round(Math.max(0, Math.min(5, +v || 0)) / st) * st
}
export function nhStarText(v, step) {
  const s = nhStarSnap(v, step)
  return String(Number(s.toFixed(nhStarStep(step) === 0.25 ? 2 : 1)))
}

// NH source: NH_RT_T (book-details.js:915-918). Only English and Polish exist in
// NH's own source — not a gap on our part, matches their real scope.
export const NH_RATING_STRINGS = {
  en: { ratingWords: ['rating', 'ratings'], reviewWords: ['review', 'reviews'], yourLabel: 'Your rating:', rateHint: 'Click to rate', ph: 'Add a short review (optional)…', save: 'Save', clear: 'Remove', addReview: 'Add a review', editReview: 'Edit review', you: 'you', err: 'Could not save', del: 'remove' },
  pl: { ratingWords: ['ocena', 'oceny', 'ocen'], reviewWords: ['recenzja', 'recenzje', 'recenzji'], yourLabel: 'Twoja ocena:', rateHint: 'Kliknij, aby ocenić', ph: 'Dodaj krótką recenzję (opcjonalnie)…', save: 'Zapisz', clear: 'Usuń', addReview: 'Dodaj recenzję', editReview: 'Edytuj recenzję', you: 'ty', err: 'Nie udało się zapisać', del: 'usuń' }
}
export function nhRatingStrings(lang) {
  const code = (lang || 'en').split('-')[0].toLowerCase()
  return NH_RATING_STRINGS[code] || NH_RATING_STRINGS.en
}

// NH source: narrator page strings (enhancements.js PANEL_T, ~line 713/714).
// PANEL_T itself only defines en/pl — NH_T_EXTRA has many more languages, but
// enhancements.js only Object.assigns NH_T_EXTRA into a language that ALREADY
// exists in PANEL_T (line 756), so every other language in NH_T_EXTRA is dead
// code in NH's own build. en/pl is NH's real live scope here, not a gap.
export const NH_NARRATOR_STRINGS = {
  en: { search: 'Filter narrators…', sortBooks: 'Most books', sortName: 'Name', narratorForms: ['Narrator', 'Narrators'], bookForms: ['book', 'books'] },
  pl: { search: 'Filtruj lektorów…', sortBooks: 'Najwięcej książek', sortName: 'Nazwa', narratorForms: ['Lektor', 'Lektorzy', 'Lektorów'], bookForms: ['książka', 'książki', 'książek'] }
}
export function nhNarratorStrings(lang) {
  const code = (lang || 'en').split('-')[0].toLowerCase()
  return NH_NARRATOR_STRINGS[code] || NH_NARRATOR_STRINGS.en
}

// NH source: "Rate what you finished" home section strings (NH_T_EXTRA rf* keys,
// same en/pl-only real scope as above — see NH_NARRATOR_STRINGS comment).
export const NH_RATE_FINISHED_STRINGS = {
  en: { title: 'Rate what you finished', rate: 'Rate', sheetTitle: 'Rate this book', openBook: 'Open book page', pickHint: 'Pick a rating' },
  pl: { title: 'Oceń przeczytane', rate: 'Oceń', sheetTitle: 'Oceń tę książkę', openBook: 'Otwórz stronę książki', pickHint: 'Wybierz ocenę' }
}
export function nhRateFinishedStrings(lang) {
  const code = (lang || 'en').split('-')[0].toLowerCase()
  return NH_RATE_FINISHED_STRINGS[code] || NH_RATE_FINISHED_STRINGS.en
}

// NH source: nhRatingsLibOn() (enhancements.js:74, ~line 164-168 per-library
// check) — an explicit per-library override wins, else ratings default on
// unless the library is a podcast library.
export function nhRatingsLibOn(ratingLibs, library) {
  const libs = ratingLibs && typeof ratingLibs === 'object' ? ratingLibs : {}
  if (library && Object.prototype.hasOwnProperty.call(libs, library.id)) return libs[library.id] !== false
  return library?.mediaType !== 'podcast'
}

// NH source: pluralization (book-details.js nhRtWord, lines 921-928), Polish
// three-form support ([one, few, many]); English two-form ([one, many]).
export function nhRatingWord(n, forms) {
  if (forms.length === 2) return n === 1 ? forms[0] : forms[1]
  if (n === 1) return forms[0]
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return forms[1]
  return forms[2]
}

// NH source: NH_RP_REASONS + NH_RP_T (book-details.js:737-748) — "report a
// problem" reasons and dialog copy. NH's source has en/pl/de/fr/es; ported all 5.
export const NH_REPORT_REASONS = ['missing', 'quality', 'play', 'wrong', 'chapters', 'other']
export const NH_REPORT_STRINGS = {
  en: { menu: 'Report a problem', title: 'Report a problem', what: 'What is wrong?', note: 'Anything else the admin should know? (optional)', send: 'Send report', sent: 'Sent. Thanks.', fail: 'Could not send', missing: 'Missing or incomplete content', quality: 'Bad audio quality', play: 'Will not play', wrong: 'Wrong book, cover or metadata', chapters: 'Chapters are wrong', other: 'Something else' },
  pl: { menu: 'Zgłoś problem', title: 'Zgłoś problem', what: 'Co jest nie tak?', note: 'Coś jeszcze, co powinien wiedzieć administrator? (opcjonalnie)', send: 'Wyślij zgłoszenie', sent: 'Wysłano. Dzięki.', fail: 'Nie udało się wysłać', missing: 'Brakująca lub niepełna treść', quality: 'Zła jakość dźwięku', play: 'Nie odtwarza się', wrong: 'Zła książka, okładka lub metadane', chapters: 'Błędne rozdziały', other: 'Coś innego' },
  de: { menu: 'Problem melden', title: 'Problem melden', what: 'Was stimmt nicht?', note: 'Sonst noch etwas für die Administration? (optional)', send: 'Meldung senden', sent: 'Gesendet. Danke.', fail: 'Senden fehlgeschlagen', missing: 'Fehlender oder unvollständiger Inhalt', quality: 'Schlechte Tonqualität', play: 'Spielt nicht ab', wrong: 'Falsches Buch, Cover oder Metadaten', chapters: 'Kapitel stimmen nicht', other: 'Etwas anderes' },
  fr: { menu: 'Signaler un problème', title: 'Signaler un problème', what: 'Quel est le problème ?', note: 'Autre chose à signaler ? (facultatif)', send: 'Envoyer', sent: 'Envoyé. Merci.', fail: 'Envoi impossible', missing: 'Contenu manquant ou incomplet', quality: 'Mauvaise qualité audio', play: 'Ne se lit pas', wrong: 'Mauvais livre, couverture ou métadonnées', chapters: 'Chapitres incorrects', other: 'Autre chose' },
  es: { menu: 'Informar de un problema', title: 'Informar de un problema', what: '¿Qué ocurre?', note: '¿Algo más que deba saber el administrador? (opcional)', send: 'Enviar informe', sent: 'Enviado. Gracias.', fail: 'No se pudo enviar', missing: 'Contenido ausente o incompleto', quality: 'Mala calidad de audio', play: 'No se reproduce', wrong: 'Libro, portada o metadatos incorrectos', chapters: 'Capítulos incorrectos', other: 'Otra cosa' }
}
export function nhReportStrings(lang) {
  const code = (lang || 'en').split('-')[0].toLowerCase()
  return NH_REPORT_STRINGS[code] || NH_REPORT_STRINGS.en
}

// NH source: NH_COL_TEMPLATES (enhancements.js:7486-7505), values ported exactly.
// Collection icon/tint auto-matching by name — entirely client-side, no backend
// needed for this part (only an admin-set explicit override needs one, see
// nhColArt below). English keywords only (NH's own per-language kw extensions
// live in NH_COL_TPL_T, not ported — a nice-to-have, not the core feature).
export const NH_COL_TEMPLATES = [
  { name: 'Science Fiction', icon: 'rocket_launch', tint: '#3b5bd9', kw: ['sci-fi', 'science fiction', 'scifi', 'space opera'] },
  { name: 'Fantasy', icon: 'castle', tint: '#7048e8', kw: ['fantasy', 'epic fantasy', 'dragon', 'magic'] },
  { name: 'Mystery & Thriller', icon: 'search', tint: '#d6336c', kw: ['myster', 'thriller', 'detective', 'suspense', 'noir'] },
  { name: 'True Crime', icon: 'local_police', tint: '#a51111', kw: ['true crime', 'crime'] },
  { name: 'Romance', icon: 'favorite', tint: '#e64980', kw: ['romance', 'love story'] },
  { name: 'History', icon: 'account_balance', tint: '#b0855b', kw: ['history', 'histor', 'ancient', 'politic'] },
  { name: 'War & Military', icon: 'military_tech', tint: '#5c6670', kw: ['war', 'military', 'army', 'battle'] },
  { name: 'Science', icon: 'science', tint: '#1098ad', kw: ['science', 'physics', 'biology', 'cosmos', 'nature'] },
  { name: 'Technology & AI', icon: 'smart_toy', tint: '#4263eb', kw: ['technolog', 'artificial intelligence', 'machine learning', 'computer', 'digital', 'robot'] },
  { name: 'Psychology & Self-Help', icon: 'psychology', tint: '#7950f2', kw: ['psycholog', 'self-help', 'self help', 'mindful', 'habit'] },
  { name: 'Health & Medicine', icon: 'medical_services', tint: '#2f9e44', kw: ['health', 'medic', 'fitness', 'wellness', 'nutrition'] },
  { name: 'Business & Money', icon: 'trending_up', tint: '#e8850c', kw: ['business', 'money', 'finance', 'econom', 'startup', 'invest', 'leadership'] },
  { name: 'Biography & Memoir', icon: 'person', tint: '#9c6b3f', kw: ['biograph', 'memoir', 'lives', 'autobiograph'] },
  { name: 'Poetry', icon: 'format_quote', tint: '#ae3ec9', kw: ['poet', 'poem', 'verse'] },
  { name: 'Philosophy & Religion', icon: 'self_improvement', tint: '#5f3dc4', kw: ['philosoph', 'religion', 'spiritual', 'faith', 'theolog'] },
  { name: 'Food & Cooking', icon: 'restaurant', tint: '#e8590c', kw: ['food', 'cook', 'recipe', 'culinary', 'kitchen'] },
  { name: 'Travel & Adventure', icon: 'travel_explore', tint: '#0ca678', kw: ['travel', 'adventure', 'journey', 'explor', 'outdoor'] },
  { name: 'Young Adult', icon: 'auto_stories', tint: '#f06595', kw: ['young adult', 'teen', 'coming of age'] },
  { name: 'Classics & Literature', icon: 'menu_book', tint: '#846358', kw: ['classic', 'literature', 'literary'] },
  { name: "Children's", icon: 'child_care', tint: '#f59f00', kw: ['children', 'kids', 'picture book', 'bedtime'] }
]

// NH source: nhColNorm/nhColMatch (enhancements.js:7655-7683), logic ported exactly
// (word-start-prefix match for 4+ char keywords, whole-word match for shorter ones —
// avoids "war" false-matching "Award Winners").
function nhColNorm(s) {
  return ' ' + String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '
}
export function nhColMatch(name) {
  const n = nhColNorm(name)
  for (const t of NH_COL_TEMPLATES) {
    const matched = t.kw.some((k) => {
      const kn = nhColNorm(k)
      const body = kn.slice(1, -1)
      return body.length < 4 ? n.indexOf(kn) !== -1 : n.indexOf(' ' + body) !== -1
    })
    if (matched) return { icon: t.icon, tint: t.tint }
  }
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) & 0x7fffffff
  const pal = ['#5c5048', '#4a5568', '#5b4a63', '#4a5b52', '#63564a', '#455a64']
  return { icon: 'library_books', tint: pal[h % pal.length] }
}
function nhHexA(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''))
  if (!m) return `rgba(224,194,122,${a})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}
// NH source: nhColEmblemBg (enhancements.js:7698-7702), values ported exactly.
export function nhColEmblemBg(tint) {
  return `radial-gradient(120% 100% at 88% 6%, ${nhHexA(tint, 0.34)} 0%, ${nhHexA(tint, 0.1)} 42%, rgba(0,0,0,0) 72%), linear-gradient(158deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 42%, rgba(0,0,0,0.24) 100%)`
}

// NH source: NH_LOCKS (enhancements.js:133) — lock KEY NAMES kept identical to
// NH's own (server-config.json may be shared with a real NanoHive admin panel),
// but lockGlobalSearch maps to our own crossLibrarySearch setting, not NH's
// globalSearch — this app's cross-library search predates and doesn't share a
// name with NH's own feature (see store/index.js's crossLibrarySearch comment).
export const NH_LOCKS = { lockRatings: 'showRatings', lockCardRatings: 'showCardRatings', lockGlobalSearch: 'crossLibrarySearch', lockHeroCarousel: 'showHeroCarousel' }

export const state = () => ({
  deviceData: null,
  currentPlaybackSession: null,
  playerIsPlaying: false,
  playerIsFullscreen: false,
  playerIsStartingPlayback: false, // When pressing play before native play response
  playerStartingPlaybackMediaId: null,
  isCasting: false,
  isCastAvailable: false,
  attemptingConnection: false,
  socketConnected: false,
  networkConnected: false,
  networkConnectionType: null,
  isNetworkUnmetered: true,
  isFirstLoad: true,
  isFirstAudioLoad: true,
  hasStoragePermission: false,
  selectedLibraryItem: null,
  showReader: false,
  ereaderKeepProgress: false,
  ereaderFileId: null,
  showSideDrawer: false,
  nhThemeActive: true,
  nhHomeCoverUrl: null,
  nhSettings: { ...NH_SETTINGS_DEFAULTS },
  // Shared cache for card-badge ratings (LazyBookCard/LazySeriesCard/search rows) —
  // one bulk GET /_nh/api/ratings covers every card instead of one fetch each,
  // same as NH source's nhRs. { <itemId or 'series:<id>'>: { <userId>: {stars,review,ts,user} } }.
  nhRatingsBulk: null,
  nhRatingsBulkAt: 0,
  // Set once several consecutive bulk-ratings fetches have failed — stops every
  // card badge from retrying pointlessly, mirroring NH source's nhRs.dead.
  // (Per-item widget failures are scoped to that widget instance instead,
  // matching nhRt.dead — see RatingsWidget.vue.) Greptile-found bug: this used
  // to be permanent for the rest of the session with no way back — a single
  // brief network blip early on could disable ratings everywhere until an app
  // restart. nhRatingsRetryAt bounds it to an expiring backoff instead.
  nhRatingsDead: false,
  nhRatingsBulkFails: 0,
  nhRatingsRetryAt: 0,
  // NH source: nhColArtMap (enhancements.js:7550) — admin-set custom icon/tint
  // overrides, keyed by collection id. null = not loaded yet, {} = loaded/empty.
  nhCollectionArt: null,
  // NH source: nhSc (enhancements.js:4247-4263) — combined series-meta payload:
  // custom series covers, custom series descriptions (existence only — the text
  // itself is a separate per-series fetch, see nhSeriesDescText below), and user
  // avatar file extensions. null = not loaded yet.
  nhSeriesCovers: null,
  nhSeriesDescs: null,
  nhAvatars: null,
  // Per-series custom description TEXT cache, populated lazily (SeriesHeader.vue).
  nhSeriesDescText: {},
  // NH source: uiServerSettings / NH_LOCKS (enhancements.js:80-136) — admin-set
  // server-wide defaults + feature kill-switches, from GET /_nh/server-config.json.
  // null = not loaded yet. Kill-switches (nhServerLocks) are applied live on top
  // of whatever the user has locally, not persisted into their own saved
  // settings, so a lock lifting later restores their original preference.
  nhServerConfig: null,
  nhServerLocks: {},
  isNetworkListenerInit: false,
  serverSettings: null,
  lastBookshelfScrollData: {},
  lastItemScrollData: {}
})

export const getters = {
  getCurrentPlaybackSessionId: (state) => {
    return state.currentPlaybackSession?.id || null
  },
  getIsPlayerOpen: (state) => {
    return !!state.currentPlaybackSession
  },
  getIsCurrentSessionLocal: (state) => {
    return state.currentPlaybackSession?.playMethod == PlayMethod.LOCAL
  },
  getIsMediaStreaming: (state) => (libraryItemId, episodeId) => {
    if (!state.currentPlaybackSession || !libraryItemId) return false

    // Check using local library item id and local episode id
    const isLocalLibraryItemId = libraryItemId.startsWith('local_')
    if (isLocalLibraryItemId) {
      if (state.currentPlaybackSession.localLibraryItem?.id !== libraryItemId) {
        return false
      }
      if (!episodeId) return true
      return state.currentPlaybackSession.localEpisodeId === episodeId
    }

    if (state.currentPlaybackSession.libraryItemId !== libraryItemId) {
      return false
    }
    if (!episodeId) return true
    return state.currentPlaybackSession.episodeId === episodeId
  },
  getServerSetting: (state) => (key) => {
    if (!state.serverSettings) return null
    return state.serverSettings[key]
  },
  getJumpForwardTime: (state) => {
    if (!state.deviceData?.deviceSettings) return 10
    return state.deviceData.deviceSettings.jumpForwardTime || 10
  },
  getJumpBackwardsTime: (state) => {
    if (!state.deviceData?.deviceSettings) return 10
    return state.deviceData.deviceSettings.jumpBackwardsTime || 10
  },
  getAltViewEnabled: (state) => {
    if (!state.deviceData?.deviceSettings) return true
    return state.deviceData.deviceSettings.enableAltView
  },
  getOrientationLockSetting: (state) => {
    return state.deviceData?.deviceSettings?.lockOrientation
  },
  getCanDownloadUsingCellular: (state) => {
    if (!state.deviceData?.deviceSettings?.downloadUsingCellular) return 'ALWAYS'
    return state.deviceData.deviceSettings.downloadUsingCellular || 'ALWAYS'
  },
  getCanStreamingUsingCellular: (state) => {
    if (!state.deviceData?.deviceSettings?.streamingUsingCellular) return 'ALWAYS'
    return state.deviceData.deviceSettings.streamingUsingCellular || 'ALWAYS'
  },
  /**
   * Old server versions require a token for images
   *
   * @param {*} state
   * @returns {boolean} True if server version is less than 2.17
   */
  getDoesServerImagesRequireToken: (state) => {
    const serverVersion = state.serverSettings?.version
    if (!serverVersion) return false
    const versionParts = serverVersion.split('.')
    const majorVersion = parseInt(versionParts[0])
    const minorVersion = parseInt(versionParts[1])
    return majorVersion < 2 || (majorVersion == 2 && minorVersion < 17)
  }
}

export const actions = {
  // Listen for network connection
  // Initialises the Capacitor Network listener and the AbsAudioPlayer metered-network listener.
  async setupNetworkListener({ state, commit }) {
    if (state.isNetworkListenerInit) return
    commit('setNetworkListenerInit', true)

    const status = await Network.getStatus()
    console.log('Network status', status)
    commit('setNetworkStatus', status)

    Network.addListener('networkStatusChange', (status) => {
      console.log('Network status changed', status.connected, status.connectionType)
      commit('setNetworkStatus', status)
      // Re-probe LAN vs remote endpoint when Wi-Fi connects so routing switches dynamically
      // without requiring an app restart or manual reconnect. Skip when there's no server
      // connection to resolve against — a null serverConnectionConfig still reaches the
      // Kotlin side and resets effectiveAddress to "", harmless but wasteful on every
      // Wi-Fi connect while logged out (Greptile, PR #4).
      if (status.connected && status.connectionType === 'wifi' && state.user.serverConnectionConfig) {
        AbsDatabase.resolveEndpoint().catch((err) => {
          console.warn('[store] resolveEndpoint failed on Wi-Fi connect', err)
        })
      }
    })

    AbsAudioPlayer.addListener('onNetworkMeteredChanged', (payload) => {
      const isUnmetered = payload.value
      console.log('On network metered changed', isUnmetered)
      commit('setIsNetworkUnmetered', isUnmetered)
    })
  }
}

export const mutations = {
  setDeviceData(state, deviceData) {
    state.deviceData = deviceData
  },
  setLastBookshelfScrollData(state, { scrollTop, path, name }) {
    state.lastBookshelfScrollData[name] = { scrollTop, path }
  },
  setLastItemScrollData(state, data) {
    state.lastItemScrollData = data
  },
  setPlaybackSession(state, playbackSession) {
    state.currentPlaybackSession = playbackSession

    state.isCasting = playbackSession?.mediaPlayer === 'cast-player'
  },
  setMediaPlayer(state, mediaPlayer) {
    state.isCasting = mediaPlayer === 'cast-player'
  },
  setCastAvailable(state, available) {
    state.isCastAvailable = available
  },
  setAttemptingConnection(state, val) {
    state.attemptingConnection = val
  },
  setPlayerPlaying(state, val) {
    state.playerIsPlaying = val
  },
  setPlayerFullscreen(state, val) {
    state.playerIsFullscreen = val
  },
  setPlayerIsStartingPlayback(state, mediaId) {
    state.playerStartingPlaybackMediaId = mediaId
    state.playerIsStartingPlayback = true
  },
  setPlayerDoneStartingPlayback(state) {
    state.playerStartingPlaybackMediaId = null
    state.playerIsStartingPlayback = false
  },
  setHasStoragePermission(state, val) {
    state.hasStoragePermission = val
  },
  setNhHomeCoverUrl(state, val) {
    state.nhHomeCoverUrl = val
  },
  setNhSettings(state, settings) {
    state.nhSettings = { ...NH_SETTINGS_DEFAULTS, ...settings }
  },
  setNhSetting(state, { key, value }) {
    state.nhSettings = { ...state.nhSettings, [key]: value }
  },
  setIsFirstLoad(state, val) {
    state.isFirstLoad = val
  },
  setIsFirstAudioLoad(state, val) {
    state.isFirstAudioLoad = val
  },
  setSocketConnected(state, val) {
    state.socketConnected = val
  },
  setNetworkListenerInit(state, val) {
    state.isNetworkListenerInit = val
  },
  setNetworkStatus(state, val) {
    if (val.connectionType !== 'none') {
      state.networkConnected = true
    } else {
      state.networkConnected = false
    }
    if (this.$platform === 'ios') {
      // Capacitor Network plugin only shows ios device connected if internet access is available.
      // This fix allows iOS users to use local servers without internet access.
      state.networkConnected = true
    }
    state.networkConnectionType = val.connectionType
  },
  setIsNetworkUnmetered(state, val) {
    state.isNetworkUnmetered = val
  },
  showReader(state, { libraryItem, keepProgress, fileId }) {
    state.selectedLibraryItem = libraryItem
    state.ereaderKeepProgress = keepProgress
    state.ereaderFileId = fileId

    state.showReader = true
  },
  setShowReader(state, val) {
    state.showReader = val
  },
  setShowSideDrawer(state, val) {
    state.showSideDrawer = val
  },
  setNhThemeActive(state, val) {
    state.nhThemeActive = val
  },
  setNhRatingsBulk(state, items) {
    state.nhRatingsBulk = items
    state.nhRatingsBulkAt = Date.now()
    state.nhRatingsBulkFails = 0
    state.nhRatingsDead = false
    state.nhRatingsRetryAt = 0
  },
  bumpNhRatingsBulkFails(state) {
    state.nhRatingsBulkFails++
    if (state.nhRatingsBulkFails >= 4) {
      state.nhRatingsDead = true
      // Exponential backoff (30s, 60s, 120s...), capped at 5 minutes, instead
      // of a permanent-for-the-session flag — a real NH-backed server that
      // was just briefly unreachable recovers on its own.
      const backoff = Math.min(300000, 30000 * Math.pow(2, state.nhRatingsBulkFails - 4))
      state.nhRatingsRetryAt = Date.now() + backoff
    }
  },
  setNhCollectionArt(state, map) {
    state.nhCollectionArt = map
  },
  setNhSeriesMeta(state, { covers, descs, avatars }) {
    state.nhSeriesCovers = covers || {}
    state.nhSeriesDescs = descs || {}
    state.nhAvatars = avatars || {}
  },
  setNhSeriesDescText(state, { seriesId, text }) {
    state.nhSeriesDescText = { ...state.nhSeriesDescText, [seriesId]: text }
  },
  setNhServerConfig(state, cfg) {
    state.nhServerConfig = cfg || {}
    const locks = {}
    Object.keys(NH_LOCKS).forEach((lk) => {
      if (state.nhServerConfig[lk]) locks[lk] = true
    })
    state.nhServerLocks = locks
    // Live-only override: forces locked settings off in the CURRENT session
    // state, never written to localStorage, so lifting the lock later restores
    // whatever the user actually had saved.
    const forced = { ...state.nhSettings }
    Object.keys(locks).forEach((lk) => {
      forced[NH_LOCKS[lk]] = false
    })
    state.nhSettings = forced
  },
  // NH source: nh-rating-change listener (enhancements.js:4735-4744) — patch the
  // shared cache in place after a save instead of a full refetch, so every open
  // card badge and widget picks up the change on its next render.
  patchNhRatingsBulkItem(state, { itemKey, ratings }) {
    if (!state.nhRatingsBulk) return
    const next = { ...state.nhRatingsBulk }
    if (ratings && Object.keys(ratings).length) next[itemKey] = ratings
    else delete next[itemKey]
    state.nhRatingsBulk = next
  },
  setNhRatingsDead(state, val) {
    state.nhRatingsDead = val
  },
  setServerSettings(state, val) {
    state.serverSettings = val
    this.$localStore.setServerSettings(state.serverSettings)
  }
}
