import { createNumericText } from './dist/index.js'

const $ = id => document.getElementById(id)
const reduced = matchMedia('(prefers-reduced-motion: reduce)')

// --- The big one: steps, runs while held, and counts up once when the page opens ---

const HERO_MAX = 999_999
const hero = createNumericText($('hero'))
let count = 0

/** The count-up under way, if any; a press of anything takes over from it. */
let counting = 0

function setCount(to, fromRun = 0) {
  if (fromRun !== counting) counting = 0
  count = Math.min(HERO_MAX, Math.max(0, Math.round(to)))
  hero.show(count)
}

function countTo(target, ms) {
  if (reduced.matches) return setCount(target)
  const from = count
  const start = performance.now()
  const run = (counting = start)
  const tick = (now) => {
    if (counting !== run) return
    const t = Math.min(1, (now - start) / ms)
    setCount(from + (target - from) * (1 - (1 - t) ** 4), run)
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** A press steps once; holding runs, faster and in larger steps the longer it lasts. */
function hold(button, dir) {
  let timer = 0
  let ticks = 0
  const stop = () => {
    clearTimeout(timer)
    timer = 0
    delete button.dataset.held
  }
  const run = (delay) => {
    ticks++
    setCount(count + dir * (ticks > 70 ? 137 : ticks > 30 ? 13 : 1))
    timer = setTimeout(run, Math.max(45, delay * 0.86), Math.max(45, delay * 0.86))
  }
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    stop()
    ticks = 0
    button.dataset.held = ''
    setCount(count + dir)
    timer = setTimeout(run, 380, 190)
  })
  for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(type, stop)
  // The keyboard and assistive tech click without a pointer.
  button.addEventListener('click', (e) => { if (e.detail === 0) setCount(count + dir) })
  button.addEventListener('contextmenu', e => e.preventDefault())
}
hold($('less'), -1)
hold($('more'), 1)

$('shuffle').addEventListener('click', () => {
  const digits = 2 + Math.floor(Math.random() * 4)
  setCount(10 ** (digits - 1) + Math.random() * 9 * 10 ** (digits - 1))
})

document.fonts.ready.then(() => setTimeout(() => countTo(1259, 1900), 250))

// --- The slider: a log scale from one copy to a hundred thousand ---

const PRICE = 4.99
const copies = createNumericText($('copies-fig'))
const total = createNumericText($('total-fig'), { format: { style: 'currency', currency: 'EUR' } })
const slider = $('copies')

function sold() {
  const n = Math.round(10 ** Number(slider.value))
  copies.show(n)
  total.show(Math.round(n * PRICE * 100) / 100)
  slider.setAttribute('aria-valuetext', `${n} copies`)
}
slider.addEventListener('input', sold)
sold()

// --- The clock ---

const clock = createNumericText($('clock'))
const two = n => String(n).padStart(2, '0')

function time(animate) {
  const now = new Date()
  clock.show(`${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`, { animate })
  setTimeout(time, 1000 - now.getMilliseconds() + 5, true)
}
time(false)

// --- Any text ---

const free = createNumericText($('free-fig'))
const input = $('free')
input.addEventListener('input', () => free.show(input.value))
for (const chip of document.querySelectorAll('.chips button')) {
  chip.addEventListener('click', () => {
    input.value = chip.dataset.text
    free.show(input.value)
  })
}

// --- Locales ---

const FIGURE = 1234567.89
const localeFig = createNumericText($('locale-fig'), { locale: 'en', format: { minimumFractionDigits: 2 } })
const segments = [...document.querySelectorAll('.segments button')]
for (const segment of segments) {
  segment.addEventListener('click', () => {
    for (const s of segments) s.setAttribute('aria-pressed', String(s === segment))
    localeFig.configure({ locale: segment.dataset.locale })
    localeFig.show(FIGURE)
  })
}

// --- Install ---

const copy = $('copy')
let copied = 0
copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('command').textContent)
    copy.textContent = 'Copied'
  }
  catch {
    copy.textContent = 'Select it'
    getSelection()?.selectAllChildren($('command'))
  }
  clearTimeout(copied)
  copied = setTimeout(() => { copy.textContent = 'Copy' }, 1800)
})

const tabs = [...document.querySelectorAll('[role="tab"]')]
function select(tab) {
  for (const t of tabs) {
    const on = t === tab
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    $(t.getAttribute('aria-controls')).hidden = !on
  }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => select(tab))
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    select(next)
    next.focus()
  })
}
