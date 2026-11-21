import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decimalMark, formatNumericText, numericTextStyle, parseNumericText } from '../dist/index.js'

const keys = (text, decimal) => parseNumericText(text, decimal).glyphs.map(g => g.key)
const byKey = (text, decimal) => Object.fromEntries(parseNumericText(text, decimal).glyphs.map(g => [g.key, g.char]))

test('digits are keyed by place value, from the ones leftwards', () => {
  assert.deepEqual(keys('1,259'), ['n0.i4', 'n0.i3', 'n0.i2', 'n0.i1', 'n0.i0'])
  const from = byKey('1,259')
  const to = byKey('1,592')
  // The thousands and the comma hold still; three digits change in place.
  assert.deepEqual(Object.keys(to).filter(k => from[k] !== to[k]), ['n0.i2', 'n0.i1', 'n0.i0'])
})

test('a number that grows keeps the keys of the places it had', () => {
  const from = byKey('999')
  const to = byKey('1,000')
  assert.equal(to['n0.i0'], '0')
  assert.equal(from['n0.i0'], '9')
  assert.deepEqual(Object.keys(to).filter(k => !(k in from)), ['n0.i4', 'n0.i3'])
})

test('the decimal mark splits whole places from fractions', () => {
  assert.deepEqual(keys('12.50'), ['n0.i1', 'n0.i0', 'n0.d', 'n0.f0', 'n0.f1'])
  assert.deepEqual(keys('12,50', ','), ['n0.i1', 'n0.i0', 'n0.d', 'n0.f0', 'n0.f1'])
  assert.deepEqual(parseNumericText('1.234,56', ',').numbers, [1234.56])
  assert.deepEqual(parseNumericText('1,234.56').numbers, [1234.56])
})

test('a prefix that comes or goes leaves the number alone', () => {
  const plain = byKey('12 dB')
  const signed = byKey('−12 dB')
  for (const k of Object.keys(plain)) assert.equal(signed[k], plain[k])
  assert.deepEqual(parseNumericText('−12 dB').numbers, [-12])
  assert.deepEqual(parseNumericText('-0.5').numbers, [-0.5])
})

test('text after the last number is keyed from the number rightwards', () => {
  assert.deepEqual(keys('5 ct').slice(1), ['t0', 't1', 't2'])
  assert.deepEqual(byKey('5 ct')['t1'], byKey('50 ct')['t1'])
})

test('several numbers are counted from the end', () => {
  const parsed = parseNumericText('2:45–5:00')
  assert.deepEqual(parsed.numbers, [2, 45, 5, 0])
  assert.equal(parsed.glyphs[0].key, 'n3.i0')
  assert.equal(parsed.glyphs.at(-1).key, 'n0.i0')
})

test('grouping with spaces and apostrophes stays one number', () => {
  assert.deepEqual(parseNumericText('1 234 567').numbers, [1234567])
  assert.deepEqual(parseNumericText('1’234').numbers, [1234])
  assert.deepEqual(parseNumericText('3 of 12').numbers, [3, 12])
})

test('text without numbers is keyed in order', () => {
  assert.deepEqual(keys('Any'), ['t0', 't1', 't2'])
  assert.deepEqual(parseNumericText('').glyphs, [])
})

test('locales give their decimal mark', () => {
  assert.equal(decimalMark('de'), ',')
  assert.equal(decimalMark('en'), '.')
  assert.equal(decimalMark('not a locale'), '.')
})

test('numbers are written by Intl', () => {
  assert.equal(formatNumericText(1234.5, 'en'), '1,234.5')
  assert.equal(formatNumericText(1234.5, 'de'), '1.234,5')
  assert.equal(formatNumericText(0.5, 'en', { style: 'currency', currency: 'EUR' }), '€0.50')
})

test('the element styles carry tabular figures unless switched off', () => {
  assert.equal(numericTextStyle().fontVariantNumeric, 'tabular-nums')
  assert.equal('fontVariantNumeric' in numericTextStyle(false), false)
})
