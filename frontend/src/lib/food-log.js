// The food log (Nutrition → Today): what was eaten, on which day and at which meal, how much,
// with the nutrients for that amount copied in, so a later fix to the food list never rewrites a
// day already logged.
//
//   S.foodLog = { [id]: { d: '2026-10-19', m: 0, f: 'u:01077', g: 250, s: 'cup', x: 1,
//                         k: 153, p: 7.9, c: 12, fa: 8.1, fb: 0, _ts }, … }
//     d   the day        m   the meal, an index into the profile's meal names
//     f   the food key ('u:…' USDA, 'in:…' Indian dish), or 'q' for a quick add (then n, its name)
//     g   grams eaten (a quick add has none); s and x: the portion picked and how many
//     k p c fa fb   kcal, protein, carbs, fat and fibre for that amount
//   S.savedMeals = { [id]: { name, items: [entry without d and m], _ts } }
//   S.foodDays   = { [iso]: { done: true, _ts } }   "Day complete", so a half-logged day can be
//                                                   told apart from a light one
//
// All three are stamped maps (lib/sync-merge.js STAMPED_MAPS): each entry keeps the time it was
// last written, two devices merge entry by entry, and a removal is a stamped empty entry
// (`{ _ts }`), never a deleted key, or it would come straight back from the other device.
import { uid, todayISO } from './format.js'
import { DEFAULT_MEALS, MAX_MEALS } from './nutrition-targets.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
// a hair over, so 4.95 (3.3 × 1.5, stored as 4.9499…) rounds up as on paper
const r1 = v => Math.round(v * 10 + 1e-9) / 10
const ISO = /^\d{4}-\d{2}-\d{2}$/
export const QUICK = 'q'

/** The meal names, in order (renamable, up to six). */
export function mealsOf(S) {
  const m = S?.nutrition?.meals
  return Array.isArray(m) && m.length ? m.slice(0, MAX_MEALS).map(x => String(x || '').trim() || '–') : [...DEFAULT_MEALS]
}

/** A live entry: one that was not removed and has what a total needs. */
export const isLive = e => isMap(e) && ISO.test(e.d || '') && Number.isFinite(e.k)

/** The nutrients `grams` of a food carry, as an entry stores them. */
export function nutrientsFor(food, grams) {
  const f = grams / 100
  return { k: Math.round(food.kcal * f), p: r1(food.p * f), c: r1(food.c * f), fa: r1(food.f * f), fb: r1((food.fib || 0) * f) }
}

/** A new entry for `grams` of `food`, or for `count` of one of its portions. */
export function foodEntry({ food, grams, portion = null, count = 1, meal = 0, d = todayISO() }) {
  const g = portion ? r1(portion[1] * count) : r1(grams)
  const e = { d, m: meal, f: food.key, g, ...(portion ? { s: portion[0], x: count } : {}), ...nutrientsFor(food, g) }
  if (!e.fb) delete e.fb
  return e
}

/** A quick add: calories and macros typed in, with an optional name. */
export function quickEntry({ kcal, p = 0, c = 0, fa = 0, name = '', meal = 0, d = todayISO() }) {
  const n = String(name || '').trim().slice(0, 60)
  return { d, m: meal, f: QUICK, ...(n ? { n } : {}), k: Math.max(0, Math.round(+kcal || 0)), p: r1(Math.max(0, +p || 0)), c: r1(Math.max(0, +c || 0)), fa: r1(Math.max(0, +fa || 0)) }
}

// Ids for entries logged together that keep their order: the day lists entries by id.
const batchIds = n => { const base = uid(); return Array.from({ length: n }, (_, i) => base + '-' + String(i).padStart(2, '0')) }

/** The map with `entry` written under `id` (a new id when none), stamped `now`. */
export const withEntry = (map, entry, id = uid(), now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { ...entry, _ts: now } })

/** The map with `id` removed: a stamped empty entry, so the removal syncs. */
export const withoutEntry = (map, id, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { _ts: now } })

/** The live entries of `iso`, as { id, ...entry }, in the order they were logged. */
export function entriesOn(S, iso) {
  const log = isMap(S?.foodLog) ? S.foodLog : {}
  return Object.keys(log).filter(id => log[id]?.d === iso && isLive(log[id])).sort().map(id => ({ id, ...log[id] }))
}

/** kcal, protein, carbs, fat and fibre added up. */
export function totalsOf(entries) {
  const t = { k: 0, p: 0, c: 0, fa: 0, fb: 0 }
  for (const e of entries) for (const k of Object.keys(t)) t[k] += Number(e[k]) || 0
  for (const k of Object.keys(t)) t[k] = k === 'k' ? Math.round(t[k]) : r1(t[k])
  return t
}

export const dayTotals = (S, iso) => totalsOf(entriesOn(S, iso))

/** The day's entries per meal: [{ meal, name, entries, totals }], every meal there even when empty. */
export function byMeal(S, iso) {
  const names = mealsOf(S)
  const entries = entriesOn(S, iso)
  return names.map((name, meal) => {
    // an entry whose meal was since removed lands in the last one
    const list = entries.filter(e => Math.min(Number(e.m) || 0, names.length - 1) === meal)
    return { meal, name, entries: list, totals: totalsOf(list) }
  })
}

/** The meal's entries of `fromIso` logged again on `toIso` (Copy yesterday's lunch). */
export function copyMeal(map, S, fromIso, meal, toIso, toMeal = meal, now = Date.now()) {
  let out = isMap(map) ? map : {}
  const from = byMeal(S, fromIso)[meal]?.entries || []
  const ids = batchIds(from.length)
  from.forEach((e, i) => {
    const { id, _ts, ...rest } = e
    out = withEntry(out, { ...rest, d: toIso, m: toMeal }, ids[i], now)
  })
  return out
}

/**
 * The foods eaten lately, most eaten first: Map of key → weight (each logging in the last
 * `days` counts, the newest a little more). Quick adds are left out; they have no food behind them.
 */
export function recentFoods(S, { days = 60, today = todayISO() } = {}) {
  const log = isMap(S?.foodLog) ? S.foodLog : {}
  const since = new Date(today + 'T12:00:00')
  since.setDate(since.getDate() - days)
  const from = since.toISOString().slice(0, 10)
  const out = new Map()
  for (const e of Object.values(log)) {
    if (!isLive(e) || e.f === QUICK || e.d < from || e.d > today) continue
    out.set(e.f, (out.get(e.f) || 0) + 1 + (e.d >= today ? 0.5 : 0))
  }
  return new Map([...out].sort((a, b) => b[1] - a[1]))
}

/** The portion an entry was logged in, the way the list reads it: "2 × roti" or "150 g". */
export function amountOf(e, tr = s => s) {
  if (e.s && e.x) return (e.x === 1 ? '' : fmtCount(e.x) + ' × ') + tr(e.s)
  return e.g ? Math.round(e.g) + ' g' : ''
}
const fmtCount = x => (Number.isInteger(x) ? String(x) : String(r1(x)))

/** Whether `iso` was marked complete. */
export const dayDone = (S, iso) => !!(isMap(S?.foodDays) && S.foodDays[iso]?.done)
export const withDayDone = (map, iso, done, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [iso]: done ? { done: true, _ts: now } : { _ts: now } })

/** The saved meals still there, by name. */
export function savedMealsOf(S) {
  const m = isMap(S?.savedMeals) ? S.savedMeals : {}
  return Object.keys(m).filter(id => m[id]?.name && Array.isArray(m[id].items) && m[id].items.length)
    .map(id => ({ id, ...m[id] })).sort((a, b) => a.name.localeCompare(b.name))
}

/** The map with a meal saved from entries (their day and meal left behind). */
export function withSavedMeal(map, name, entries, id = uid(), now = Date.now()) {
  const items = entries.map(({ id: _, _ts, d, m, ...rest }) => rest)
  return { ...(isMap(map) ? map : {}), [id]: { name: String(name || '').trim().slice(0, 60), items, _ts: now } }
}

/** A saved meal logged on `iso` at `meal`. */
export function logSavedMeal(map, saved, iso, meal, now = Date.now()) {
  let out = isMap(map) ? map : {}
  const ids = batchIds(saved.items.length)
  saved.items.forEach((it, i) => { out = withEntry(out, { ...it, d: iso, m: meal }, ids[i], now) })
  return out
}
