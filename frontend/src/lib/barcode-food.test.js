import { describe, it, expect, vi } from 'vitest'
import { validBarcode, cleanBarcode, parseOff, lookupBarcode, withSeen, seenFoods, offUrl } from './barcode-food.js'
import { foodEntry } from './food-log.js'

// Answers in the shape the Open Food Facts v2 API returns (fields as requested by offUrl).
const NUTELLA = {
  code: '3017620422003', status: 1, status_verbose: 'product found',
  product: { product_name: 'Nutella', brands: 'Ferrero, Nutella', serving_quantity: 15, serving_size: '15 g',
    nutriments: { 'energy-kcal_100g': 539, energy_100g: 2252, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, fiber_100g: 0 } },
}
const KJ_ONLY = {
  code: '4006040000006', status: 1,
  product: { product_name: 'Haferflocken', brands: 'Kölln', nutriments: { energy_100g: 1569, proteins_100g: 13.5, carbohydrates_100g: 58.7, fat_100g: 7, fiber_100g: 10 } },
}
const NOT_FOUND = { code: '0000000000000', status: 0, status_verbose: 'product not found' }
const NO_MACROS = { code: '5000000000005', status: 1, product: { product_name: 'Mystery snack', nutriments: {} } }
const BROKEN = { status: 1, product: { product_name: 'Typo', nutriments: { proteins_100g: 320, carbohydrates_100g: 2, fat_100g: 1 } } }

// A valid EAN-13 for any 12 digits.
const ean = d12 => { const s = d12.split('').map(Number).reverse().reduce((a, d, i) => a + d * (i % 2 ? 1 : 3), 0); return d12 + ((10 - s % 10) % 10) }

describe('barcodes', () => {
  it('accepts real retail codes and their check digit only', () => {
    expect(validBarcode('3017620422003')).toBe(true)          // EAN-13
    expect(validBarcode('3017620422004')).toBe(false)         // check digit off by one
    expect(validBarcode('96385074')).toBe(true)               // EAN-8
    expect(validBarcode('036000291452')).toBe(true)           // UPC-A
    expect(validBarcode(ean('890105800029'))).toBe(true)
    expect(validBarcode('12345')).toBe(false)
    expect(cleanBarcode(' 3017 6204-22003 ')).toBe('3017620422003')
    expect(offUrl('3017620422003')).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003\.json\?fields=/)
  })
})

describe('reading an Open Food Facts answer', () => {
  it('takes the values per 100 g, the first brand and the serving', () => {
    const r = parseOff(NUTELLA, '3017620422003')
    expect(r).toMatchObject({ ok: true, food: { key: 'b:3017620422003', name: 'Nutella', brand: 'Ferrero', kcal: 539, p: 6.3, c: 57.5, f: 30.9, fib: 0, portions: [['serving', 15]] } })
    // the result logs like any food
    expect(foodEntry({ food: r.food, portion: ['serving', 15], count: 2 }).k).toBe(162)
  })

  it('works out kcal from kJ when that is all there is', () => {
    expect(parseOff(KJ_ONLY, KJ_ONLY.code).food.kcal).toBe(375)
  })

  it('says why when there is nothing usable', () => {
    expect(parseOff(NOT_FOUND)).toEqual({ ok: false, reason: 'notFound' })
    expect(parseOff(NO_MACROS)).toEqual({ ok: false, reason: 'noNutrients' })
    expect(parseOff(BROKEN)).toEqual({ ok: false, reason: 'bad' })
    expect(parseOff(null)).toEqual({ ok: false, reason: 'bad' })
  })
})

describe('looking a barcode up', () => {
  const answer = (status, body) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }))

  it('fetches the product and reads it', async () => {
    const fx = answer(200, NUTELLA)
    const r = await lookupBarcode('3017620422003', { fetch: fx })
    expect(r.ok).toBe(true)
    expect(fx.mock.calls[0][0]).toBe(offUrl('3017620422003'))
    // a browser cannot set User-Agent: the web build does not try
    expect(fx.mock.calls[0][1].headers['User-Agent']).toBeUndefined()
  })

  it('reports a typo, a missing product, a busy server and no connection apart', async () => {
    expect(await lookupBarcode('3017620422004', { fetch: answer(200, NUTELLA) })).toEqual({ ok: false, reason: 'invalid' })
    expect(await lookupBarcode('3017620422003', { fetch: answer(404, NOT_FOUND) })).toEqual({ ok: false, reason: 'notFound' })
    expect(await lookupBarcode('3017620422003', { fetch: answer(429, {}) })).toEqual({ ok: false, reason: 'busy' })
    expect(await lookupBarcode('3017620422003', { fetch: vi.fn(async () => { throw new Error('offline') }) })).toEqual({ ok: false, reason: 'network' })
  })
})

describe('foods looked up before', () => {
  it('are remembered, so they work offline and on other devices', () => {
    const food = parseOff(NUTELLA, '3017620422003').food
    const map = withSeen({}, food, 5)
    expect(map['3017620422003']).toMatchObject({ name: 'Nutella', kcal: 539, _ts: 5 })
    const [seen] = seenFoods({ foodsSeen: map })
    expect(seen).toMatchObject({ key: 'b:3017620422003', name: 'Nutella', kcal: 539, portions: [['serving', 15]], aliases: ['ferrero'] })
    // a removed one is gone
    expect(seenFoods({ foodsSeen: { ...map, '3017620422003': { _ts: 6 } } })).toEqual([])
  })
})
