// Meal plans (Nutrition → Meal plan): meals planned per weekday, or the same every day, the way
// the workout plan works. Decide once a week; logging then becomes a single tap.
//
//   S.mealPlans = { [id]: { name, mode: 'week' | 'same', days: { '0'…'6' | 'all': [[item…] per meal] }, _ts } }
//   S.mealDays  = { [iso]: { plan: id | 'none', _ts } }       one-off changes for a single date
//   S.nutrition.plan = id                                     the plan that applies by default
//
// An item is a food reference and an amount, never a nutrient copy, so a plan stays small:
//   { f: 'u:01077' | 'in:roti' | 'b:<barcode>', g, s?, x?, n }   n: its name, for Home's one line
//   { f: 'q', n, k, p, c, fa }                                   a quick add carries its numbers
// The numbers are worked out from the food list when shown, and copied into the log only when a
// planned meal is logged (lib/food-log.js). Every planned day is read against the same daily
// target: there are no training-day and rest-day targets.
//
// All three maps are stamped: a plan merges as one entry, a removal is a stamped empty entry.
import { uid, todayISO } from './format.js'
import { foodEntry, quickEntry, withEntry, entriesOn, mealsOf, nutrientsFor, totalsOf, QUICK } from './food-log.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const DAY = 86400000
const noon = iso => Date.parse(iso + 'T12:00:00')
export const addDays = (iso, n) => new Date(noon(iso) + n * DAY).toISOString().slice(0, 10)
export const weekdayOf = iso => new Date(noon(iso)).getDay()

/** The plans still there, by name: [{ id, name, mode, days }]. */
export function plansOf(S) {
  const m = isMap(S?.mealPlans) ? S.mealPlans : {}
  return Object.keys(m).filter(id => m[id]?.name && isMap(m[id].days)).map(id => ({ id, ...m[id] }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The plan that applies by default, if it still exists. */
export function defaultPlanId(S) {
  const id = S?.nutrition?.plan
  return id && plansOf(S).some(p => p.id === id) ? id : null
}

/** The plan for `iso`: its one-off choice, else the default. { id, plan, oneOff } or null. */
export function planOn(S, iso) {
  const day = isMap(S?.mealDays) ? S.mealDays[iso] : null
  const pick = day?.plan
  if (pick === 'none') return null
  const id = pick && plansOf(S).some(p => p.id === pick) ? pick : defaultPlanId(S)
  if (!id) return null
  return { id, plan: plansOf(S).find(p => p.id === id), oneOff: !!pick && pick === id }
}

/** The key of a plan's day for `iso`: the weekday, or 'all' for a plan that is the same every day. */
export const dayKeyOf = (plan, iso) => (plan?.mode === 'same' ? 'all' : String(weekdayOf(iso)))

/** A plan day's meals as [[item…], …], one list per meal of the profile (never short). */
export function mealsOfPlanDay(S, plan, key) {
  const names = mealsOf(S)
  const raw = Array.isArray(plan?.days?.[key]) ? plan.days[key] : []
  return names.map((_, m) => {
    // a plan made with more meals than the profile now has folds the extra ones into the last
    const list = m === names.length - 1 ? raw.slice(m).flat() : raw[m]
    return (Array.isArray(list) ? list : []).filter(it => it && typeof it.f === 'string')
  })
}

/** The meals planned for `iso`, or null when no plan applies. */
export function plannedOn(S, iso) {
  const p = planOn(S, iso)
  return p ? mealsOfPlanDay(S, p.plan, dayKeyOf(p.plan, iso)) : null
}

/** An item's numbers: from the food (looked up with `food(key)`), or its own for a quick add. */
export function itemNutrients(item, food) {
  if (item.f === QUICK) return { k: item.k || 0, p: item.p || 0, c: item.c || 0, fa: item.fa || 0, fb: 0 }
  const f = food(item.f)
  return f ? nutrientsFor(f, item.g || 0) : null
}

/** Planned meals added up: { k, p, c, fa, fb, missing } (missing: items whose food is not found). */
export function plannedTotals(meals, food) {
  const parts = []
  let missing = 0
  for (const it of meals.flat()) {
    const n = itemNutrients(it, food)
    if (n) parts.push(n); else missing++
  }
  return { ...totalsOf(parts), missing }
}

/** A planned item as a log entry for `d` and `meal`, its numbers copied in now. */
export function entryOf(item, food, { d, meal }) {
  if (item.f === QUICK) return quickEntry({ kcal: item.k, p: item.p, c: item.c, fa: item.fa, name: item.n, meal, d })
  const f = food(item.f)
  if (!f) return null
  const portion = item.s && item.x ? f.portions.find(p => p[0] === item.s) : null
  return portion ? foodEntry({ food: f, portion, count: item.x, meal, d }) : foodEntry({ food: f, grams: item.g, meal, d })
}

/** The log with meal `meal` of `iso` logged as planned. */
export function logPlanned(map, S, iso, meal, food, now = Date.now()) {
  const items = plannedOn(S, iso)?.[meal] || []
  const base = uid()
  let out = isMap(map) ? map : {}
  items.forEach((it, i) => {
    const e = entryOf(it, food, { d: iso, meal })
    if (e) out = withEntry(out, e, base + '-' + String(i).padStart(2, '0'), now)
  })
  return out
}

/** A logged entry (or a picked food) as a plan item: the reference and the amount, no numbers. */
export function itemOf(e, name = '') {
  if (e.f === QUICK) return { f: QUICK, n: e.n || name || '', k: e.k || 0, p: e.p || 0, c: e.c || 0, fa: e.fa || 0 }
  return { f: e.f, g: e.g, ...(e.s && e.x ? { s: e.s, x: e.x } : {}), n: String(name || '').slice(0, 40) }
}

/**
 * "Turn last week into a plan": the 7 days ending `endIso` as a plan of weekdays, each meal what
 * was actually eaten then. `name(key)` gives a food's name for the items.
 */
export function planFromWeek(S, endIso = addDays(todayISO(), -1), name = () => '', title = 'Last week') {
  const days = {}
  const meals = mealsOf(S).length
  for (let i = 0; i < 7; i++) {
    const iso = addDays(endIso, -i)
    const entries = entriesOn(S, iso)
    days[String(weekdayOf(iso))] = Array.from({ length: meals }, (_, m) => entries.filter(e => Math.min(Number(e.m) || 0, meals - 1) === m).map(e => itemOf(e, e.f === QUICK ? e.n : name(e.f))))
  }
  return { name: title, mode: 'week', days }
}

export const withPlan = (map, plan, id = uid(), now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { name: String(plan.name || '').trim().slice(0, 40) || '–', mode: plan.mode === 'same' ? 'same' : 'week', days: plan.days || {}, _ts: now } })
export const withoutPlan = (map, id, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { _ts: now } })

/** The one-off choice for `iso`: a plan id, 'none' for no plan that day, or null to follow the default. */
export const withMealDay = (map, iso, plan, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [iso]: plan ? { plan, _ts: now } : { _ts: now } })

/** A plan with one day's meal replaced. */
export function withPlanMeal(plan, key, meal, items, mealCount) {
  const day = Array.from({ length: Math.max(mealCount, meal + 1) }, (_, m) => (Array.isArray(plan.days?.[key]?.[m]) ? plan.days[key][m] : []))
  day[meal] = items
  return { ...plan, days: { ...(plan.days || {}), [key]: day } }
}

// When each of the default meals is usually eaten, so "next" skips a breakfast long past.
const MEAL_HOURS = { Breakfast: [0, 11], Lunch: [0, 16], Dinner: [0, 24], Snacks: [0, 24] }

/** The next planned meal of `iso` not logged yet: { meal, name, items } or null. */
export function nextPlannedMeal(S, iso = todayISO(), hour = new Date().getHours()) {
  const planned = plannedOn(S, iso)
  if (!planned) return null
  const names = mealsOf(S)
  const logged = entriesOn(S, iso)
  for (let m = 0; m < planned.length; m++) {
    if (!planned[m].length || logged.some(e => (Number(e.m) || 0) === m)) continue
    const win = MEAL_HOURS[names[m]]
    if (win && hour >= win[1]) continue
    return { meal: m, name: names[m], items: planned[m] }
  }
  return null
}

/** A planned meal in one line: "Poha, 1 plate · Masala chai". */
export function itemsLine(items, tr = s => s) {
  return items.map(it => (it.n || '') + (it.s && it.x ? `, ${it.x} ${tr(it.s)}` : it.g && it.f !== QUICK ? `, ${Math.round(it.g)} g` : '')).filter(Boolean).join(' · ')
}
