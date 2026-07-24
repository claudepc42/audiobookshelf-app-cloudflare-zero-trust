<template>
  <div class="w-full h-full px-4 py-6 overflow-y-auto">
    <p class="text-xs mb-6" style="color: #9a9085">Personalise the look of your library. Changes save automatically.</p>

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
      <p class="pr-4 flex-1" style="color: #d8cfc2">Font Size</p>
      <ui-text-input type="number" :value="settings.fontScale" step="0.05" min="0.8" max="1.3" style="width: 90px" @input="updateSetting('fontScale', Number($event) || 1)" />
    </div>

    <div class="py-3 flex items-center">
      <p class="pr-4 flex-1" style="color: #d8cfc2">Custom Logo URL</p>
    </div>
    <ui-text-input :value="settings.logoUrl" placeholder="Leave empty for the default logo" clearable class="mb-3" @input="updateSetting('logoUrl', $event)" />

    <div class="flex items-center py-2">
      <div class="w-10 flex justify-center" @click="updateSetting('colorizeLogo', !settings.colorizeLogo)">
        <ui-toggle-switch :value="settings.colorizeLogo" @input="updateSetting('colorizeLogo', $event)" />
      </div>
      <p class="pl-4" style="color: #d8cfc2">Colorize Logo with Accent Colour</p>
    </div>

    <!-- Home & Carousel -->
    <p class="uppercase text-xs font-semibold mb-3 mt-8" style="color: #e0c27a; letter-spacing: 0.08em">Home &amp; Carousel</p>

    <div class="py-3 flex items-center">
      <p class="pr-4 flex-1" style="color: #d8cfc2">Carousel Auto-Advance (seconds, 0 disables)</p>
      <ui-text-input type="number" :value="settings.carouselTiming" min="0" max="60" style="width: 90px" @input="updateSetting('carouselTiming', Number($event) || 0)" />
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
      <div class="w-10 flex justify-center" @click="updateSetting('showHeroCarousel', !settings.showHeroCarousel)">
        <ui-toggle-switch :value="settings.showHeroCarousel" @input="updateSetting('showHeroCarousel', $event)" />
      </div>
      <p class="pl-4" style="color: #d8cfc2">Home Carousel</p>
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
    <div class="flex items-center py-2 mb-6">
      <div class="w-10 flex justify-center" @click="updateSetting('hideRailStats', !settings.hideRailStats)">
        <ui-toggle-switch :value="settings.hideRailStats" @input="updateSetting('hideRailStats', $event)" />
      </div>
      <p class="pl-4" style="color: #d8cfc2">Hide Stats</p>
    </div>
  </div>
</template>

<script>
import { NH_BASE_THEMES, NH_GOOGLE_FONTS, NH_PRESET_COLORS } from '@/store/index'

export default {
  data() {
    return {
      baseThemes: NH_BASE_THEMES,
      googleFonts: NH_GOOGLE_FONTS,
      presetColors: NH_PRESET_COLORS,
      continueReadingModes: [
        { value: 'combine', text: 'Combine into carousel' },
        { value: 'separate', text: 'Keep as separate shelf' },
        { value: 'hidden', text: 'Hidden' }
      ]
    }
  },
  computed: {
    settings() {
      return this.$store.state.nhSettings
    },
    isKnownAccent() {
      return this.presetColors.includes((this.settings.accentColor || '').toLowerCase())
    }
  },
  methods: {
    isAccent(color) {
      return (this.settings.accentColor || '').toLowerCase() === color.toLowerCase()
    },
    async updateSetting(key, value) {
      this.$store.commit('setNhSetting', { key, value })
      const saved = (await this.$localStore.getNhSettings()) || {}
      await this.$localStore.setNhSettings({ ...saved, ...this.$store.state.nhSettings })
    }
  }
}
</script>
