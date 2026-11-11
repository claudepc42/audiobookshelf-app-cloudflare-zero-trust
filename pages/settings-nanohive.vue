<template>
  <div class="w-full h-full px-4 py-6 overflow-y-auto">
    <p class="text-xs mb-6" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhSettingsIntro }}</p>

    <!-- NH source: panelSearch() (enhancements.js:1332-1348) — a live filter over
         the settings, essential once there are this many. Ported at our own
         section granularity (NH hides whole "cards"; we hide whole labeled
         sections) rather than per-row, and via direct ref/style.display
         manipulation matching NH's real technique instead of forcing this
         through Vue's own reactivity system for a large template refactor. -->
    <div class="relative mb-6">
      <span class="material-symbols absolute" style="left: 10px; top: 50%; transform: translateY(-50%); font-size: 1.1rem; color: var(--nh-muted-2, #8a8075)">search</span>
      <input
        ref="searchInput"
        v-model="panelSearch"
        type="text"
        :placeholder="$strings.LabelNhSearchSettings"
        class="w-full text-sm rounded-lg py-2 pl-8 pr-8"
        style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: var(--nh-text-2, #d8cfc2)"
        @input="filterSections"
      />
      <button v-if="panelSearch" type="button" class="absolute" style="right: 8px; top: 50%; transform: translateY(-50%)" @click="clearPanelSearch">
        <span class="material-symbols" style="font-size: 1.1rem; color: var(--nh-muted-2, #8a8075)">close</span>
      </button>
    </div>
    <p v-if="panelSearch && noSectionsMatch" class="text-xs mb-4" style="color: var(--nh-muted-2, #8a8075)">{{ noMatchText }}</p>

    <div id="nh-server-features" data-section>
      <!-- NanoHive server features: whether the features that need a NanoHive server on the other end are shown -->
      <p class="uppercase text-xs font-semibold mb-1" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhServerFeatures }}</p>
      <p class="text-xs mb-3" style="color: var(--nh-muted-2, #8a8075)">{{ $strings.LabelNhServerFeaturesHelp }}</p>
      <div class="flex flex-wrap gap-2 mb-2">
        <button
          v-for="opt in serverModeOptions"
          :key="opt.value"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: settings.nhServerMode === opt.value ? 'var(--nh-amber, #e0c27a)' : 'var(--nh-muted, #9a9085)',
            background: settings.nhServerMode === opt.value ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: settings.nhServerMode === opt.value ? '1px solid var(--nh-amber, #e0c27a)' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('nhServerMode', opt.value)"
        >
          {{ opt.text }}
        </button>
      </div>
      <p class="text-xs mb-6" style="color: var(--nh-muted, #9a9085)">{{ serverStatusText }}</p>
    </div>

    <div data-section>
      <!-- Branding & Style -->
      <p class="uppercase text-xs font-semibold mb-3" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhBrandingStyle }}</p>

      <p class="text-sm mb-2" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhAccentColour }}</p>
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
          <span class="material-symbols text-base" style="color: var(--nh-text-2, #d8cfc2)">palette</span>
        </label>
      </div>

      <p class="text-sm mb-2 mt-5" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhBaseTheme }}</p>
      <div class="grid grid-cols-3 gap-2 mb-5">
        <button
          v-for="(theme, key) in baseThemes"
          :key="key"
          type="button"
          class="rounded-lg text-xs font-semibold py-3 px-2 text-center"
          :style="{
            background: theme.canvas,
            color: '#f4eee2',
            border: settings.baseTheme === key ? '2px solid var(--nh-amber, #e0c27a)' : '2px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('baseTheme', key)"
        >
          {{ theme.name }}
        </button>
      </div>

      <p class="text-sm mb-2" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhMainFont }}</p>
      <div class="flex flex-wrap gap-2 mb-5">
        <button
          v-for="font in googleFonts"
          :key="font"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            fontFamily: font,
            color: settings.mainFont === font ? '#fff' : 'var(--nh-muted, #9a9085)',
            background: settings.mainFont === font ? 'rgba(255,255,255,0.10)' : 'transparent',
            border: settings.mainFont === font ? '1px solid var(--nh-amber, #e0c27a)' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('mainFont', font)"
        >
          {{ font }}
        </button>
      </div>

      <div class="py-3 flex items-center">
        <div class="pr-4 flex-1">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhFontSizeScale }}</p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhFontSizeScaleHelp }}</p>
        </div>
        <ui-text-input type="number" :value="settings.fontScale" step="0.05" min="0.8" max="1.3" style="width: 90px" @input="updateNumberSetting('fontScale', $event, 0.8, 1.3)" />
      </div>

      <div class="py-3 flex items-center">
        <div class="pr-4 flex-1">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhDrawerFontScale }}</p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhDrawerFontScaleHelp }}</p>
        </div>
        <ui-text-input type="number" :value="settings.drawerFontScale" step="0.05" min="0.8" max="1.3" style="width: 90px" @input="updateNumberSetting('drawerFontScale', $event, 0.8, 1.3)" />
      </div>

      <div class="py-3 flex items-center">
        <p class="pr-4 flex-1" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhCustomLogo }}</p>
      </div>
      <div class="flex items-center gap-2 mb-3">
        <ui-text-input :value="settings.logoUrl" :placeholder="$strings.LabelNhLogoPlaceholder" clearable class="flex-1" @input="updateSetting('logoUrl', $event)" />
        <!-- Admins: uploads go through the same admin-gated NH DAV path as series
             covers/avatars, so it becomes the server's shared logo for everyone.
             Everyone else: the picked image is only ever converted to a local data
             URL and saved to this device's own logoUrl — we don't control the NH
             server code, and its logo-write endpoint is admin-only there too, so a
             non-admin's pick can only ever be a this-app-only preference, not
             something written back to the server. Either way, a plain URL is still
             supported by typing/pasting one directly above. -->
        <ui-btn v-if="nhThemeActive" small color="bg bg-opacity-50" :padding-x="2" :loading="logoSaving" style="height: 44px; width: 44px" @click="pickLogo">
          <span class="material-symbols" style="font-size: 1.2rem">photo_camera</span>
        </ui-btn>
        <input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoPicked" />
      </div>

      <div v-if="nhServerOn" class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('useServerLogo', !settings.useServerLogo)">
          <ui-toggle-switch :value="settings.useServerLogo" @input="updateSetting('useServerLogo', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhUseServerLogo }}<span class="text-xs pl-2" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhUseServerLogoHelp }}</span></p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('colorizeLogo', !settings.colorizeLogo)">
          <ui-toggle-switch :value="settings.colorizeLogo" @input="updateSetting('colorizeLogo', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhColorizeLogo }}</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('finishedBadgeUsesAccent', !settings.finishedBadgeUsesAccent)">
          <ui-toggle-switch :value="settings.finishedBadgeUsesAccent" @input="updateSetting('finishedBadgeUsesAccent', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhFinishedBadgeAccent }}</p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhFinishedBadgeAccentHelp }}</p>
        </div>
      </div>
    </div>

    <div data-section>
      <!-- Home & Carousel -->
      <p class="uppercase text-xs font-semibold mb-3 mt-8" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhHomeCarousel }}</p>

      <div class="py-3 flex items-center">
        <p class="pr-4 flex-1" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhCarouselTiming }}</p>
        <ui-text-input type="number" :value="settings.carouselTiming" min="0" max="60" style="width: 90px" @input="updateNumberSetting('carouselTiming', $event, 0, 60)" />
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('greetingUsesAccent', !settings.greetingUsesAccent)">
          <ui-toggle-switch :value="settings.greetingUsesAccent" @input="updateSetting('greetingUsesAccent', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhGreetingAccent }}</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('showCustomRecentSeries', !settings.showCustomRecentSeries)">
          <ui-toggle-switch :value="settings.showCustomRecentSeries" @input="updateSetting('showCustomRecentSeries', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhExpandedRecentSeries }}</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('customSeriesCards', !settings.customSeriesCards)">
          <ui-toggle-switch :value="settings.customSeriesCards" @input="updateSetting('customSeriesCards', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhStackedSeriesCovers }}</p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockHeroCarousel') }" @click="updateSetting('showHeroCarousel', !settings.showHeroCarousel)">
          <ui-toggle-switch :value="settings.showHeroCarousel" @input="updateSetting('showHeroCarousel', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHomeCarousel }}<span v-if="isLocked('lockHeroCarousel')" class="text-xs pl-2" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhLockedByAdmin }}</span></p>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('cinematicBg', !settings.cinematicBg)">
          <ui-toggle-switch :value="settings.cinematicBg" @input="updateSetting('cinematicBg', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhCinematicBackground }}</p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhCinematicBackgroundHelp }}</p>
        </div>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('autoplaySeries', !settings.autoplaySeries)">
          <ui-toggle-switch :value="settings.autoplaySeries" @input="updateSetting('autoplaySeries', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhAutoplaySeries }}</p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhAutoplaySeriesHelp }}</p>
        </div>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockGlobalSearch') }" @click="updateSetting('crossLibrarySearch', !settings.crossLibrarySearch)">
          <ui-toggle-switch :value="settings.crossLibrarySearch" @input="updateSetting('crossLibrarySearch', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhCrossLibrarySearch }}<span v-if="isLocked('lockGlobalSearch')" class="text-xs pl-2" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhLockedByAdmin }}</span></p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhCrossLibrarySearchHelp }}</p>
        </div>
      </div>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('showFinishedBookTools', !settings.showFinishedBookTools)">
          <ui-toggle-switch :value="settings.showFinishedBookTools" @input="updateSetting('showFinishedBookTools', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhFinishedBookTools }}</p>
      </div>

      <div v-if="nhServerOn" class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('showRateFinished', !settings.showRateFinished)">
          <ui-toggle-switch :value="settings.showRateFinished" @input="updateSetting('showRateFinished', $event)" />
        </div>
        <div class="pl-4">
          <p style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhRateFinishedShelf }}</p>
          <p class="text-xs" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhRateFinishedShelfHelp }}</p>
        </div>
      </div>

      <p class="text-sm mb-2 mt-3" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhContinueReadingShelf }}</p>
      <div class="flex flex-wrap gap-2 mb-3">
        <button
          v-for="mode in continueReadingModes"
          :key="mode.value"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: settings.continueReadingMode === mode.value ? 'var(--nh-amber, #e0c27a)' : 'var(--nh-muted, #9a9085)',
            background: settings.continueReadingMode === mode.value ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: settings.continueReadingMode === mode.value ? '1px solid var(--nh-amber, #e0c27a)' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('continueReadingMode', mode.value)"
        >
          {{ mode.text }}
        </button>
      </div>

      <div class="py-3 flex items-center">
        <p class="pr-4 flex-1" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhRecentSeriesCount }}</p>
        <ui-text-input type="number" :value="settings.recentSeriesCount" min="1" max="50" style="width: 90px" @input="updateNumberSetting('recentSeriesCount', $event, 1, 50, true)" />
      </div>

      <p class="text-xs uppercase mb-2 mt-4" style="color: var(--nh-muted-2, #8a8075); letter-spacing: 0.08em">{{ $strings.HeaderNhReorderHomeShelves }}</p>
      <div v-for="(key, index) in orderedSectionKeys" :key="key" class="flex items-center py-1.5">
        <p class="flex-1" style="color: var(--nh-text-2, #d8cfc2)">{{ sectionLabels[key] }}</p>
        <button type="button" class="w-8 h-8 flex items-center justify-center" :disabled="index === 0" :style="{ opacity: index === 0 ? 0.3 : 1 }" @click="moveSection(index, -1)">
          <span class="material-symbols text-xl" style="color: var(--nh-text-2, #d8cfc2)">arrow_upward</span>
        </button>
        <button type="button" class="w-8 h-8 flex items-center justify-center" :disabled="index === orderedSectionKeys.length - 1" :style="{ opacity: index === orderedSectionKeys.length - 1 ? 0.3 : 1 }" @click="moveSection(index, 1)">
          <span class="material-symbols text-xl" style="color: var(--nh-text-2, #d8cfc2)">arrow_downward</span>
        </button>
      </div>
      <button v-if="settings.homeOrder && settings.homeOrder.length" type="button" class="text-xs mb-4 mt-1" style="color: var(--nh-muted, #9a9085)" @click="updateSetting('homeOrder', [])">{{ $strings.ButtonNhResetOrder }}</button>

      <p class="text-xs uppercase mb-2 mt-4" style="color: var(--nh-muted-2, #8a8075); letter-spacing: 0.08em">{{ $strings.HeaderNhHideHomeShelves }}</p>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeRecentlyAdded', !settings.hideHomeRecentlyAdded)">
          <ui-toggle-switch :value="settings.hideHomeRecentlyAdded" @input="updateSetting('hideHomeRecentlyAdded', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRecentlyAdded }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeRecentSeries', !settings.hideHomeRecentSeries)">
          <ui-toggle-switch :value="settings.hideHomeRecentSeries" @input="updateSetting('hideHomeRecentSeries', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRecentSeries }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeContinueSeries', !settings.hideHomeContinueSeries)">
          <ui-toggle-switch :value="settings.hideHomeContinueSeries" @input="updateSetting('hideHomeContinueSeries', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideContinueSeries }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeListenAgain', !settings.hideHomeListenAgain)">
          <ui-toggle-switch :value="settings.hideHomeListenAgain" @input="updateSetting('hideHomeListenAgain', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideListenAgain }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeDiscover', !settings.hideHomeDiscover)">
          <ui-toggle-switch :value="settings.hideHomeDiscover" @input="updateSetting('hideHomeDiscover', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideDiscover }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideHomeNewAuthors', !settings.hideHomeNewAuthors)">
          <ui-toggle-switch :value="settings.hideHomeNewAuthors" @input="updateSetting('hideHomeNewAuthors', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideNewAuthors }}</p>
      </div>
    </div>

    <div v-if="nhServerOn" data-section>
      <!-- Community Ratings -->
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhCommunityRatings }}</p>
      <p class="text-xs mb-3" style="color: var(--nh-muted-2, #8a8075)">{{ $strings.LabelNhCommunityRatingsHelp }}</p>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockRatings') }" @click="updateSetting('showRatings', !settings.showRatings)">
          <ui-toggle-switch :value="settings.showRatings" @input="updateSetting('showRatings', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhEnableRatings }}<span v-if="isLocked('lockRatings')" class="text-xs pl-2" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhLockedByAdmin }}</span></p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" :class="{ 'opacity-40 pointer-events-none': isLocked('lockCardRatings') }" @click="updateSetting('showCardRatings', !settings.showCardRatings)">
          <ui-toggle-switch :value="settings.showCardRatings" @input="updateSetting('showCardRatings', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhCardRatings }}<span v-if="isLocked('lockCardRatings')" class="text-xs pl-2" style="color: var(--nh-muted, #9a9085)">{{ $strings.LabelNhLockedByAdmin }}</span></p>
      </div>

      <p class="text-sm mb-2 mt-3" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhRatingPrecision }}</p>
      <div class="flex flex-wrap gap-2 mb-3">
        <button
          v-for="opt in starStepOptions"
          :key="opt.value"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: settings.starStep === opt.value ? 'var(--nh-amber, #e0c27a)' : 'var(--nh-muted, #9a9085)',
            background: settings.starStep === opt.value ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: settings.starStep === opt.value ? '1px solid var(--nh-amber, #e0c27a)' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="updateSetting('starStep', opt.value)"
        >
          {{ opt.text }}
        </button>
      </div>

      <p v-if="libraries.length > 1" class="text-xs uppercase mb-2 mt-4" style="color: var(--nh-muted-2, #8a8075); letter-spacing: 0.08em">{{ $strings.HeaderNhPerLibraryOverride }}</p>
      <div v-for="lib in libraries" :key="lib.id" class="flex items-center py-1.5">
        <p class="flex-1" style="color: var(--nh-text-2, #d8cfc2)">{{ lib.name }}</p>
        <ui-toggle-switch :value="isRatingLibOn(lib.id)" @input="setRatingLibOverride(lib.id, $event)" />
      </div>
    </div>

    <div data-section>
      <!-- Book Lookup Sites -->
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhBookLookupSites }}</p>
      <p class="text-xs mb-3" style="color: var(--nh-muted-2, #8a8075)">{{ $strings.LabelNhBookLookupSitesHelp }}</p>
      <div class="flex flex-wrap gap-2 mb-6">
        <button
          v-for="site in bookSites"
          :key="site.id"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm"
          :style="{
            color: isBookSiteSelected(site.id) ? 'var(--nh-amber, #e0c27a)' : 'var(--nh-muted, #9a9085)',
            background: isBookSiteSelected(site.id) ? 'rgba(224,194,122,0.12)' : 'transparent',
            border: isBookSiteSelected(site.id) ? '1px solid var(--nh-amber, #e0c27a)' : '1px solid rgba(255,255,255,0.10)'
          }"
          @click="toggleBookSite(site.id)"
        >
          {{ site.name }}
        </button>
      </div>
      <button v-if="settings.bookSites !== null" type="button" class="text-xs mb-4 -mt-4" style="color: var(--nh-muted, #9a9085)" @click="updateSetting('bookSites', null)">{{ $strings.ButtonNhResetLanguageDefault }}</button>
    </div>

    <div data-section>
      <!-- Sidebar Menus -->
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhSidebarMenus }}</p>
      <p class="text-xs mb-3" style="color: var(--nh-muted-2, #8a8075)">{{ $strings.LabelNhSidebarMenusHelp }}</p>

      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailSeries', !settings.hideRailSeries)">
          <ui-toggle-switch :value="settings.hideRailSeries" @input="updateSetting('hideRailSeries', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRailSeries }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailCollections', !settings.hideRailCollections)">
          <ui-toggle-switch :value="settings.hideRailCollections" @input="updateSetting('hideRailCollections', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRailCollections }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailAuthors', !settings.hideRailAuthors)">
          <ui-toggle-switch :value="settings.hideRailAuthors" @input="updateSetting('hideRailAuthors', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRailAuthors }}</p>
      </div>
      <div class="flex items-center py-2">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailNarrators', !settings.hideRailNarrators)">
          <ui-toggle-switch :value="settings.hideRailNarrators" @input="updateSetting('hideRailNarrators', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRailNarrators }}</p>
      </div>
      <div class="flex items-center py-2 mb-6">
        <div class="w-10 flex justify-center" @click="updateSetting('hideRailStats', !settings.hideRailStats)">
          <ui-toggle-switch :value="settings.hideRailStats" @input="updateSetting('hideRailStats', $event)" />
        </div>
        <p class="pl-4" style="color: var(--nh-text-2, #d8cfc2)">{{ $strings.LabelNhHideRailStats }}</p>
      </div>
    </div>

    <!-- Server Defaults — admin only. NH source: nhSrvSave/nhSrvClear/lock toggles
         (enhancements.js:1582-1704). Selective per-group saving (NH's own
         look/home/pages checkboxes) is simplified to save-everything here. Kept
         out of the searchable/filterable section list — an admin-only block
         showing zero rows when a search term doesn't match it would read as a
         bug ("where did Server Defaults go?"), not filtering working correctly. -->
    <template v-if="isAdminOrUp && nhThemeActive && nhServerOn">
      <p class="uppercase text-xs font-semibold mb-1 mt-8" style="color: var(--nh-amber, #e0c27a); letter-spacing: 0.08em">{{ $strings.HeaderNhServerDefaults }}</p>
      <p class="text-xs mb-3" style="color: var(--nh-muted-2, #8a8075)">{{ $strings.LabelNhServerDefaultsHelp }}</p>
      <div class="flex gap-2 mb-2">
        <ui-btn small color="primary" :loading="srvSaving" @click="saveServerDefaults">{{ $strings.ButtonNhSaveServerDefault }}</ui-btn>
        <ui-btn small color="bg bg-opacity-50" :loading="srvSaving" @click="clearServerDefaults">{{ $strings.ButtonNhClearServerDefault }}</ui-btn>
      </div>
      <p v-if="srvStatus" class="text-xs mb-4" style="color: var(--nh-muted, #9a9085)">{{ srvStatus }}</p>

      <p class="text-xs uppercase mb-2 mt-4" style="color: var(--nh-muted-2, #8a8075); letter-spacing: 0.08em">{{ $strings.HeaderNhForceOffForEveryone }}</p>
      <div v-for="lock in serverLocks" :key="lock.key" class="flex items-center py-1.5">
        <p class="flex-1" style="color: var(--nh-text-2, #d8cfc2)">{{ lock.label }}</p>
        <ui-toggle-switch :value="isLocked(lock.key)" @input="setLock(lock.key, $event)" />
      </div>
    </template>
  </div>
</template>

<script>
import { Filesystem, Directory } from '@capacitor/filesystem'
import { NH_BASE_THEMES, NH_GOOGLE_FONTS, NH_PRESET_COLORS, NH_BOOK_SITES, nhRatingsLibOn } from '@/store/index'

const LOGO_EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }

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
        { value: 'combine', text: this.$strings.LabelNhContinueReadingCombine },
        { value: 'separate', text: this.$strings.LabelNhContinueReadingSeparate },
        { value: 'hidden', text: this.$strings.LabelNhContinueReadingHidden }
      ],
      // NH source: star-step select (enhancements.js:1287-1294) — values/order ported exactly.
      starStepOptions: [
        { value: 1, text: this.$strings.LabelNhStarsFull },
        { value: 0.5, text: this.$strings.LabelNhStarsHalf },
        { value: 0.25, text: this.$strings.LabelNhStarsQuarter }
      ],
      serverLocks: [
        { key: 'lockRatings', label: this.$strings.LabelNhLockRatings },
        { key: 'lockCardRatings', label: this.$strings.LabelNhLockCardRatings },
        { key: 'lockGlobalSearch', label: this.$strings.LabelNhCrossLibrarySearch },
        { key: 'lockHeroCarousel', label: this.$strings.LabelNhHomeCarousel }
      ],
      srvSaving: false,
      srvStatus: '',
      logoSaving: false,
      panelSearch: '',
      noSectionsMatch: false,
      sectionLabels: {
        'continue-listening': this.$strings.LabelNhShelfContinueListening,
        'recently-added': this.$strings.LabelNhShelfRecentlyAdded,
        'recent-series': this.$strings.LabelNhShelfRecentSeries,
        'continue-series': this.$strings.LabelNhShelfContinueSeries,
        'listen-again': this.$strings.LabelNhShelfListenAgain,
        discover: this.$strings.LabelNhShelfDiscover,
        'new-authors': this.$strings.LabelNhShelfNewestAuthors
      }
    }
  },
  computed: {
    settings() {
      return this.$store.state.nhSettings
    },
    noMatchText() {
      return this.$strings.MessageNhNoSettingsMatch.replace('{0}', () => this.panelSearch)
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
    // False when this server has no NanoHive backend, or the server features are set to Always hide
    nhServerOn() {
      return this.$store.getters.nhServerFeaturesOn
    },
    serverModeOptions() {
      return [
        { value: 'auto', text: this.$strings.LabelNhServerModeAuto },
        { value: 'show', text: this.$strings.LabelNhServerModeShow },
        { value: 'hide', text: this.$strings.LabelNhServerModeHide }
      ]
    },
    serverStatusText() {
      const backend = this.$store.state.nhBackend
      if (backend === 'present') return this.$strings.LabelNhServerStatusFound
      if (backend === 'absent') return this.$strings.LabelNhServerStatusNotFound
      return this.$strings.LabelNhServerStatusUnknown
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
        // The user's own values, not what an admin lock is forcing in memory
        const pushed = { ...this.settings, ...this.$store.state.nhLockedOriginals }
        // Never leak per-device/session-only or personal state into the shared server default:
        // the glass tuner, this app's own on/off flag and text size, the local profile photo, the
        // "use the server's logo" opt-in, and the shared-ranking opt-in
        ;['themeVersion', 'nhGlassEffect', 'nhGlassEffectSlots', 'active', 'drawerFontScale', 'localAvatarDataUrl', 'useServerLogo', 'familyStats', 'nhServerMode'].forEach((k) => delete pushed[k])
        // NanoHive web applies the page switches (the cinematic background) to every user, so keep
        // the server's own value rather than this phone's
        if (Object.prototype.hasOwnProperty.call(existing, 'cinematicBg')) pushed.cinematicBg = existing.cinematicBg
        else delete pushed.cinematicBg
        // Lock flags stay as they are on the server (they're not in pushed)
        const merged = { ...existing, ...pushed }
        await this.putServerConfig(merged)
        this.$store.commit('setNhServerConfig', merged)
        this.srvStatus = this.$strings.MessageNhSaved
      } catch (e) {
        this.srvStatus = this.$strings.MessageNhCouldNotSave
      }
      this.srvSaving = false
    },
    async clearServerDefaults() {
      this.srvSaving = true
      this.srvStatus = ''
      try {
        await this.putServerConfig({})
        this.$store.commit('setNhServerConfig', {})
        this.srvStatus = this.$strings.MessageNhCleared
      } catch (e) {
        this.srvStatus = this.$strings.MessageNhCouldNotClear
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
    // For the number fields: typing "12" on the way to "1.2" must not apply 12 (or write storage) on
    // every keystroke. The value is clamped to the range the label states and saved once typing pauses.
    updateNumberSetting(key, raw, min, max, integer = false) {
      const n = Number(raw)
      if (raw === '' || !Number.isFinite(n)) return
      let value = Math.min(max, Math.max(min, n))
      if (integer) value = Math.round(value)
      clearTimeout(this.numberSettingTimers[key])
      this.numberSettingTimers[key] = setTimeout(() => this.updateSetting(key, value), 600)
    },
    async updateSetting(key, value) {
      this.$store.commit('setNhSetting', { key, value })
      await this.$store.dispatch('saveNhSettings')
    },
    pickLogo() {
      this.$refs.logoInput.click()
    },
    onLogoPicked(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = ''
      if (!file) return
      if (file.size > 2 * 1024 * 1024) {
        this.$toast.error(this.$strings.ToastNhLogoTooBig)
        return
      }
      const ext = LOGO_EXT_BY_MIME[file.type]
      if (!ext) {
        this.$toast.error(this.$strings.ToastNhLogoWrongType)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        if (this.isAdminOrUp && this.nhServerOn) {
          const base64 = reader.result.split(',')[1]
          this.saveLogo(base64, ext)
        } else {
          // Non-admins: the NH server's logo-write endpoint is admin-only (same as
          // avatars), and we don't control that server code — so this can only ever
          // be a this-device preference, saved as a plain data URL, never uploaded.
          this.updateSetting('logoUrl', reader.result)
        }
      }
      reader.readAsDataURL(file)
    },
    async saveLogo(base64, ext) {
      this.logoSaving = true
      // Same reasoning as account.vue's avatar upload: CapacitorHttp's `data` isn't
      // auto-decoded from base64 for a raw binary body, so write real bytes to a
      // temp file first and upload that file's URI with dataType: 'file'.
      const tempPath = `nh-logo-upload-${Date.now()}.tmp`
      try {
        const written = await Filesystem.writeFile({ path: tempPath, data: base64, directory: Directory.Cache })
        await this.$nativeHttp.request('PUT', `/_nh/data/logo.${ext}`, written.uri, {
          headers: { 'Content-Type': 'application/octet-stream' },
          dataType: 'file'
        })
        const serverAddress = this.$store.getters['user/getServerAddress']
        await this.updateSetting('logoUrl', `${serverAddress}/_nh/logo.${ext}`)
      } catch (e) {
        this.$toast.error(this.$strings.ToastNhLogoSaveFailed)
      }
      try {
        await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache })
      } catch (e) {}
      this.logoSaving = false
    },
    // The app-wide font link (layouts/default.vue) only ever loads the
    // currently-active mainFont, so every other button in this picker fell
    // back to the default font until clicked (which swaps that single link's
    // href). Preload every font's webface here so all previews render in
    // their real typeface immediately, not just the selected one.
    preloadFontPreviews() {
      // Regular weight only: a preview just shows the font's name in its own typeface
      const families = this.googleFonts.filter((f) => f.toLowerCase() !== 'spectral').map((f) => `family=${f.replace(/ /g, '+')}`)
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
  created() {
    this.numberSettingTimers = {}
  },
  beforeDestroy() {
    Object.values(this.numberSettingTimers).forEach(clearTimeout)
  },
  watch: {
    // The toast button opens this page again while it is already showing
    '$route.query.section'(section) {
      if (section === 'server') this.$nextTick(() => this.$el.querySelector('#nh-server-features')?.scrollIntoView())
    }
  },
  mounted() {
    this.preloadFontPreviews()
    // Opened from the "needs a NanoHive server" toast
    if (this.$route.query.section === 'server') {
      this.$nextTick(() => this.$el.querySelector('#nh-server-features')?.scrollIntoView())
    }
  }
}
</script>
