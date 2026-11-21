// SwiftUI's numericText content transition, for the web.
//
// Text is split into glyphs, each keyed by its place: digits by place value around the decimal
// mark (so 1,259 → 1,592 rolls three digits in place instead of shuffling them), the text
// between numbers by where it sits next to them. When the text changes, only glyphs whose key
// now holds another character move: the old one leaves upwards with a blur while the new one
// rises from below (the other way when the value goes down). Glyphs that appear rise in, glyphs
// that go leave where they stood, and the rest slide to their new places (FLIP). Like Apple's,
// the places start one after another from the right: 11 → 22 rolls the ones, then the tens. The
// figure's own width follows on the same spring, so whatever stands beside it glides along
// instead of jumping when the number gets longer or shorter.
//
// Built for sliders: changes are applied at most once a frame, and every figure on the page
// measures and writes in shared passes, so a page full of them lays out three times a frame, not
// three times per figure. A digit still rolling in leaves from wherever it is, and glyphs already
// on their way out hurry when the next one follows, so fast drags never pile up (and nothing pops
// away). The roll also keeps pace with the changes: a place that changes again soon after its last
// roll rolls shorter and travels less, and the new glyph starts partly there. Like SwiftUI's, the
// blur stays with the movement, so a place changing every frame (a slider dragged fast) reads as a
// soft motion blur instead of vanishing, and turns sharp the moment it rests; the places that hold
// still stay crisp, and a change after a pause gets the whole roll again. The slides and the width
// are additive: each change adds only its own shift on top of the ones still running, so a slider
// moving on never restarts a rearrangement that is under way. (The width moves as a margin, which
// may be negative while the figure grows; a width may not.)

/** How long a glyph takes to come in and to slide; leaving is quicker. */
const ENTER_MS = 600
const LEAVE_MS = 420
/** How far a glyph travels, how small it gets and how soft, at the far end of its roll. */
const RISE_EM = 0.6
const SHRINK = 0.8
const BLUR_EM = 0.16
/** The delay from one changed place to the next one left of it, and the most a change staggers. */
const STAGGER_MS = 40
const STAGGER_MAX_MS = 200
/**
 * The quickest roll, for a place that changes again and again: shorter and a smaller rise, the blur
 * kept. The new glyph comes in partly there already, so the place blurs in motion rather than going blank.
 */
const RAPID_ENTER_MS = 220
const RAPID_LEAVE_MS = 110
const RAPID_RISE_EM = 0.3
const RAPID_SHRINK = 0.9
const RAPID_BLUR_EM = 0.08
const RAPID_START_OPACITY = 0.5
/** How many glyphs a rapidly changing place lets leave at once, so it never smears into a stack. */
const RAPID_MAX_LEAVING = 2
/** Gaps between changes: this short or shorter rolls rapidly, this long or longer gets the whole roll. */
const RAPID_GAP_MS = 80
const CALM_GAP_MS = 450
/** While the whole figure changes this many times faster than a calm pace, every place rolls quickly. */
const DRAG_SPAN = 4
/** How much faster glyphs already leaving go once another follows them; how many are kept at most. */
const HURRY = 3
const MAX_LEAVING = 4
const MAX_GONE = 12
/** The curve where CSS `linear()` is missing. */
const EASE_OUT = 'cubic-bezier(.2,.7,.2,1)'

/** Digits with the marks that group them: . , ' ’ and the no-break, narrow no-break and thin spaces. */
const NUMBER = /\d+(?:[.,'’   ]\d+)*/g

const SLOT_STYLE = 'position:relative;display:inline-block'
const GLYPH_STYLE = 'display:inline-block'
/** A digit on its way out sits over its place while the new one comes in. */
const LEAVING_STYLE = 'display:inline-block;position:absolute;top:0;left:0;right:0;text-align:center;pointer-events:none'
/** A place that went: out of the flow, fading where it stood. */
const GONE_STYLE = 'position:absolute;pointer-events:none'
/** The plain text for screen readers, out of sight. */
const LABEL_STYLE = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;user-select:none;-webkit-user-select:none'

export interface NumericTextGlyph { key: string, char: string }
export interface ParsedNumericText { glyphs: NumericTextGlyph[], numbers: number[] }

interface Slot { key: string, char: string, el: HTMLSpanElement, glyph: HTMLSpanElement, changed: number }
type Look = Keyframe
/** How one roll moves: 0 rapid (a quick, sharp flick), 1 calm (the whole soft roll). */
type Pace = number

/** The pace for a change `gap` ms after the last one, eased so it shifts gently between the two. */
function paceOf(gap: number): Pace {
  const t = Math.min(1, Math.max(0, (gap - RAPID_GAP_MS) / (CALM_GAP_MS - RAPID_GAP_MS)))
  return t * t * (3 - 2 * t)
}
const mix = (rapid: number, calm: number, pace: Pace) => rapid + (calm - rapid) * pace

/** A spring without bounce, like SwiftUI's `.smooth` (0.5s), drawn as a CSS `linear()` curve. */
let easing: string | undefined
function spring() {
  if (easing) return easing
  const supported = typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)')
  if (!supported) return (easing = EASE_OUT)
  const w = (2 * Math.PI) / 0.5
  const points = Array.from({ length: 31 }, (_, i) => {
    const t = (i / 30) * (ENTER_MS / 1000)
    return i === 30 ? 1 : Math.round((1 - (1 + w * t) * Math.exp(-w * t)) * 10000) / 10000
  })
  return (easing = `linear(${points.join(', ')})`)
}

const decimals = new Map<string, string>()

/**
 * The decimal mark a locale writes ("," for `de`, "." for `en`). Without a locale, the one of
 * the runtime's own.
 */
export function decimalMark(locale?: string): string {
  const cached = decimals.get(locale ?? '')
  if (cached) return cached
  let mark = '.'
  try {
    mark = new Intl.NumberFormat(locale).formatToParts(1.5).find(p => p.type === 'decimal')?.value ?? '.'
  }
  catch { /* not a locale Intl knows: "." */ }
  decimals.set(locale ?? '', mark)
  return mark
}

/** A number as text, the way `Intl.NumberFormat` writes it. */
export function formatNumericText(value: number, locale?: string, format?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(locale, format).format(value)
  }
  catch {
    return new Intl.NumberFormat(undefined, format).format(value)
  }
}

/**
 * Splits text into keyed glyphs. Numbers are counted from the end, so a prefix that comes or goes
 * ("−", "€") leaves the number's keys alone; the text before a number is keyed from the number
 * leftwards, text after the last number from there rightwards (" ct", " dB" keep their keys).
 */
export function parseNumericText(text: string, decimal = '.'): ParsedNumericText {
  const parts: Array<{ number: boolean, text: string }> = []
  let at = 0
  for (const m of text.matchAll(NUMBER)) {
    const index = m.index ?? 0
    if (index > at) parts.push({ number: false, text: text.slice(at, index) })
    parts.push({ number: true, text: m[0] })
    at = index + m[0].length
  }
  if (at < text.length) parts.push({ number: false, text: text.slice(at) })

  const glyphs: NumericTextGlyph[] = []
  const numbers: number[] = []
  let numbersAfter = parts.filter(p => p.number).length
  parts.forEach((part, i) => {
    const chars = [...part.text]
    if (!part.number) {
      // Before a number: keyed by distance to it. After the last one: by distance from it.
      const trailing = numbersAfter === 0
      chars.forEach((char, j) => glyphs.push({ key: trailing ? `t${j}` : `l${numbersAfter - 1}.${chars.length - 1 - j}`, char }))
      return
    }
    numbersAfter--
    const n = numbersAfter
    const point = chars.lastIndexOf(decimal)
    const intEnd = point < 0 ? chars.length : point
    chars.forEach((char, j) => {
      const key = j < intEnd ? `n${n}.i${intEnd - 1 - j}` : j === intEnd ? `n${n}.d` : `n${n}.f${j - intEnd - 1}`
      glyphs.push({ key, char })
    })
    const digits = chars.map((char, j) => (j === point ? '.' : char >= '0' && char <= '9' ? char : '')).join('')
    const before = parts[i - 1]
    const negative = !!before && !before.number && /[-−]$/.test(before.text)
    numbers.push((negative ? -1 : 1) * Number(digits))
  })
  return { glyphs, numbers }
}

/** Which way the change goes: the value if given, else the first number that differs, read from the left. */
function directionOf(from: ParsedNumericText, to: ParsedNumericText, fromValue?: number, toValue?: number) {
  if (fromValue !== undefined && toValue !== undefined && fromValue !== toValue) return toValue > fromValue ? 1 : -1
  if (from.numbers.length === to.numbers.length) {
    for (let i = 0; i < to.numbers.length; i++) {
      if (to.numbers[i] !== from.numbers[i]) return to.numbers[i]! > from.numbers[i]! ? 1 : -1
    }
  }
  return 1
}

/** A glyph at the far end of its roll: below the line when `side` is 1, above it when -1. */
const away = (side: number, pace: Pace): Look => ({
  transform: `translateY(${mix(RAPID_RISE_EM, RISE_EM, pace) * side}em) scale(${mix(RAPID_SHRINK, SHRINK, pace)})`,
  filter: `blur(${mix(RAPID_BLUR_EM, BLUR_EM, pace)}em)`,
  opacity: 0,
})
const settled: Look = { transform: 'none', filter: 'blur(0px)', opacity: 1 }

/** How a glyph looks right now, mid-roll or not, so leaving can start from there. */
function lookOf(el: Element): Look {
  const s = getComputedStyle(el)
  return { transform: s.transform, filter: s.filter === 'none' ? 'blur(0px)' : s.filter, opacity: s.opacity }
}

function glyphEl(char: string) {
  const el = document.createElement('span')
  el.className = 'nt-glyph'
  el.style.cssText = GLYPH_STYLE
  el.textContent = char
  return el
}

function slotOf(key: string, char: string): Slot {
  const el = document.createElement('span')
  el.className = 'nt-slot'
  el.style.cssText = SLOT_STYLE
  const glyph = glyphEl(char)
  el.append(glyph)
  return { key, char, el, glyph, changed: -Infinity }
}

/** The animations running on these elements. Asked for while measuring: asking between writes lays the page out again. */
function animationsOf(els: Iterable<Element>) {
  const list: Animation[] = []
  for (const el of els) list.push(...el.getAnimations())
  return list
}

/** Glyphs on their way out speed up instead of vanishing when the next change comes. */
function hurry(animations: Animation[]) {
  for (const a of animations) if (a.playbackRate < HURRY) a.updatePlaybackRate(HURRY)
}

function leave(el: HTMLElement, from: Look, dir: number, delay: number, pace: Pace) {
  const a = el.animate([from, away(-dir, pace)], { duration: mix(RAPID_LEAVE_MS, LEAVE_MS, pace), delay, easing: spring(), fill: 'both' })
  a.finished.then(() => el.remove(), () => {})
  return a
}

function enter(el: HTMLElement, dir: number, delay: number, pace: Pace) {
  const from = { ...away(dir, pace), opacity: RAPID_START_OPACITY * (1 - pace) }
  el.animate([from, settled], { duration: mix(RAPID_ENTER_MS, ENTER_MS, pace), delay, easing: spring(), fill: 'backwards' })
}

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The language the element is written in, from the nearest `lang` attribute. */
const langOf = (el: Element) => el.closest('[lang]')?.getAttribute('lang') || undefined

// --- One shared frame for every figure on the page: all reads, then all writes, twice ---

interface Job { measure(): void, mutate(): void, size(): void, fit(): void, place(): void, animate(): void }
const queue = new Set<Job>()
let frame = 0

function run() {
  frame = 0
  const jobs = [...queue]
  queue.clear()
  for (const j of jobs) j.measure()
  for (const j of jobs) j.mutate()
  for (const j of jobs) j.size()
  for (const j of jobs) j.fit()
  for (const j of jobs) j.place()
  for (const j of jobs) j.animate()
}

export interface NumericTextOptions {
  /**
   * The locale the text is written in (BCP 47, "de", "en-GB"): it tells the decimal mark from
   * the grouping marks, and formats numbers given to `show`. Default: the nearest `lang`
   * attribute around the element.
   */
  locale?: string
  /** The decimal mark, when it should not come from the locale. */
  decimal?: string
  /** How numbers given to `show` are written (`Intl.NumberFormat` options). */
  format?: Intl.NumberFormatOptions
  /** Sets `font-variant-numeric: tabular-nums` on the element, so digits roll in place. Default true. */
  tabular?: boolean
  /** Swaps the text at once for people who prefer reduced motion. Default true. */
  respectReducedMotion?: boolean
}

export interface NumericTextShowOptions {
  /** The value shown, when the digits alone don't say which way it went (a countdown, negative dB). */
  value?: number
  /** `false` swaps the text at once. */
  animate?: boolean
}

export interface NumericText {
  /** Shows a text, or a number written by `Intl.NumberFormat`. Only what changed moves. */
  show(content: string | number, options?: NumericTextShowOptions): void
  /** Changes options; they apply from the next `show`. */
  configure(options: NumericTextOptions): void
  /** The text shown, or about to be. */
  readonly text: string
  /** Stops pending work. The element keeps the last text. */
  destroy(): void
}

/**
 * The styles the element itself needs. `createNumericText` sets them; a server-rendered
 * element can carry them from the start, so nothing shifts when the script arrives.
 */
export function numericTextStyle(tabular = true): { display: string, whiteSpace: string, fontVariantNumeric?: string } {
  return tabular
    ? { display: 'inline-block', whiteSpace: 'pre', fontVariantNumeric: 'tabular-nums' }
    : { display: 'inline-block', whiteSpace: 'pre' }
}

/**
 * Turns an element into a figure that changes like SwiftUI's `.contentTransition(.numericText())`.
 * The element's text, if it has any, is shown as it stands; every `show` after that rolls only
 * the glyphs that changed.
 */
export function createNumericText(root: HTMLElement, options: NumericTextOptions = {}): NumericText {
  let config = { ...options }
  /** The glyphs at their natural width; `root` around them keeps the old width's room on a spring. */
  const line = document.createElement('span')
  line.className = 'nt-line'
  line.style.cssText = SLOT_STYLE
  line.setAttribute('aria-hidden', 'true')
  /** What screen readers get: the plain text, whole. */
  const label = document.createElement('span')
  label.className = 'nt-label'
  label.style.cssText = LABEL_STYLE

  let slots: Slot[] = []
  let shown: ParsedNumericText = { glyphs: [], numbers: [] }
  let shownText = ''
  let shownValue: number | undefined
  /** Bumped when the count of numbers changes ("Any" → "2:45–5:00"): then every glyph rolls. */
  let generation = 0
  let next: { text: string, value?: number, decimal: string } | null = null
  /** When the figure last changed, and how fast it is changing now (for places new to the change). */
  let lastChange = -Infinity
  let pace: Pace = 1
  /** The width's own animations, so a rebuild can drop them and nothing else on the element. */
  const fits = new Set<Animation>()

  // What one frame's change works with, from measuring to animating.
  let dir = 1
  let order: Slot[] = []
  /** `running`: what to cancel; `leaving`: glyphs already on their way out, to hurry. */
  let swaps: Array<{ slot: Slot, char: string, from: Look, old?: HTMLSpanElement, place: number, pace: Pace, running: Animation[], leaving: Animation[] }> = []
  let added: Array<{ slot: Slot, place: number }> = []
  let gone: Array<{ slot: Slot, rect: DOMRect, from: Look, place: number, running: Animation[] }> = []
  /** Places that went earlier and are still fading. */
  let goneBefore: Animation[] = []
  let before = new Map<Slot, DOMRect>()
  let after = new Map<Slot, DOMRect>()
  let lineAfter: DOMRect | undefined
  /** The natural width before the change and after it. */
  let widthBefore = 0
  let widthAfter = 0

  function keyed(parsed: ParsedNumericText) {
    return parsed.glyphs.map(g => ({ key: `${generation}:${g.key}`, char: g.char }))
  }

  function style() {
    const { fontVariantNumeric, ...rest } = numericTextStyle(config.tabular !== false)
    Object.assign(root.style, rest)
    if (fontVariantNumeric) root.style.fontVariantNumeric = fontVariantNumeric
    else if (root.style.fontVariantNumeric === 'tabular-nums') root.style.fontVariantNumeric = ''
  }

  function build(text: string, decimal: string, value?: number) {
    queue.delete(job)
    next = null
    // Nothing of ours runs before the first build, and asking would make the browser work out
    // the page's styles once per figure while a list of them mounts.
    if (slots.length) {
      for (const a of line.getAnimations({ subtree: true })) a.cancel()
      for (const a of fits) a.cancel()
      fits.clear()
    }
    shown = parseNumericText(text, decimal)
    shownText = text
    shownValue = value
    slots = keyed(shown).map(g => slotOf(g.key, g.char))
    line.replaceChildren(...slots.map(s => s.el))
    label.textContent = text
    if (line.parentNode !== root) root.replaceChildren(line, label)
  }

  const job: Job = {
    measure() {
      if (!next || !root.isConnected) return
      const parsed = parseNumericText(next.text, next.decimal)
      dir = directionOf(shown, parsed, shownValue, next.value)
      if (parsed.numbers.length !== shown.numbers.length) generation++
      shown = parsed
      shownText = next.text
      shownValue = next.value
      next = null
      // A fast run of changes (a dragged slider) quickens every place; a place that keeps changing
      // on its own quickens too, while one that has been still for a while gets the whole roll.
      const now = performance.now()
      pace = paceOf((now - lastChange) * DRAG_SPAN)
      lastChange = now

      const byKey = new Map(slots.map(s => [s.key, s]))
      order = []
      swaps = []
      added = []
      gone = []
      before = new Map()
      widthBefore = line.getBoundingClientRect().width
      // Places are counted from the right, where a number's ones are.
      const glyphs = keyed(parsed)
      glyphs.forEach((g, i) => {
        const place = glyphs.length - 1 - i
        const slot = byKey.get(g.key)
        if (!slot) {
          const fresh = slotOf(g.key, g.char)
          fresh.changed = now
          added.push({ slot: fresh, place })
          order.push(fresh)
          return
        }
        byKey.delete(g.key)
        if (slot.char !== g.char) {
          swaps.push({
            slot, char: g.char, from: lookOf(slot.glyph), place, pace: Math.min(pace, paceOf(now - slot.changed)),
            running: slot.glyph.getAnimations(), leaving: animationsOf(slot.el.querySelectorAll('.nt-leaving')),
          })
          slot.changed = now
        }
        before.set(slot, slot.el.getBoundingClientRect())
        order.push(slot)
      })
      slots.forEach((slot, i) => {
        if (!byKey.has(slot.key)) return
        gone.push({
          slot, rect: slot.el.getBoundingClientRect(), from: lookOf(slot.glyph), place: slots.length - 1 - i,
          running: [...slot.el.getAnimations(), ...slot.glyph.getAnimations()],
        })
      })
      goneBefore = gone.length ? animationsOf(line.querySelectorAll(':scope > .nt-gone .nt-glyph')) : []
    },
    mutate() {
      if (!order.length && !gone.length) return
      label.textContent = shownText
      for (const s of swaps) {
        const old = s.slot.glyph
        for (const a of s.running) a.cancel()
        hurry(s.leaving)
        old.classList.add('nt-leaving')
        old.style.cssText = LEAVING_STYLE
        const fresh = glyphEl(s.char)
        s.slot.el.append(fresh)
        s.slot.glyph = fresh
        s.slot.char = s.char
        s.old = old
        const leaving = s.slot.el.querySelectorAll('.nt-leaving')
        const keep = Math.round(mix(RAPID_MAX_LEAVING, MAX_LEAVING, s.pace))
        for (let i = 0; i < leaving.length - keep; i++) leaving[i]!.remove()
      }
      hurry(goneBefore)
      for (const g of gone) {
        // It stays where it was seen, slides included, now placed by left/top.
        for (const a of g.running) a.cancel()
        g.slot.el.classList.add('nt-gone')
        g.slot.el.style.cssText = GONE_STYLE
      }
      // Put the places in their new order; glyphs that are going stay where they are, out of flow.
      for (const slot of order) line.append(slot.el)
      const goneEls = line.querySelectorAll(':scope > .nt-gone')
      for (let i = 0; i < goneEls.length - MAX_GONE; i++) goneEls[i]!.remove()
      slots = order
    },
    size() {
      if (!order.length && !gone.length) return
      widthAfter = line.getBoundingClientRect().width
    },
    fit() {
      // The room it took before stays, as a margin on top of any still running, and eases away;
      // set now, so the glyphs are measured where they start from.
      const dw = widthBefore - widthAfter
      if ((order.length || gone.length) && Math.abs(dw) > 0.1) {
        const fit = root.animate([{ marginRight: `${dw}px` }, { marginRight: '0px' }], { duration: ENTER_MS, easing: spring(), composite: 'add' })
        fits.add(fit)
        const done = () => fits.delete(fit)
        fit.finished.then(done, done)
      }
    },
    place() {
      if (!order.length && !gone.length) return
      lineAfter = line.getBoundingClientRect()
      after = new Map(order.filter(s => before.has(s)).map(s => [s, s.el.getBoundingClientRect()]))
    },
    animate() {
      if (!lineAfter) return
      // The changed places start one after another from the right; a long change staggers less per place.
      const places = [...new Set([...swaps, ...added, ...gone].map(c => c.place))].sort((a, b) => a - b)
      // The stagger fades out as the pace quickens: a fast drag shows each value whole, at once.
      const step = places.length > 1 ? Math.min(STAGGER_MS, STAGGER_MAX_MS / (places.length - 1)) * pace : 0
      const delayOf = (place: number) => places.indexOf(place) * step
      for (const s of swaps) {
        if (s.old?.isConnected) leave(s.old, s.from, dir, delayOf(s.place), s.pace)
        enter(s.slot.glyph, dir, delayOf(s.place), s.pace)
      }
      for (const a of added) enter(a.slot.glyph, dir, delayOf(a.place), pace)
      for (const g of gone) {
        g.slot.el.style.left = `${g.rect.left - lineAfter.left}px`
        g.slot.el.style.top = `${g.rect.top - lineAfter.top}px`
        leave(g.slot.glyph, g.from, dir, delayOf(g.place), pace).finished.then(() => g.slot.el.remove(), () => {})
      }
      // Both measurements include the slides still running, so this is only the new shift; added
      // on top, it leaves those slides to finish on their own time.
      const curve = spring()
      for (const [slot, a] of after) {
        const dx = before.get(slot)!.left - a.left
        if (Math.abs(dx) > 0.1) slot.el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: ENTER_MS, easing: curve, composite: 'add' })
      }

      order = []
      swaps = []
      added = []
      gone = []
      lineAfter = undefined
    },
  }

  style()
  const initial = root.textContent ?? ''
  if (initial) {
    const locale = config.locale ?? langOf(root)
    build(initial, config.decimal ?? (locale ? decimalMark(locale) : '.'))
  }

  return {
    show(content, { value, animate } = {}) {
      const isNumber = typeof content === 'number'
      const locale = config.locale ?? langOf(root)
      // A number is written by Intl, so its mark is Intl's; a text without a known language is read with ".".
      const decimal = config.decimal ?? (isNumber || locale ? decimalMark(locale) : '.')
      const text = isNumber ? formatNumericText(content, locale, config.format) : content
      const to = value ?? (isNumber ? content : undefined)
      const still = animate === false || !slots.length || (config.respectReducedMotion !== false && prefersReducedMotion())
      if (still) return build(text, decimal, to)
      if (!next && text === shownText) {
        shownValue = to
        return
      }
      next = { text, value: to, decimal }
      queue.add(job)
      if (!frame) frame = requestAnimationFrame(run)
    },
    configure(options) {
      config = { ...config, ...options }
      style()
    },
    get text() {
      return next?.text ?? shownText
    },
    destroy() {
      queue.delete(job)
      next = null
    },
  }
}
