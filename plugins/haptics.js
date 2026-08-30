import Vue from "vue";
import { Haptics, ImpactStyle } from "@capacitor/haptics"

const hapticsImpactHeavy = async () => {
  await Haptics.impact({ style: ImpactStyle.Heavy })
}

const hapticsImpactMedium = async () => {
  await Haptics.impact({ style: ImpactStyle.Medium })
}

const hapticsImpactLight = async () => {
  await Haptics.impact({ style: ImpactStyle.Light })
}

export default ({ store }, inject) => {
  inject('hapticsImpact', () => {
    const hapticFeedback = store.state.globals.hapticFeedback
    if (hapticFeedback === 'OFF') return
    if (hapticFeedback === 'LIGHT') return hapticsImpactLight()
    if (hapticFeedback === 'MEDIUM') return hapticsImpactMedium()
    return hapticsImpactHeavy()
  })
}
