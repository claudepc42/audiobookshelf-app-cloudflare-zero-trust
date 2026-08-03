<template>
  <div class="w-full h-full px-4 py-6 overflow-y-auto">
    <p class="text-xs mb-6" style="color: #9a9085">Personalise the look of your library. Changes save automatically.</p>

    <!-- NH source: panelSearch() (enhancements.js:1332-1348) — a live filter over
         the settings, essential once there are this many. Ported at our own
         section granularity (NH hides whole "cards"; we hide whole labeled
         sections) rather than per-row, and via direct ref/style.display
         manipulation matching NH's real technique instead of forcing this
         through Vue's own reactivity system for a large template refactor. -->
    <div class="relative mb-6">
      <span class="material-symbols absolute" style="left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; color: #8a8075">search</span>
      <input
        ref="searchInput"
        v-model="panelSearch"
        type="text"
        placeholder="Search settings…"
        class="w-full text-sm rounded-lg py-2 pl-8 pr-8"
        style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #d8cfc2"
        @input="filterSections"
      />
      <button v-if="panelSearch" type="button" class="absolute" style="right: 8px; top: 50%; transform: translateY(-50%)" @click="clearPanelSearch">
        <span class="material-symbols" style="font-size: 1.1rem; color: #8a8075">close</span>
      </button>
    </div>
    <p v-if="panelSearch && noSectionsMatch" class="text-xs mb-4" style="color: #8a8075">No settings match "{{ panelSearch }}".</p>

    <div data-section>
      <!-- Branding & Style -->
      <p class="uppercase text-xs font-semibold mb-3" style="color: #e0c27a; letter-spacing: 0.08em">Branding &amp; Style</p>

      <p class="text-sm mb-2" style="color: #d8cfc2">Accent Colour</p>
      <div class="flex flex-wrap gap-2 mb-2">
        <button
          v-for="color in presetColors"
          :key="color"
          type="button"
          class="w-8 h-8 rounded-full shrink-0"
          :style="{ background: color, border: isAccent(color) ? '2px solid #fff' : '2px solid transparent' }"
          @click="updateSetting('accentColor', color)"
        />
        <label class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center cursor-pointer" :style="{ border: !isKnownAccent ? '2px solid #fff' : '2px solid rgba(255,255,255,0.3)' }">
          <input type="color" class="opacity-0 w-0 h-0 absolute" :value="settings.accentColor" @input="updateSetting('accentColor', $event.target.value)" />
          <span class="material-symbols text-base" style="color: #d8cfc2">palette</span>
        </label>
      </div>

      <p class="text-sm mb-2 mt-5" style="color: #d8cfc2">Base Theme</p>
      <div class="grid grid-cols-3 gap-2 mb-5">
        <button
          v-for="(theme, key) in baseThemes"
          :key="key"
          type="button"
          class="rounded-lg text-xs font-semibold py-3 px-2 text-center"
          :style="{
            background: theme.canvas,
            color: '#f4eee2',
            border: settings.baseTheme === key ? '2px solid #e0c27a' : '2px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('baseTheme', key)"
        >
          {{ theme.name }}
        </button>
      </div>

      <p class="text-sm mb-2" style="color: #d8cfc2">Main Font</p>
      <div class="flex flex-wrap gap-2 mb-5">
        <button
          v-for="font in googleFonts"
          :key="font"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            fontFamily: font,
            color: settings.mainFont === font ? '#fff' : '#9a9085',
            background: settings.mainFont === font ? 'rgba(255,255,255,0.10)' : 'transparent',
            border: settings.mainFont === font ? '1px solid #e0c27a' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('mainFont', font)"
        >
          {{ font }}
        </button>
      </div>

      <div class="py-3 flex items-center">
        <div class="pr-4 flex-1">
          <p style="color: #d8cfc2">Font Size Scale</p>
          <p class="text-xs" style="color: #9a9085">1.0 = default size. Range 0.8&ndash;1.3.</p>
        </div>
        <ui-text-input type="number" :value="settings.fontScale" step="0.05" min="0.8" max="1.3" style="width: 90px" @input="updateSetting('fontScale', Number($event) || 1)" />
      </div>

      <div class="py-3 flex items-center">
        <div class="pr-4 flex-1">
          <p style="color: #d8cfc2">Hamburger Menu Text Size</p>
          <p class="text-xs" style="color: #9a9085">Extra scale for the hamburger menu's text only, applied on top of Font Size Scale above. 1.0 = default size. Range 0.8&ndash;1.3.</p>
        </div>
        <ui-text-input type="number" :value="settings.drawerFontScale" step="0.05" min="0.8" max="1.3" style="width: 90px" @input="updateSetting('drawerFontScale', Number($event) || 1)" />
      </div>

      <div class="py-3 flex items-center">
        <p class="pr-4 flex-1" style="color: #d8cfc2">Custom Logo</p>
      </div>
      <ui-text-input :value="settings.logoUrl" placeholder="Leave empty for the default logo" clearable class="mb-3" @input="updateSetting('logoUrl', $event)" />

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('colorizeLogo', !settings.colorizeLogo)">
          <ui-toggle-switch :value="settings.colorizeLogo" @input="updateSetting('colorizeLogo', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Colorize Logo with Accent Colour</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('finishedBadgeUsesAccent', !settings.finishedBadgeUsesAccent)">
          <ui-toggle-switch :value="settings.finishedBadgeUsesAccent" @input="updateSetting('finishedBadgeUsesAccent', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: #d8cfc2">Finished Checkmark Uses Accent Colour</p>
          <p class="text-xs" style="color: #9a9085">Off keeps finished badges green, so they're always easy to spot regardless of accent colour.</p>
        </div>
      </div>
    </div>

    <div data-section>
      <!-- Home & Carousel -->
      <p class="uppercase text-xs font-semibold mb-3 mt-8" style="color: #e0c27a; letter-spacing: 0.08em">Home &amp; Carousel</p>

      <div class="py-3 flex items-center">
        <p class="pr-4 flex-1" style="color: #d8cfc2">Carousel Auto-Advance (seconds, 0 disables)</p>
        <ui-text-input type="number" :value="settings.carouselTiming" min="0" max="60" style="width: 90px" @input="updateSetting('carouselTiming', Number($event) || 0)" />
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('greetingUsesAccent', !settings.greetingUsesAccent)">
          <ui-toggle-switch :value="settings.greetingUsesAccent" @input="updateSetting('greetingUsesAccent', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Greeting Label Uses Accent Color</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('showCustomRecentSeries', !settings.showCustomRecentSeries)">
          <ui-toggle-switch :value="settings.showCustomRecentSeries" @input="updateSetting('showCustomRecentSeries', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Expanded Recent Series</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('customSeriesCards', !settings.customSeriesCards)">
          <ui-toggle-switch :value="settings.customSeriesCards" @input="updateSetting('customSeriesCards', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Stacked Series Covers</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockHeroCarousel') }" @click="updateSetting('showHeroCarousel', !settings.showHeroCarousel)">
          <ui-toggle-switch :value="settings.showHeroCarousel" @input="updateSetting('showHeroCarousel', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Home Carousel<span v-if="isLocked('lockHeroCarousel')" class="text-xs pl-2" style="color: #9a9085">Locked by admin</span></p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('cinematicBg', !settings.cinematicBg)">
          <ui-toggle-switch :value="settings.cinematicBg" @input="updateSetting('cinematicBg', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: #d8cfc2">Cinematic Background</p>
          <p class="text-xs" style="color: #9a9085">Blurred cover art behind Home and item pages.</p>
        </div>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('autoplaySeries', !settings.autoplaySeries)">
          <ui-toggle-switch :value="settings.autoplaySeries" @input="updateSetting('autoplaySeries', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: #d8cfc2">Autoplay Next in Series</p>
          <p class="text-xs" style="color: #9a9085">When a book finishes, start the next one in the same series automatically.</p>
        </div>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockGlobalSearch') }" @click="updateSetting('crossLibrarySearch', !settings.crossLibrarySearch)">
          <ui-toggle-switch :value="settings.crossLibrarySearch" @input="updateSetting('crossLibrarySearch', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: #d8cfc2">Search Every Library at Once<span v-if="isLocked('lockGlobalSearch')" class="text-xs pl-2" style="color: #9a9085">Locked by admin</span></p>
          <p class="text-xs" style="color: #9a9085">When off, search only looks in your current library.</p>
        </div>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('showFinishedBookTools', !settings.showFinishedBookTools)">
          <ui-toggle-switch :value="settings.showFinishedBookTools" @input="updateSetting('showFinishedBookTools', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Finished Book Tools on Stats Page</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('showRateFinished', !settings.showRateFinished)">
          <ui-toggle-switch :value="settings.showRateFinished" @input="updateSetting('showRateFinished', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: #d8cfc2">"Rate What You Finished" Home Shelf</p>
          <p class="text-xs" style="color: #9a9085">Books you finished but haven't rated yet. Needs Community Ratings enabled for the library.</p>
        </div>
      </div>

      <p class="text-sm mb-2 mt-3" style="color: #d8cfc2">Continue Reading Shelf</p>
      <div class="flex flex-wrap gap-2 mb-3">
        <button
          v-for="mode in continueReadingModes"
          :key="mode.value"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: settings.continueReadingMode === mode.value ? '#e0c27a' : '#9a9085',
            background: settings.continueReadingMode === mode.value ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: settings.continueReadingMode === mode.value ? '1px solid #e0c27a' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('continueReadingMode', mode.value)"
        >
          {{ mode.text }}
        </button>
      </div>

      <div class="py-3 flex items-center">
        <p class="pr-4 flex-1" style="color: #d8cfc2">Recent Series Count</p>
        <ui-text-input type="number" :value="settings.recentSeriesCount" min="1" max="50" style="width: 90px" @input="updateSetting('recentSeriesCount', Number($event) || 12)" />
      </div>

      <p class="text-xs uppercase mb-2 mt-4" style="color: #8a8075; letter-spacing: 0.08em">Reorder Home Shelves</p>
      <div v-for="(key, index) in orderedSectionKeys" :key="key" class="flex items-center py-1.5">
        <p class="flex-1" style="color: #d8cfc2">{{ sectionLabels[key] }}</p>
        <button type="button" class="w-8 h-8 flex items-center justify-center" :disabled="index === 0" :style="{ opacity: index === 0 ? 0.3 : 1 }" @click="moveSection(index, -1)">
          <span class="material-symbols text-xl" style="color: #d8cfc2">arrow_upward</span>
        </button>
        <button type="button" class="w-8 h-8 flex items-center justify-center" :disabled="index === orderedSectionKeys.length - 1" :style="{ opacity: index === orderedSectionKeys.length - 1 ? 0.3 : 1 }" @click="moveSection(index, 1)">
          <span class="material-symbols text-xl" style="color: #d8cfc2">arrow_downward</span>
        </button>
      </div>
      <button v-if="settings.homeOrder && settings.homeOrder.length" type="button" class="text-xs mb-4 mt-1" style="color: #9a9085" @click="updateSetting('homeOrder', [])">Reset to default order</button>

      <p class="text-xs uppercase mb-2 mt-4" style="color: #8a8075; letter-spacing: 0.08em">Hide Homepage Shelves</p>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeRecentlyAdded', !settings.hideHomeRecentlyAdded)">
          <ui-toggle-switch :value="settings.hideHomeRecentlyAdded" @input="updateSetting('hideHomeRecentlyAdded', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Recently Added</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeRecentSeries', !settings.hideHomeRecentSeries)">
          <ui-toggle-switch :value="settings.hideHomeRecentSeries" @input="updateSetting('hideHomeRecentSeries', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Recent Series</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeContinueSeries', !settings.hideHomeContinueSeries)">
          <ui-toggle-switch :value="settings.hideHomeContinueSeries" @input="updateSetting('hideHomeContinueSeries', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Continue Series</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeListenAgain', !settings.hideHomeListenAgain)">
          <ui-toggle-switch :value="settings.hideHomeListenAgain" @input="updateSetting('hideHomeListenAgain', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Listen Again</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeDiscover', !settings.hideHomeDiscover)">
          <ui-toggle-switch :value="settings.hideHomeDiscover" @input="updateSetting('hideHomeDiscover', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Discover</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeNewAuthors', !settings.hideHomeNewAuthors)">
          <ui-toggle-switch :value="settings.hideHomeNewAuthors" @input="updateSetting('hideHomeNewAuthors', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Newest Authors</p>
      </div>
    </div>

    <div data-section>
      <!-- Community Ratings -->
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: #e0c27a; letter-spacing: 0.08em">Community Ratings</p>
      <p class="text-xs mb-3" style="color: #8a8075">Talks to a NanoHive server's own ratings backend. Only appears if your server has one — otherwise these settings do nothing.</p>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockRatings') }" @click="updateSetting('showRatings', !settings.showRatings)">
          <ui-toggle-switch :value="settings.showRatings" @input="updateSetting('showRatings', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Enable Ratings &amp; Reviews<span v-if="isLocked('lockRatings')" class="text-xs pl-2" style="color: #9a9085">Locked by admin</span></p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockCardRatings') }" @click="updateSetting('showCardRatings', !settings.showCardRatings)">
          <ui-toggle-switch :value="settings.showCardRatings" @input="updateSetting('showCardRatings', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Show Star Badges on Covers<span v-if="isLocked('lockCardRatings')" class="text-xs pl-2" style="color: #9a9085">Locked by admin</span></p>
      </div>

      <p class="text-sm mb-2 mt-3" style="color: #d8cfc2">Rating Precision</p>
      <div class="flex flex-wrap gap-2 mb-3">
        <button
          v-for="opt in starStepOptions"
          :key="opt.value"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: settings.starStep === opt.value ? '#e0c27a' : '#9a9085',
            background: settings.starStep === opt.value ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: settings.starStep === opt.value ? '1px solid #e0c27a' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('starStep', opt.value)"
        >
          {{ opt.text }}
        </button>
      </div>

      <p v-if="libraries.length > 1" class="text-xs uppercase mb-2 mt-4" style="color: #8a8075; letter-spacing: 0.08em">Per-Library Override</p>
      <div v-for="lib in libraries" :key="lib.id" class="flex items-center py-1.5">
        <p class="flex-1" style="color: #d8cfc2">{{ lib.name }}</p>
        <ui-toggle-switch :value="isRatingLibOn(lib.id)" @input="setRatingLibOverride(lib.id, $event)" />
      </div>
    </div>

    <div data-section>
      <!-- Book Lookup Sites -->
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: #e0c27a; letter-spacing: 0.08em">Book Lookup Sites</p>
      <p class="text-xs mb-3" style="color: #8a8075">Buttons on the item page for finding a book elsewhere. Defaults to Goodreads plus a local site for your language.</p>
      <div class="flex flex-wrap gap-2 mb-6">
        <button
          v-for="site in bookSites"
          :key="site.id"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: isBookSiteSelected(site.id) ? '#e0c27a' : '#9a9085',
            background: isBookSiteSelected(site.id) ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: isBookSiteSelected(site.id) ? '1px solid #e0c27a' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="toggleBookSite(site.id)"
        >
          {{ site.name }}
        </button>
      </div>
      <button v-if="settings.bookSites !== null" type="button" class="text-xs mb-4 -mt-4" style="color: #9a9085" @click="updateSetting('bookSites', null)">Reset to language default</button>
    </div>

    <div data-section>
      <!-- Sidebar Menus -->
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: #e0c27a; letter-spacing: 0.08em">Sidebar Menus</p>
      <p class="text-xs mb-3" style="color: #8a8075">Hide bottom-tab entries you don't use.</p>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailSeries', !settings.hideRailSeries)">
          <ui-toggle-switch :value="settings.hideRailSeries" @input="updateSetting('hideRailSeries', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Series</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailCollections', !settings.hideRailCollections)">
          <ui-toggle-switch :value="settings.hideRailCollections" @input="updateSetting('hideRailCollections', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Collections</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailAuthors', !settings.hideRailAuthors)">
          <ui-toggle-switch :value="settings.hideRailAuthors" @input="updateSetting('hideRailAuthors', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Authors</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailNarrators', !settings.hideRailNarrators)">
          <ui-toggle-switch :value="settings.hideRailNarrators" @input="updateSetting('hideRailNarrators', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Narrators</p>
      </div>
      <div class="flex items-center py-2 mb-6">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailStats', !settings.hideRailStats)">
          <ui-toggle-switch :value="settings.hideRailStats" @input="updateSetting('hideRailStats', $event)" />
        </div>
        <p class="pl-4" style="color: #d8cfc2">Hide Stats</p>
      </div>
    </div>

    <!-- Server Defaults — admin only. NH source: nhSrvSave/nhSrvClear/lock toggles
         (enhancements.js:1582-1704). Selective per-group saving (NH's own
         look/home/pages checkboxes) is simplified to save-everything here. Kept
         out of the searchable/filterable section list — an admin-only block
         showing zero rows when a search term doesn't match it would read as a
         bug ("where did Server Defaults go?"), not filtering working correctly. -->
    <template v-if="isAdminOrUp && nhThemeActive">
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: #e0c27a; letter-spacing: 0.08em">Server Defaults</p>
      <p class="text-xs mb-3" style="color: #8a8075">What every new user on this server sees before they customize anything.</p>
      <div class="flex gap-2 mb-2">
        <ui-btn small color="primary" :loading="srvSaving" @click="saveServerDefaults">Save Current as Server Default</ui-btn>
        <ui-btn small color="bg bg-opacity-50" :loading="srvSaving" @click="clearServerDefaults">Clear</ui-btn>
      </div>
      <p v-if="srvStatus" class="text-xs mb-4" style="color: #9a9085">{{ srvStatus }}</p>

      <p class="text-xs uppercase mb-2 mt-4" style="color: #8a8075; letter-spacing: 0.08em">Force Off For Everyone</p>
      <div v-for="lock in serverLocks" :key="lock.key" class="flex items-center py-1.5">
        <p class="flex-1" style="color: #d8cfc2">{{ lock.label }}</p>
        <ui-toggle-switch :value="isLocked(lock.key)" @input="setLock(lock.key, $event)" />
      </div>
    </template>
  </div>
</template>

<script>
import { NH_BASE_THEMES, NH_GOOGLE_FONTS, NH_PRESET_COLORS, NH_BOOK_SITES, nhRatingsLibOn } from '@/store/index'

// Same keys as pages/bookshelf/index.vue's getShelfOrderKey() — must match
// exactly, this is the canonical default order used when homeOrder is empty.
const DEFAULT_SECTION_ORDER = ['continue-listening', 'recently-added', 'recent-series', 'continue-series', 'listen-again', 'discover', 'new-authors']

export default {
  data() {
    return {
      baseThemes: NH_BASE_THEMES,
      googleFonts: NH_GOOGLE_FONTS,
      presetColors: NH_PRESET_COLORS,
      bookSites: NH_BOOK_SITES,
      continueReadingModes: [
        { value: 'combine', text: 'Combine into carousel' },
        { value: 'separate', text: 'Keep as separate shelf' },
        { value: 'hidden', text: 'Hidden' }
      ],
      // NH source: star-step select (enhancements.js:1287-1294) — values/order ported exactly.
      starStepOptions: [
        { value: 1, text: 'Full stars' },
        { value: 0.5, text: 'Half stars' },
        { value: 0.25, text: 'Quarter stars' }
      ],
      serverLocks: [
        { key: 'lockRatings', label: 'Ratings & Reviews' },
        { key: 'lockCardRatings', label: 'Star Badges on Covers' },
        { key: 'lockGlobalSearch', label: 'Search Every Library at Once' },
        { key: 'lockHeroCarousel', label: 'Home Carousel' }
      ],
      srvSaving: false,
      srvStatus: '',
      panelSearch: '',
      noSectionsMatch: false,
      sectionLabels: {
        'continue-listening': 'Continue Listening',
        'recently-added': 'Recently Added',
        'recent-series': 'Recent Series',
        'continue-series': 'Continue Series',
        'listen-again': 'Listen Again',
        discover: 'Discover',
        'new-authors': 'Newest Authors'
      }
    }
  },
  computed: {
    settings() {
      return this.$store.state.nhSettings
    },
    isKnownAccent() {
      return this.presetColors.includes((this.settings.accentColor || '').toLowerCase())
    },
    orderedSectionKeys() {
      return this.settings.homeOrder && this.settings.homeOrder.length ? this.settings.homeOrder : DEFAULT_SECTION_ORDER
    },
    libraries() {
      return this.$store.state.libraries.libraries || []
    },
    isAdminOrUp() {
      return this.$store.getters['user/getIsAdminOrUp']
    },
    nhThemeActive() {
      return this.$store.state.nhThemeActive
    },
    // Same language-based default as pages/item/_id/index.vue's bookSitesDefault() —
    // shown as the active selection until the user actually customizes this list.
    bookSitesDefaultIds() {
      const lang = (this.$languageCodes?.current || 'en').split('-')[0].toLowerCase()
      const forLang = this.bookSites.filter((s) => s.langs.indexOf(lang) !== -1)
      const local = forLang.filter((s) => s.id.indexOf('amazon') !== 0)[0] || forLang[0]
      const ids = ['goodreads']
      if (local) ids.push(local.id)
      return ids
    },
    selectedBookSiteIds() {
      return Array.isArray(this.settings.bookSites) ? this.settings.bookSites : this.bookSitesDefaultIds
    }
  },
  methods: {
    isAccent(color) {
      return (this.settings.accentColor || '').toLowerCase() === color.toLowerCase()
    },
    // NH source: panelSearch() (enhancements.js:1334-1348) — direct style.display
    // toggling over a live text match, same technique as NH's own (not routed
    // through Vue reactivity/v-show, which would need every section's visibility
    // as tracked state for what's purely a cosmetic filter).
    filterSections() {
      const q = this.panelSearch.trim().toLowerCase()
      // NOT this.$refs.searchSections: six separate elements sharing one ref
      // name outside a v-for only ever keeps the LAST one in $refs (Vue only
      // collects a ref into an array when it's inside a v-for), so .forEach
      // silently threw and no section was ever actually hidden. Querying by
      // the data-section attribute instead sidesteps that Vue ref behavior.
      const sections = this.$el.querySelectorAll('[data-section]')
      let shown = 0
      sections.forEach((el) => {
        const hit = !q || el.textContent.toLowerCase().indexOf(q) !== -1
        el.style.display = hit ? '' : 'none'
        if (hit) shown++
      })
      this.noSectionsMatch = !!q && shown === 0
    },
    clearPanelSearch() {
      this.panelSearch = ''
      this.filterSections()
      this.$refs.searchInput?.focus()
    },
    isRatingLibOn(libId) {
      return nhRatingsLibOn(this.settings.ratingLibs, this.libraries.find((l) => l.id === libId))
    },
    setRatingLibOverride(libId, val) {
      const libs = { ...(this.settings.ratingLibs && typeof this.settings.ratingLibs === 'object' ? this.settings.ratingLibs : {}) }
      libs[libId] = val
      this.updateSetting('ratingLibs', libs)
    },
    isLocked(key) {
      return !!this.$store.state.nhServerLocks[key]
    },
    // NH source: lock toggle handler (enhancements.js:1693-1703) — persists
    // over whatever's already saved server-side, sanitizes string values the
    // same way NH's own putServerConfig() does (strips < and >).
    async setLock(key, val) {
      const cfg = { ...(this.$store.state.nhServerConfig || {}) }
      if (val) cfg[key] = true
      else delete cfg[key]
      await this.putServerConfig(cfg)
      this.$store.commit('setNhServerConfig', cfg)
    },
    async saveServerDefaults() {
      this.srvSaving = true
      this.srvStatus = ''
      try {
        const existing = (await this.$nativeHttp.get('/_nh/server-config.json').catch(() => ({}))) || {}
        const merged = { ...existing, ...this.settings }
        delete merged.themeVersion
        // Never leak per-device/session-only state into the shared server default.
        delete merged.nhGlassEffect
        delete merged.nhGlassEffectSlots
        await this.putServerConfig(merged)
        this.$store.commit('setNhServerConfig', merged)
        this.srvStatus = 'Saved.'
      } catch (e) {
        this.srvStatus = 'Could not save.'
      }
      this.srvSaving = false
    },
    async clearServerDefaults() {
      this.srvSaving = true
      this.srvStatus = ''
      try {
        await this.putServerConfig({})
        this.$store.commit('setNhServerConfig', {})
        this.srvStatus = 'Cleared.'
      } catch (e) {
        this.srvStatus = 'Could not clear.'
      }
      this.srvSaving = false
    },
    putServerConfig(obj) {
      const clean = {}
      Object.keys(obj).forEach((k) => {
        const v = obj[k]
        clean[k] = typeof v === 'string' ? v.replace(/[<>]/g, '') : v
      })
      // $nativeHttp only exposes get/post/patch/delete — PUT goes through its
      // underlying request() directly, same auth/CF-refresh handling either way.
      return this.$nativeHttp.request('PUT', '/_nh/data/server-config.json', clean)
    },
    isBookSiteSelected(id) {
      return this.selectedBookSiteIds.includes(id)
    },
    toggleBookSite(id) {
      const current = this.selectedBookSiteIds.slice()
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      this.updateSetting('bookSites', next)
    },
    moveSection(index, dir) {
      const list = this.orderedSectionKeys.slice()
      const target = index + dir
      if (target < 0 || target >= list.length) return
      ;[list[index], list[target]] = [list[target], list[index]]
      this.updateSetting('homeOrder', list)
    },
    async updateSetting(key, value) {
      this.$store.commit('setNhSetting', { key, value })
      const saved = (await this.$localStore.getNhSettings()) || {}
      await this.$localStore.setNhSettings({ ...saved, ...this.$store.state.nhSettings })
    },
    // The app-wide font link (layouts/default.vue) only ever loads the
    // currently-active mainFont, so every other button in this picker fell
    // back to the default font until clicked (which swaps that single link's
    // href). Preload every font's webface here so all previews render in
    // their real typeface immediately, not just the selected one.
    preloadFontPreviews() {
      const families = this.googleFonts.filter((f) => f.toLowerCase() !== 'spectral').map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
      let link = document.getElementById('nh-font-preview-preload')
      if (!link) {
        link = document.createElement('link')
        link.id = 'nh-font-preview-preload'
        link.rel = 'stylesheet'
        document.head.appendChild(link)
      }
      link.href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`
    }
  },
  mounted() {
    this.preloadFontPreviews()
  }
}
</script>
