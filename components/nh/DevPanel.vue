<template>
  <div
    class="fixed inset-0 z-50 flex items-end"
    :style="{ background: `rgba(0,0,0,${panel.scrimOpacity})` }"
    @click.self="$emit('close')"
  >
    <div
      class="w-full overflow-y-auto"
      :style="{
        maxHeight: '85vh',
        background: `rgba(18,15,13,${panel.bgOpacity})`,
        backdropFilter: `blur(${panel.blur}px)`,
        WebkitBackdropFilter: `blur(${panel.blur}px)`,
        borderTop: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '20px 20px 0 0',
        padding: '20px 20px 40px'
      }"
    >
      <!-- Header -->
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px">
        <span style="color: #e0c27a; font-family: 'Spectral', Georgia, serif; font-size: 1.1rem; font-weight: 500">NH UI Glass Effect Tuner</span>
        <button @click="$emit('close')" style="color: #9a9085; font-size: 1.3rem; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center">✕</button>
      </div>

      <p style="color: #dddad6; font-size: 0.78rem; line-height: 1.5; margin-bottom: 20px">
        Fine-tune the blur and transparency of NanoHive's translucent surfaces — this panel, the cinematic background, app bar, hamburger drawer, and mini player. Adjustments preview live right away. Tap "Save to Slot…" then a slot below to keep a look; tap a slot normally any time to switch back to it. Unsaved adjustments reset the next time you restart the app.
      </p>

      <!-- This Panel section -->
      <div style="margin-bottom: 24px">
        <p style="color: #dddad6; font-size: 0.68rem; letter-spacing: 0.10em; text-transform: uppercase; margin-bottom: 10px">This Panel</p>

        <div style="margin-bottom: 18px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px">
            <span style="color: #f4eee2; font-size: 0.82rem">Background Opacity</span>
            <span style="color: #e0c27a; font-size: 0.85rem; font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; font-weight: 600">{{ panel.bgOpacity.toFixed(2) }}</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" :value="panel.bgOpacity" style="width: 100%; accent-color: #e0c27a; height: 4px" @input="setPanel('bgOpacity', $event.target.value)" />
          <div style="display: flex; justify-content: space-between; color: #9a9085; font-size: 0.62rem; margin-top: 3px"><span>0</span><span>1</span></div>
        </div>

        <div style="margin-bottom: 18px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px">
            <span style="color: #f4eee2; font-size: 0.82rem">Scrim Opacity</span>
            <span style="color: #e0c27a; font-size: 0.85rem; font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; font-weight: 600">{{ panel.scrimOpacity.toFixed(2) }}</span>
          </div>
          <input type="range" min="0" max="1" step="0.01" :value="panel.scrimOpacity" style="width: 100%; accent-color: #e0c27a; height: 4px" @input="setPanel('scrimOpacity', $event.target.value)" />
          <div style="display: flex; justify-content: space-between; color: #9a9085; font-size: 0.62rem; margin-top: 3px"><span>0</span><span>1</span></div>
        </div>

        <div style="margin-bottom: 18px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px">
            <span style="color: #f4eee2; font-size: 0.82rem">Blur</span>
            <span style="color: #e0c27a; font-size: 0.85rem; font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; font-weight: 600">{{ panel.blur }}px</span>
          </div>
          <input type="range" min="0" max="40" step="1" :value="panel.blur" style="width: 100%; accent-color: #e0c27a; height: 4px" @input="setPanel('blur', $event.target.value)" />
          <div style="display: flex; justify-content: space-between; color: #9a9085; font-size: 0.62rem; margin-top: 3px"><span>0px</span><span>40px</span></div>
        </div>
      </div>

      <!-- CSS var control groups -->
      <div v-for="group in controlGroups" :key="group.label" style="margin-bottom: 24px">
        <p style="color: #dddad6; font-size: 0.68rem; letter-spacing: 0.10em; text-transform: uppercase; margin-bottom: 10px">{{ group.label }}</p>

        <div v-for="ctrl in group.items" :key="ctrl.prop" style="margin-bottom: 18px">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px">
            <span style="color: #f4eee2; font-size: 0.82rem">{{ ctrl.label }}</span>
            <span style="color: #e0c27a; font-size: 0.85rem; font-variant-numeric: tabular-nums; min-width: 52px; text-align: right; font-weight: 600">{{ fmt(ctrl) }}</span>
          </div>
          <input
            type="range"
            :min="ctrl.min"
            :max="ctrl.max"
            :step="ctrl.step"
            :value="values[ctrl.prop]"
            style="width: 100%; accent-color: #e0c27a; height: 4px"
            @input="apply(ctrl, $event.target.value)"
          />
          <div style="display: flex; justify-content: space-between; color: #9a9085; font-size: 0.62rem; margin-top: 3px">
            <span>{{ ctrl.min }}{{ ctrl.unit }}</span>
            <span>{{ ctrl.max }}{{ ctrl.unit }}</span>
          </div>
        </div>
      </div>

      <!-- Save slots: tap normally to load/apply that slot (for A/B testing
           between saved looks); tap while save mode is armed (below) to save
           the current live tuning into that slot instead. -->
      <div style="display: flex; gap: 10px; margin-bottom: 10px">
        <button
          v-for="slot in slotList"
          :key="slot.key"
          :class="{ 'nh-tuner-armed-pulse': saveMode }"
          style="flex: 1; height: 40px; border-radius: 12px; border: 1px solid rgba(224,194,122,0.35); background: rgba(224,194,122,0.08); color: #e0c27a; font-size: 0.82rem; font-weight: 600"
          @click="onSlotClick(slot.key)"
        >
          {{ slot.label }}
        </button>
      </div>

      <!-- Reset / Save buttons -->
      <div style="display: flex; gap: 10px">
        <button
          style="flex: 1; height: 44px; border-radius: 12px; border: 1px solid rgba(224,194,122,0.35); background: rgba(224,194,122,0.12); color: #e0c27a; font-size: 0.88rem; font-weight: 600"
          @click="resetAll"
        >
          Reset to Defaults
        </button>
        <button
          style="flex: 1; height: 44px; border-radius: 12px; border: 1px solid rgba(224,194,122,0.60); background: #e0c27a; color: #181512; font-size: 0.88rem; font-weight: 600"
          @click="toggleSaveMode"
        >
          {{ saveMode ? 'Cancel' : 'Save to Slot…' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { NH_GLASS_EFFECT_CONTROLS } from '@/store/index'

// Shared with layouts/default.vue's applyNhCustomizations(), which needs
// the same unit metadata to correctly reapply saved values on mount — see
// store/index.js for why this lives there instead of being duplicated.
const CONTROLS = NH_GLASS_EFFECT_CONTROLS

const panelState = { bgOpacity: 0.56, scrimOpacity: 0.56, blur: 21 }

const SLOT_LIST = [
  { key: 'slot1', label: 'Slot 1' },
  { key: 'slot2', label: 'Slot 2' },
  { key: 'slot3', label: 'Slot 3' }
]

export default {
  data() {
    // Read CSS vars from documentElement inline styles so sliders match reality on
    // reopen — these are already correct even on a fresh app launch, since
    // layouts/default.vue's applyNhCustomizations() re-applies any saved
    // nhGlassEffect.cssVars to the same properties before this panel can be opened.
    const values = {}
    CONTROLS.forEach((c) => {
      const live = document.documentElement.style.getPropertyValue(c.prop).trim()
      values[c.prop] = live !== '' ? parseFloat(live) : c.default
    })
    // This panel's own backdrop isn't a global CSS var layout.vue can restore on
    // launch, so on the first open each session, seed panelState from whatever was
    // last saved (if anything) rather than always starting from its hardcoded
    // defaults. Written back into the module-level const too so a reopen later in
    // the same session (without a Save in between) still reflects it.
    const savedPanel = this.$store.state.nhSettings?.nhGlassEffect?.panel
    if (savedPanel) Object.assign(panelState, savedPanel)
    return {
      panel: { ...panelState },
      values,
      // true while armed by "Save to Slot…" — the next slot tap saves into
      // it instead of loading it. Tapping "Cancel" (same button) clears this
      // without saving anything.
      saveMode: false
    }
  },
  computed: {
    controlGroups() {
      const map = {}
      CONTROLS.forEach((c) => {
        if (!map[c.group]) map[c.group] = { label: c.group, items: [] }
        map[c.group].items.push(c)
      })
      return Object.values(map)
    },
    slotList() {
      return SLOT_LIST
    }
  },
  methods: {
    fmt(ctrl) {
      const v = this.values[ctrl.prop]
      return ctrl.unit ? `${v}${ctrl.unit}` : parseFloat(v).toFixed(2)
    },
    setPanel(key, rawVal) {
      const num = parseFloat(rawVal)
      this.$set(this.panel, key, num)
      panelState[key] = num
    },
    apply(ctrl, rawVal) {
      const num = parseFloat(rawVal)
      this.$set(this.values, ctrl.prop, num)
      document.documentElement.style.setProperty(ctrl.prop, ctrl.unit ? `${num}${ctrl.unit}` : String(num))
    },
    resetAll() {
      // Resets only the live preview, same as before Save existed — doesn't
      // touch any already-saved nhGlassEffect, so closing without hitting
      // Save afterward leaves the previously-saved look intact for next launch.
      Object.assign(panelState, { bgOpacity: 0.97, scrimOpacity: 0.55, blur: 0 })
      this.panel = { ...panelState }
      CONTROLS.forEach((c) => {
        this.$set(this.values, c.prop, c.default)
        document.documentElement.style.setProperty(c.prop, c.unit ? `${c.default}${c.unit}` : String(c.default))
      })
    },
    toggleSaveMode() {
      this.saveMode = !this.saveMode
    },
    onSlotClick(slotKey) {
      if (this.saveMode) {
        this.saveMode = false
        this.saveToSlot(slotKey)
      } else {
        this.loadSlot(slotKey)
      }
    },
    loadSlot(slotKey) {
      const slots = this.$store.state.nhSettings?.nhGlassEffectSlots || {}
      const snapshot = slots[slotKey]
      const label = SLOT_LIST.find((s) => s.key === slotKey)?.label || slotKey
      if (!snapshot) {
        this.$toast.info(`${label} is empty — tune your settings and tap Save to Slot… to store them here`)
        return
      }
      this.applySnapshot(snapshot)
      // Also becomes the "currently active" snapshot layout.vue restores on
      // next launch — loading a slot is meant to actually switch to it, not
      // just preview it once.
      this.persistSettings({ nhGlassEffect: snapshot })
    },
    // Applies a saved snapshot's exact numbers to the live sliders/CSS vars.
    // Deliberately never merges in CONTROLS' current hardcoded defaults for
    // keys the snapshot already has — a future update changing those
    // defaults must never silently alter an already-saved slot. A control
    // added in a later version that a snapshot predates simply keeps
    // whatever this session already has for it (i.e. today's default).
    applySnapshot(snapshot) {
      Object.entries(snapshot.cssVars || {}).forEach(([prop, val]) => {
        this.$set(this.values, prop, val)
        const ctrl = CONTROLS.find((c) => c.prop === prop)
        document.documentElement.style.setProperty(prop, ctrl?.unit ? `${val}${ctrl.unit}` : String(val))
      })
      if (snapshot.panel) {
        this.panel = { ...snapshot.panel }
        Object.assign(panelState, snapshot.panel)
      }
    },
    async saveToSlot(slotKey) {
      const cssVars = {}
      CONTROLS.forEach((c) => { cssVars[c.prop] = this.values[c.prop] })
      const snapshot = { cssVars, panel: { ...this.panel } }
      const slots = { ...(this.$store.state.nhSettings?.nhGlassEffectSlots || {}), [slotKey]: snapshot }
      await this.persistSettings({ nhGlassEffectSlots: slots, nhGlassEffect: snapshot })
      const label = SLOT_LIST.find((s) => s.key === slotKey)?.label || slotKey
      this.$toast.success(`Saved to ${label}`)
    },
    async persistSettings(patch) {
      Object.entries(patch).forEach(([key, value]) => {
        this.$store.commit('setNhSetting', { key, value })
      })
      const saved = (await this.$localStore.getNhSettings()) || {}
      await this.$localStore.setNhSettings({ ...saved, ...this.$store.state.nhSettings })
    }
  }
}
</script>

<style scoped>
/* Reuses the same amber accent + glow treatment already used elsewhere
   (e.g. the player's play button box-shadow) rather than a new visual
   language — just animated back and forth to read as "armed", without
   needing an actual finger/cursor on the button. */
@keyframes nh-tuner-armed-pulse {
  0%,
  100% {
    box-shadow: none;
    border-color: rgba(224, 194, 122, 0.35);
  }
  50% {
    box-shadow: 0 0 16px rgba(224, 194, 122, 0.45);
    border-color: #e0c27a;
  }
}
.nh-tuner-armed-pulse {
  animation: nh-tuner-armed-pulse 1.8s ease-in-out infinite;
}
</style>
