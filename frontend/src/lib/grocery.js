// The grocery list (Nutrition → Meal plan): the next 7 days of the meal plan as a shopping list,
// amounts added up across the week and grouped by section of the shop.
//
// Indian dishes are bought as what they are made of, so each one is expanded into its recipe
// (scripts/nutrition/indian-dishes.mjs, shipped as RECIPES with the food list): a katori of toor
// dal is 27 g of dry toor dal, 3 g of oil and so on. Cooked staples are listed as the dry amount
// to buy where the ratio is known (150 g of cooked rice is about 50 g dry); anything else that is
// cooked says "cooked weight". Pantry items (tea, coffee) are left off.
//
// Ticks are kept per week in a stamped map, so phone and laptop agree:
//   S.groceryTicks = { [first day of the list]: { items: { [item key]: true }, _ts } }
import { addDays, plannedOn } from './meal-plan.js'
import { todayISO } from './format.js'
import { QUICK } from './food-log.js'

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const fill = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => a[i])
export const DAYS = 7

// Cooked foods bought dry: [what to buy, grams dry per gram cooked].
export const DRY = {
  'u:20045': ['Rice, white', 0.35], 'u:20037': ['Rice, brown', 0.4], 'u:20121': ['Pasta', 0.4],
  'u:20137': ['Quinoa', 0.37], 'u:08121': ['Oats, rolled', 0.15], 'u:20029': ['Couscous', 0.4],
  'u:16070': ['Lentils (masoor)', 0.4], 'u:16057': ['Chickpeas (kabuli chana)', 0.4], 'u:16033': ['Rajma', 0.38],
  'u:16015': ['Black beans', 0.4], 'u:16081': ['Moong (whole)', 0.4], 'u:16102': ['Toor dal', 0.4], 'u:16084': ['Urad', 0.4],
}
// Bought by the piece: grams in one.
export const PIECES = { 'u:01123': 50, 'u:01129': 50, 'u:01128': 50, 'u:09040': 118, 'u:09003': 182, 'u:09200': 131, 'u:09252': 178, 'u:09139': 55, 'u:09148': 69 }
// Shop sections, in the order a list reads, from the food groups the food list carries.
export const SECTIONS = ['produce', 'dairy', 'meat', 'grains', 'pulses', 'nuts', 'oils', 'other']
const SECTION_OF = {
  veg: 'produce', fruit: 'produce', dairy: 'dairy', egg: 'dairy', meat: 'meat', fish: 'meat',
  grain: 'grains', bread: 'grains', legume: 'pulses', nut: 'nuts', oil: 'oils',
}
const PANTRY = new Set(['u:14355', 'u:14209'])

/**
 * The list for the `days` days from `from`: [{ section, items: [{ key, name, g, pieces, cooked, from }] }].
 *   food(key)           a food from the list (lib/foods.js)
 *   recipes, ingredients  RECIPES and INGREDIENTS from lib/foods-data.js
 * Quick adds have nothing to buy and are left out.
 */
export function groceryList(S, { from = todayISO(), days = DAYS, food, recipes = {}, ingredients = {} } = {}) {
  const add = new Map()
  const put = (key, name, group, g, cooked = false) => {
    const k = key + (cooked ? ':cooked' : '')
    const cur = add.get(k) || { key: k, name, group, g: 0, cooked }
    cur.g += g
    add.set(k, cur)
  }
  for (let i = 0; i < days; i++) {
    const meals = plannedOn(S, addDays(from, i))
    if (!meals) continue
    for (const it of meals.flat()) {
      if (it.f === QUICK || PANTRY.has(it.f) || !(it.g > 0)) continue
      const recipe = recipes[it.f]
      if (recipe) {
        const [cooked, ing] = recipe
        for (const [k, g] of ing) {
          if (!ingredients[k]) continue
          put(k, ingredients[k][0], ingredients[k][1], g * it.g / cooked)
        }
        continue
      }
      const f = food(it.f)
      const dry = DRY[it.f]
      if (dry) { put(it.f + ':dry', dry[0], f?.icon || 'grain', it.g * dry[1]); continue }
      // the shopping name when a recipe uses the same food, so both land on one line
      const name = ingredients[it.f]?.[0] || f?.name || it.n || it.f
      put(it.f, name, f?.icon || 'meal', it.g, /\bcooked\b|\broasted\b|\bboiled\b|\bbaked\b/i.test(name) && !f?.dish)
    }
  }
  const bySection = new Map(SECTIONS.map(s => [s, []]))
  for (const x of add.values()) {
    const raw = x.key.split(':').slice(0, 2).join(':')
    const per = PIECES[raw]
    const item = { key: x.key, name: x.name, g: x.g < 10 ? Math.round(x.g) : Math.round(x.g / 10) * 10, cooked: x.cooked,
      pieces: per ? Math.max(1, Math.ceil(x.g / per - 0.15)) : null }
    if (!(item.g > 0)) continue
    bySection.get(SECTION_OF[x.group] || 'other').push(item)
  }
  return SECTIONS.map(section => ({ section, items: bySection.get(section).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter(s => s.items.length)
}

/** An item's amount as the list reads it: "6", "350 g", "450 g cooked weight". */
export function amountText(item, tr = fill) {
  if (item.pieces) return String(item.pieces)
  const g = item.g >= 1000 ? (Math.round(item.g / 100) / 10) + ' kg' : item.g + ' g'
  return item.cooked ? tr('{0} cooked weight', g) : g
}

/** The ticked items of the list starting `from`. */
export const ticksOf = (S, from) => (isMap(S?.groceryTicks?.[from]?.items) ? S.groceryTicks[from].items : {})

/** The ticks map with `key` ticked or not on the list starting `from`. */
export function withTick(map, from, key, on, now = Date.now()) {
  const cur = isMap(map?.[from]?.items) ? map[from].items : {}
  const items = { ...cur }
  if (on) items[key] = true; else delete items[key]
  return { ...(isMap(map) ? map : {}), [from]: { items, _ts: now } }
}

/** The list as plain text, for copying into a notes app or a message. */
export function listText(list, { title = '', sectionName = s => s, tr = fill, ticks = {} } = {}) {
  const lines = title ? [title, ''] : []
  for (const s of list) {
    lines.push(sectionName(s.section))
    for (const it of s.items) lines.push(`${ticks[it.key] ? '☑' : '☐'} ${it.name}: ${amountText(it, tr)}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}
