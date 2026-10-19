#!/usr/bin/env node
// Builds the app's built-in food list from USDA data plus the curated lists next to this file.
//
//   node scripts/nutrition/build-foods.mjs <SR28 data dir>
//
// The data dir holds ABBREV.txt and FOOD_DES.txt from the USDA National Nutrient Database for
// Standard Reference, Release 28 (public domain; the same foods FoodData Central now serves as
// "SR Legacy"). The files are not kept in this repository, they are an input like a download.
//
//   common-foods.mjs    the everyday foods search puts first, with short names and aliases
//   indian-dishes.mjs   Indian dishes as recipes of USDA ingredients, added up here
//
// Generated, never edited by hand:
//   frontend/src/lib/foods-data.js   FOODS: one row per food, loaded only when Nutrition opens
//
// Row: [key, name, icon, kcal, protein, carbs, fat, fibre, portions, aliases, flags, note]
//   key       'u:<USDA number>' or 'in:<dish id>', what a food log entry points at
//   values    per 100 g; kcal whole, the rest to one decimal
//   portions  [[label, grams], …], the first one is the default; [] means grams only
//   flags     1 = curated everyday food (ranks first), 2 = recipe estimate
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import COMMON, { PORTIONS } from './common-foods.mjs'
import DISHES from './indian-dishes.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'frontend/src/lib/foods-data.js')
const dir = process.argv[2]
if (!dir || !fs.existsSync(path.join(dir, 'ABBREV.txt'))) {
  console.error('usage: node scripts/nutrition/build-foods.mjs <dir with ABBREV.txt and FOOD_DES.txt>')
  process.exit(1)
}

// SR28 flat files: latin-1, '^' between fields, '~' around text.
const read = file => fs.readFileSync(path.join(dir, file), 'latin1').split(/\r?\n/).filter(Boolean)
  .map(line => line.split('^').map(f => f.replace(/^~|~$/g, '')))

const num = s => (s === '' || s == null ? null : Number(s))
const usda = new Map()
for (const f of read('FOOD_DES.txt')) usda.set(f[0], { id: f[0], group: f[1], name: f[2], maker: f[5] })
for (const f of read('ABBREV.txt')) {
  const u = usda.get(f[0])
  if (!u) continue
  Object.assign(u, {
    kcal: num(f[3]), p: num(f[4]), fat: num(f[5]), c: num(f[7]), fib: num(f[8]),
    portions: [[f[49], num(f[48])], [f[51], num(f[50])]].filter(([d, g]) => d && g > 0),
  })
}

// ── which USDA foods ship ──
// About 3,500 foods people actually eat, not all 8,789. Left out: baby food, fast-food chains,
// restaurant meals and regional foods (groups 0300, 2100, 3500, 3600), anything with a
// manufacturer, and the near-twins that only make search longer: the with-salt, low-sodium and
// frozen-before-cooking copies of a food, every syrup grade of canned fruit, soups and drinks as
// dry mixes, and for meat every trim level, grade and cut-on-the-bone the butcher can tell apart.
const SKIP_GROUPS = new Set(['0300', '2100', '3500', '3600'])
const MEAT_GROUPS = new Set(['0500', '0700', '1000', '1300', '1700'])
const SKIP_ANY = [
  /\bUSDA Commodity\b/i, /\bschool\b/i, /\bindustrial\b/i, /separable fat/i, /composite of/i,
  /with added solution/i, /mechanically (separated|deboned)/i, /\bunprepared\b/i, /\bshortening\b/i,
  /\b(no salt added|without salt added|low sodium|reduced sodium|salt added in processing)\b/i,
  /\b(dry mix|mix, dry|dry, mix|dehydrated|unbaked|ready-to-bake|refrigerated dough)\b/i,
  /\b(pancreas|spleen|lungs|thymus|brain|ears|jowl|tail|feet|chitterlings|suet|giblets|neck|gizzard)\b/i,
]
const SKIP_IN_GROUP = {
  '0600': [/\bcondensed\b/i, /\bpowder\b/i],
  '0900': [/extra (heavy|light) syrup/i, /light syrup/i, /water pack/i],
  '1100': [/solids and liquids/i],
  '1400': [/\bpowder\b(?!.*(malted|cocoa|protein))/i, /\bconcentrate\b/i],
}
const SKIP_MEAT = [
  /\b(choice|select|prime)\b(?!.*all grades)/i, /separable lean and fat/i, /trimmed to 1\/(4|8)/i,
  /\b(imported|new zealand|australian)\b/i, /\b(stewing|capons|roasting|fryer-roasters|young (tom|hen))\b/i,
  /\bback, /i, /\bbone-in\b/i, /meat and skin and/i, /\b(heated|unheated|pan-broil)\b/i,
  /game meat, (bear|beaver|muskrat|opossum|raccoon|squirrel|beefalo|caribou|antelope)/i,
  /\b(emu|ostrich|goose|squab|pheasant|guinea hen|cornish game hens|quail|dove)\b/i,
  /\b(skin only|fat only|backfat|salt pork|rotisserie, original seasoning)\b/i,
  /^Veal, (?!ground|leg)/i, /, (light|dark) meat, (meat|skin)/i, /\bleg, meat/i,
]
function ships(u) {
  if (SKIP_GROUPS.has(u.group) || u.maker) return false
  if ([u.kcal, u.p, u.fat, u.c].some(v => v == null)) return false
  if (/\bwith salt\b/i.test(u.name) && !/without salt/i.test(u.name)) return false
  if (SKIP_ANY.some(re => re.test(u.name))) return false
  if ((SKIP_IN_GROUP[u.group] || []).some(re => re.test(u.name))) return false
  if (MEAT_GROUPS.has(u.group) && SKIP_MEAT.some(re => re.test(u.name))) return false
  return true
}

// The picture a food gets until it has a photo.
const GROUP_ICON = {
  '0100': 'dairy', '0200': 'spice', '0400': 'oil', '0500': 'meat', '0600': 'soup', '0700': 'meat',
  '0800': 'grain', '0900': 'fruit', '1000': 'meat', '1100': 'veg', '1200': 'nut', '1300': 'meat',
  '1400': 'drink', '1500': 'fish', '1600': 'legume', '1700': 'meat', '1800': 'bread', '1900': 'sweet',
  '2000': 'grain', '2200': 'meal', '2500': 'snack',
}
const iconOf = u => (/^eggs?\b/i.test(u.name) ? 'egg' : GROUP_ICON[u.group] || 'meal')

const r0 = v => Math.round(v)
const r1 = v => Math.round(v * 10) / 10
// "1 cup" → "cup", ".25 cup" → "0.25 cup"; the app puts the count in front.
const portionLabel = d => d.trim().replace(/^\.(\d)/, '0.$1').replace(/^1 (?=\D)/, '').replace(/\s+/g, ' ')
const portionsOf = u => u.portions.map(([d, g]) => [portionLabel(d), r1(g)])

const problems = []
const rows = []
const seen = new Set()
const row = (key, name, icon, n, portions, aliases, flags, note) => {
  if (seen.has(key)) problems.push(`${key}: listed twice`)
  seen.add(key)
  rows.push([key, name, icon, r0(n.kcal), r1(n.p), r1(n.c), r1(n.fat), r1(n.fib || 0), portions, aliases, flags, note || ''])
}

// 1. The curated everyday foods, first and in their own order.
for (const id of Object.keys(PORTIONS)) if (!COMMON.some(c => c[0] === id)) problems.push(`common-foods: PORTIONS has ${id}, which is not in the list`)
for (const [id, name, aliases = []] of COMMON) {
  const u = usda.get(id)
  if (!u || u.kcal == null) { problems.push(`common-foods: ${id} (${name}) is not in the USDA data`); continue }
  const own = PORTIONS[id] || []
  const portions = [...own, ...portionsOf(u).filter(([l]) => !own.some(([o]) => o === l))]
  row('u:' + id, name, iconOf(u), u, portions, aliases.map(a => a.toLowerCase()), 1)
}

// 2. Indian dishes: add the raw ingredients up, divide by what the batch weighs cooked.
const DISH_ICON = { dairy: 'dairy', dal: 'legume', rice: 'grain', bread: 'bread', breakfast: 'grain', side: 'veg', curry: 'meal', veg: 'veg', nonveg: 'meat', snack: 'snack', sweet: 'sweet', drink: 'drink' }
const FISH = new Set(['15008', '15149']), EGG = '01123'
for (const d of DISHES) {
  const sum = { kcal: 0, p: 0, c: 0, fat: 0, fib: 0 }
  let ok = true
  for (const [id, g] of d.ing) {
    const u = usda.get(id)
    if (!u || u.kcal == null) { problems.push(`indian-dishes: ${d.id} uses ${id}, which is not in the USDA data`); ok = false; continue }
    if (!(g > 0)) { problems.push(`indian-dishes: ${d.id} has ${g} g of ${id}`); ok = false }
    for (const k of Object.keys(sum)) sum[k] += (u[k] || 0) * g / 100
  }
  if (!(d.yield > 0) || !d.portions?.length) { problems.push(`indian-dishes: ${d.id} needs a yield and a portion`); ok = false }
  if (!DISH_ICON[d.group]) { problems.push(`indian-dishes: ${d.id} has an unknown group ${d.group}`); ok = false }
  if (!ok) continue
  const per100 = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / d.yield * 100]))
  // A meat dish shows fish or an egg when that is what it is mostly made of.
  const main = d.group === 'nonveg' ? [...d.ing].sort((a, b) => b[1] - a[1])[0][0] : null
  const icon = main && FISH.has(main) ? 'fish' : main === EGG ? 'egg' : DISH_ICON[d.group]
  row('in:' + d.id, d.name, icon, per100, d.portions.map(([l, g]) => [l, g]), (d.aliases || []).map(a => a.toLowerCase()), 2, d.note)
}

// 3. Everything else that ships, under USDA's own description.
for (const u of usda.values()) {
  if (seen.has('u:' + u.id) || !ships(u)) continue
  row('u:' + u.id, u.name, iconOf(u), u, portionsOf(u), [], 0)
}

// Energy should roughly agree with the macros: 4 kcal per g of protein and of digestible carbs,
// 2 per g of fibre, 9 per g of fat; drinks with alcohol carry 7 per g of it on top, which the
// data has no column for. Our own rows must agree; a USDA row that doesn't (sugar alcohols,
// sweeteners, extracts) is left out rather than shown with numbers that look wrong.
const ALCOHOL = /\b(wine|beer|alcoholic|liqueur|whiskey|vodka|rum|gin|sake|distilled)\b/i
const plausible = ([, name, , kcal, p, c, f, fib]) => {
  if (ALCOHOL.test(name)) return kcal <= 400
  const atwater = 4 * p + 4 * Math.max(0, c - fib) + 2 * fib + 9 * f
  return kcal <= 900 && Math.abs(kcal - atwater) <= Math.max(40, kcal * 0.25)
}
let dropped = 0
for (let i = rows.length - 1; i >= 0; i--) {
  if (plausible(rows[i])) continue
  if (rows[i][10]) problems.push(`${rows[i][0]} ${rows[i][1]}: ${rows[i][3]} kcal does not match its macros`)
  else { rows.splice(i, 1); dropped++ }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}

const body = rows.map(r => JSON.stringify(r)).join(',\n')
fs.writeFileSync(OUT, `// generated by scripts/nutrition/build-foods.mjs — do not edit
// Nutrient values: U.S. Department of Agriculture, Agricultural Research Service. USDA National
// Nutrient Database for Standard Reference, Release 28 (2015). Public domain. Indian dishes are
// recipes built from those values (scripts/nutrition/indian-dishes.mjs), estimates by nature.
export const FOODS = [
${body},
]
`)
const counts = rows.reduce((a, r) => ((a[r[10]] = (a[r[10]] || 0) + 1), a), {})
console.log(`${rows.length} foods (${counts[1]} everyday, ${counts[2]} Indian dishes, ${counts[0]} more from USDA, ${dropped} left out), ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`)
