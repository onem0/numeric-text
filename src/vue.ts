// <NumericText> for Vue 3 and Nuxt: text with numbers in it that changes the way SwiftUI's
// numericText content transition does. Rendered as plain text on the server; the engine takes
// the element over once it is mounted.
import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { PropType } from 'vue'
import { createNumericText, decimalMark, formatNumericText, numericTextStyle } from './index.js'
import type { NumericText as Engine, NumericTextOptions } from './index.js'

export const NumericText = defineComponent({
  name: 'NumericText',
  props: {
    /** The text to show. Leave it out to show `value`, written by `Intl.NumberFormat`. */
    text: { type: String, default: undefined },
    /** The number shown. Beside `text` it only says which way a change rolls (negative dB, a countdown). */
    value: { type: Number, default: undefined },
    /** The locale the text is written in. Default: the nearest `lang` attribute. Set it when rendering on a server. */
    locale: { type: String, default: undefined },
    /** The decimal mark, when it should not come from the locale. */
    decimal: { type: String, default: undefined },
    /** How `value` is written (`Intl.NumberFormat` options). */
    format: { type: Object as PropType<Intl.NumberFormatOptions>, default: undefined },
    /** Digits of equal width, so they roll in place. */
    tabular: { type: Boolean, default: true },
    /** `false` swaps the text at once. */
    animate: { type: Boolean, default: true },
    /** Also roll for people who prefer reduced motion. */
    ignoreReducedMotion: { type: Boolean, default: false },
    tag: { type: String, default: 'span' },
  },
  setup(props) {
    const root = ref<HTMLElement>()
    let engine: Engine | undefined

    const written = () => props.text ?? (props.value === undefined ? '' : formatNumericText(props.value, props.locale, props.format))
    const options = (): NumericTextOptions => ({
      locale: props.locale,
      // A value written here uses the runtime's locale when none is given, so its mark is that one's.
      decimal: props.decimal ?? (props.text === undefined && !props.locale ? decimalMark() : undefined),
      tabular: props.tabular,
      respectReducedMotion: !props.ignoreReducedMotion,
    })
    /** Rendered once (on the server too); from then on the engine owns what is inside. */
    const initial = written()

    onMounted(() => {
      engine = createNumericText(root.value!, options())
      // The text may have changed between rendering and mounting.
      if (written() !== initial) engine.show(written(), { value: props.value, animate: false })
    })
    watch(() => [props.locale, props.decimal, props.tabular, props.ignoreReducedMotion, props.text === undefined], () => engine?.configure(options()))
    watch(() => [written(), props.value] as const, ([text, value]) => engine?.show(text, { value, animate: props.animate }))
    onBeforeUnmount(() => engine?.destroy())

    return () => h(props.tag, { ref: root, class: 'numeric-text', style: numericTextStyle(props.tabular) }, initial)
  },
})

export default NumericText
