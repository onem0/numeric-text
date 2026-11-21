# numeric-text

SwiftUI's `numericText` content transition, for the web. When a number changes, only the digits that changed roll: the old digit leaves upwards with a soft blur while the new one rises from below, and the other way round when the value goes down. Everything else holds still, and the text beside the number glides along as it gets wider or narrower.

**Demo:** https://counter-demo.onemo.dev

- No dependencies, no stylesheet, under 4 kB minified and gzipped
- Works on any element; a Vue 3 / Nuxt component is included
- Made for sliders and live counters: changes land at most once a frame, and a digit that keeps changing rolls shorter and softer instead of piling up
- Takes any text, not only numbers (`"Track 3 of 12 · 2:45"`, `"−12.5 dB"`)
- Respects `prefers-reduced-motion`; screen readers get the plain text

## Install

```sh
npm i numeric-text
```

## JavaScript

```js
import { createNumericText } from 'numeric-text'

const price = createNumericText(document.querySelector('#price'))

price.show('€12.50') // only the digits that changed roll
price.show(1299)     // a number is written by Intl.NumberFormat
```

`createNumericText(element, options?)` takes the element over. Text it already holds is shown as it stands, so server-rendered text does not flash.

| Option | Default | |
|---|---|---|
| `locale` | the nearest `lang` attribute | The locale the text is written in. It tells the decimal mark from the grouping marks, and formats numbers given to `show`. |
| `decimal` | from the locale, else `.` | The decimal mark, when it should not come from the locale. |
| `format` | | `Intl.NumberFormat` options for numbers given to `show`. |
| `tabular` | `true` | Sets `font-variant-numeric: tabular-nums` on the element, so digits roll in place. |
| `respectReducedMotion` | `true` | Swaps the text at once for people who prefer reduced motion. |

It returns:

- `show(content, { value?, animate? })`: shows a string or a number. `value` says which way the change rolls when the digits alone don't (a text like `"1.2k"`). `animate: false` swaps at once.
- `configure(options)`: changes options from the next `show` on.
- `text`: the text shown.
- `destroy()`: stops pending work. The element keeps the last text.

## Vue and Nuxt

```vue
<script setup>
import { ref } from 'vue'
import { NumericText } from 'numeric-text/vue'

const players = ref(1259)
</script>

<template>
  <NumericText :value="players" />
  <NumericText :text="`${players} players`" />
  <NumericText :value="12.5" locale="de" :format="{ style: 'currency', currency: 'EUR' }" />
</template>
```

Props: `text`, `value`, `locale`, `decimal`, `format`, `tabular`, `animate`, `ignoreReducedMotion`, `tag` (default `span`). With `text`, `value` only gives the direction. Without it, `value` is written by `Intl.NumberFormat`.

The component renders plain text on the server. Pass `locale` there, so server and browser write the number the same way.

## Notes

- The element becomes `display: inline-block` with `white-space: pre`. Style the font, size and colour as usual.
- The effect looks best with tabular figures. If the font has none, digits of different widths still roll, and their neighbours slide.
- A roll leaves the line for a moment, by about 0.6em. A parent with `overflow: hidden` needs that much room, or it clips the roll.
- The glyphs are spans with the classes `nt-slot` and `nt-glyph` inside an `aria-hidden` line; the plain text sits beside it for assistive technology.
- Browsers: anything with the Web Animations API. Where CSS `linear()` easing is missing, a cubic-bezier curve stands in for the spring.
- Digits are the ASCII digits 0–9.

## Development

```sh
npm test       # builds, then runs the tests
npm run demo   # builds the demo page into site/
```

## Licence

MIT
