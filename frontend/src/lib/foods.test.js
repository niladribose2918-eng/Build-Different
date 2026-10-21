import { describe, it, expect } from 'vitest'
import { FOODS } from './foods-data.js'
import { toFood, FOOD_ICON, loadFoods } from './foods.js'
import { searchFoods, slips, normalize } from './food-search.js'
import { ICON_NAMES } from '../components/Icon.jsx'

const list = FOODS.map(toFood)
const top = (q, opts) => searchFoods(list, q, opts).slice(0, 5).map(f => f.name)

describe('built-in food list', () => {
  it('has one row per key, everyday foods first, then the Indian dishes', () => {
    const keys = list.map(f => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every(k => /^(u:\d{5}|in:[a-z0-9-]+)$/.test(k))).toBe(true)
    const firstDish = list.findIndex(f => f.dish), firstOther = list.findIndex(f => !f.everyday && !f.dish)
    expect(list.slice(0, firstDish).every(f => f.everyday)).toBe(true)
    expect(list.slice(firstDish, firstOther).every(f => f.dish)).toBe(true)
    expect(list.filter(f => f.dish).length).toBeGreaterThanOrEqual(120)
    expect(list.length).toBeGreaterThan(3000)
  })

  it('carries plausible numbers per 100 g, and energy that agrees with the macros', () => {
    for (const f of list) {
      expect(f.kcal).toBeGreaterThanOrEqual(0)
      expect(f.kcal).toBeLessThanOrEqual(902)
      expect(f.p + f.c + f.f).toBeLessThanOrEqual(101)
      if (!/wine|beer|alcoholic|liqueur|whiskey|vodka|rum|gin|sake|distilled/i.test(f.name)) {
        const atwater = 4 * f.p + 4 * Math.max(0, f.c - f.fib) + 2 * f.fib + 9 * f.f
        expect(Math.abs(f.kcal - atwater)).toBeLessThanOrEqual(Math.max(40, f.kcal * 0.25))
      }
    }
  })

  it('gives every portion a label and a weight, and every food a picture that exists', () => {
    for (const f of list) {
      for (const [label, g] of f.portions) {
        expect(typeof label).toBe('string')
        expect(label.length).toBeGreaterThan(0)
        expect(g).toBeGreaterThan(0)
      }
      expect(ICON_NAMES).toContain(FOOD_ICON[f.icon])
    }
  })

  it('marks every Indian dish as a recipe estimate, with its household portions', () => {
    const roti = list.find(f => f.key === 'in:roti')
    expect(roti).toMatchObject({ dish: true, portions: [['roti', 40]] })
    // 30 g of whole wheat flour (340 kcal / 100 g) baked down to 40 g
    expect(roti.kcal * 0.4).toBeCloseTo(102, 0)
    const dal = list.find(f => f.key === 'in:toor-dal')
    expect(dal.portions[0]).toEqual(['katori', 150])
    expect(dal.kcal * 1.5).toBeGreaterThan(100)
    expect(dal.kcal * 1.5).toBeLessThan(200)
  })

  it('loads on demand, once', async () => {
    const a = await loadFoods(), b = await loadFoods()
    expect(a).toBe(b)
    expect(a.byKey.get('in:roti').name).toBe('Roti / chapati')
  })
})

describe('food search', () => {
  it('finds the everyday word people type, in any language they use for it', () => {
    expect(top('dahi')[0]).toBe('Curd / plain yogurt, whole milk')
    expect(top('chawal')[0]).toMatch(/^Rice, white/)
    expect(top('aloo').some(n => /aloo/i.test(n))).toBe(true)
    expect(top('anda').some(n => /^Egg/.test(n))).toBe(true)
  })

  it('puts the plain food above every long USDA description that mentions it', () => {
    expect(top('banana')[0]).toBe('Banana')
    expect(top('chicken breast')[0]).toBe('Chicken breast, roasted')
    expect(top('milk')[0]).toMatch(/^Milk/)
  })

  it('forgives a typo or a swapped letter', () => {
    expect(top('chiken breast')[0]).toBe('Chicken breast, roasted')
    expect(top('panner').some(n => /Paneer/.test(n))).toBe(true)
    expect(top('bannaa')[0]).toBe('Banana')
    expect(slips('chiken', 'chicken', 1)).toBe(1)
    expect(slips('bananaa', 'banana', 1)).toBe(1)
    expect(slips('abcd', 'wxyz', 1)).toBe(2)
  })

  it('matches as you type', () => {
    expect(top('rot')).toContain('Roti / chapati')
    expect(top('masala do')[0]).toBe('Masala dosa')
  })

  it('lifts what was eaten lately', () => {
    const plain = searchFoods(list, 'rice').map(f => f.key)
    const brown = 'u:20037'
    expect(plain[0]).not.toBe(brown)
    const recent = new Map([[brown, 5]])
    expect(searchFoods(list, 'rice', { recent })[0].key).toBe(brown)
  })

  it('needs every word to match and returns nothing for nothing', () => {
    expect(searchFoods(list, '')).toEqual([])
    expect(searchFoods(list, 'banana zzzzqqq')).toEqual([])
    expect(normalize('Crème Brûlée!')).toBe('creme brulee')
  })
})
