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
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px">
        <span style="color: #e0c27a; font-family: 'Spectral', Georgia, serif; font-size: 1.1rem; font-weight: 500">NH UI Tuner</span>
        <button @click="$emit('close')" style="color: #9a9085; font-size: 1.3rem; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center">✕</button>
      </div>

      <!-- This Panel section -->
      <div style="margin-bottom: 24px">
        <p style="color: #9a9085; font-size: 0.68rem; letter-spacing: 0.10em; text-transform: uppercase; margin-bottom: 10px">This Panel</p>

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
        <p style="color: #9a9085; font-size: 0.68rem; letter-spacing: 0.10em; text-transform: uppercase; margin-bottom: 10px">{{ group.label }}</p>

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

      <!-- Reset button -->
      <button
        style="width: 100%; height: 44px; border-radius: 12px; border: 1px solid rgba(224,194,122,0.35); background: rgba(224,194,122,0.12); color: #e0c27a; font-size: 0.88rem; font-weight: 600"
        @click="resetAll"
      >
        Reset to Defaults
      </button>
    </div>
  </div>
</template>

<script>
const CONTROLS = [
  { group: 'Cinematic Background', prop: '--nh-cinematic-brightness', label: 'Brightness', default: 0.55, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Appbar', prop: '--nh-appbar-opacity', label: 'Opacity', default: 0.70, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Appbar', prop: '--nh-appbar-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Drawer', prop: '--nh-drawer-opacity', label: 'Opacity', default: 0.60, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Drawer', prop: '--nh-drawer-blur', label: 'Blur', default: 32, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Mini Player', prop: '--nh-miniplayer-opacity', label: 'Opacity', default: 0.45, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Mini Player', prop: '--nh-miniplayer-blur', label: 'Blur', default: 28, min: 0, max: 60, step: 1, unit: 'px' },
  { group: 'Carousel', prop: '--nh-carousel-bg-brightness', label: 'Slide BG Brightness', default: 0.32, min: 0, max: 1, step: 0.01, unit: '' },
  { group: 'Carousel', prop: '--nh-carousel-gradient-bottom', label: 'Gradient Bottom Opacity', default: 0.88, min: 0, max: 1, step: 0.01, unit: '' },
]

const panelState = { bgOpacity: 0.97, scrimOpacity: 0.55, blur: 0 }

export default {
  data() {
    // Read CSS vars from documentElement inline styles so sliders match reality on reopen
    const values = {}
    CONTROLS.forEach((c) => {
      const live = document.documentElement.style.getPropertyValue(c.prop).trim()
      values[c.prop] = live !== '' ? parseFloat(live) : c.default
    })
    return {
      panel: { ...panelState },
      values
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
      Object.assign(panelState, { bgOpacity: 0.97, scrimOpacity: 0.55, blur: 0 })
      this.panel = { ...panelState }
      CONTROLS.forEach((c) => {
        this.$set(this.values, c.prop, c.default)
        document.documentElement.style.setProperty(c.prop, c.unit ? `${c.default}${c.unit}` : String(c.default))
      })
    }
  }
}
</script>
