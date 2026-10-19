// Barcode lookup (opt-in, Nutrition settings): a package's barcode, typed or scanned, fetched from
// Open Food Facts and confirmed before anything is logged. Off by default; switching it on says
// plainly that the barcode number is sent to openfoodfacts.org, and nothing else is.
//
// Community data can be wrong or incomplete, so a product is read defensively: values per 100 g,
// kcal from kJ when only that is given (or from the macros), and a product with no macros at all
// is refused (quick add is the way to log it). Every food looked up is remembered in a stamped map,
// so it works offline next time and on your other devices:
//   S.foodsSeen = { [barcode]: { name, brand, kcal, p, c, f, fib, portions, _ts } }
// A logged entry points at it as 'b:<barcode>'.
//
// The data is ODbL-licensed: the app shows "Data from Open Food Facts (ODbL)" with every result.
import { MOBILE } from './mobile.js'
import { nativeFetch } from './capacitor-fetch.js'

export const ATTRIBUTION = 'Data from Open Food Facts (ODbL)'
export const KEY_PREFIX = 'b:'
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const r1 = v => Math.round(v * 10) / 10

/** The digits of what was typed or scanned. */
export const cleanBarcode = s => String(s || '').replace(/\D/g, '')

/** A real retail barcode: EAN-8, UPC-A (12), EAN-13 or GTIN-14, with its check digit right. */
export function validBarcode(code) {
  const c = cleanBarcode(code)
  if (![8, 12, 13, 14].includes(c.length)) return false
  const digits = c.split('').map(Number)
  const check = digits.pop()
  // weights 3,1,3,1… from the digit next to the check digit
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

export const offUrl = code => `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode(code)}.json?fields=code,product_name,product_name_en,brands,nutriments,serving_quantity,serving_size`

/**
 * An Open Food Facts answer as a food, or why not:
 *   { ok: true, food }   food: { key, name, brand, kcal, p, c, f, fib, portions, aliases, icon, barcode }
 *   { ok: false, reason: 'notFound' | 'noNutrients' | 'bad' }
 */
export function parseOff(json, code) {
  if (!isMap(json)) return { ok: false, reason: 'bad' }
  if (json.status === 0 || json.status === 'failure' || !isMap(json.product)) return { ok: false, reason: 'notFound' }
  const p = json.product
  const n = isMap(p.nutriments) ? p.nutriments : {}
  const prot = num(n.proteins_100g), carb = num(n.carbohydrates_100g), fat = num(n.fat_100g)
  if (prot == null && carb == null && fat == null) return { ok: false, reason: 'noNutrients' }
  let kcal = num(n['energy-kcal_100g'])
  if (kcal == null && num(n.energy_100g) != null) kcal = num(n.energy_100g) / 4.184
  if (kcal == null) kcal = 4 * (prot || 0) + 4 * (carb || 0) + 9 * (fat || 0)
  const vals = [prot || 0, carb || 0, fat || 0]
  if (vals.some(v => v < 0 || v > 100) || kcal < 0 || kcal > 950 || vals.reduce((a, b) => a + b, 0) > 101) return { ok: false, reason: 'bad' }
  const brand = String(p.brands || '').split(',')[0].trim()
  const title = String(p.product_name || p.product_name_en || '').trim()
  const name = (title || brand || cleanBarcode(code)).slice(0, 80)
  const serving = num(p.serving_quantity)
  const barcode = cleanBarcode(p.code || code)
  return {
    ok: true,
    food: {
      key: KEY_PREFIX + barcode, barcode, name, brand,
      kcal: Math.round(kcal), p: r1(prot || 0), c: r1(carb || 0), f: r1(fat || 0), fib: r1(num(n.fiber_100g) || 0),
      portions: serving > 0 && serving < 2000 ? [['serving', r1(serving)]] : [],
      aliases: brand ? [brand.toLowerCase()] : [], icon: 'meal', everyday: false, dish: false, note: '',
    },
  }
}

/** Look a barcode up. The app sends a User-Agent naming openGym, as Open Food Facts asks; a browser may not set one. */
export async function lookupBarcode(code, { fetch: fx = nativeFetch, timeoutMs = 10000 } = {}) {
  const c = cleanBarcode(code)
  if (!validBarcode(c)) return { ok: false, reason: 'invalid' }
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
  const headers = { Accept: 'application/json', ...(MOBILE ? { 'User-Agent': `openGym/${version} (https://github.com/DuarteSantos8/openGym)` } : {}) }
  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null
  try {
    const res = await fx(offUrl(c), { method: 'GET', headers, ...(ctl ? { signal: ctl.signal } : {}) })
    if (res.status === 404) return { ok: false, reason: 'notFound' }
    if (res.status === 429) return { ok: false, reason: 'busy' }
    if (!res.ok) return { ok: false, reason: 'network' }
    return parseOff(await res.json(), c)
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** The map with a looked-up food remembered (or updated), stamped `now`. */
export function withSeen(map, food, now = Date.now()) {
  const { barcode, name, brand, kcal, p, c, f, fib, portions } = food
  return { ...(isMap(map) ? map : {}), [barcode]: { name, brand, kcal, p, c, f, fib, portions, _ts: now } }
}

/** The remembered packaged foods as foods: [{ key: 'b:…', … }], newest first. */
export function seenFoods(S) {
  const m = isMap(S?.foodsSeen) ? S.foodsSeen : {}
  return Object.keys(m).filter(code => m[code]?.name && Number.isFinite(m[code].kcal))
    .sort((a, b) => (m[b]._ts || 0) - (m[a]._ts || 0))
    .map(code => ({ key: KEY_PREFIX + code, barcode: code, name: m[code].name, brand: m[code].brand || '', kcal: m[code].kcal,
      p: m[code].p || 0, c: m[code].c || 0, f: m[code].f || 0, fib: m[code].fib || 0, portions: Array.isArray(m[code].portions) ? m[code].portions : [],
      aliases: m[code].brand ? [String(m[code].brand).toLowerCase()] : [], icon: 'meal', everyday: false, dish: false, note: '', seen: true }))
}
