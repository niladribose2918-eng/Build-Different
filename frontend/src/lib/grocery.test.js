import { describe, it, expect } from 'vitest'
import { FOODS, RECIPES, INGREDIENTS } from './foods-data.js'
import { toFood } from './foods.js'
import { groceryList, amountText, withTick, ticksOf, listText } from './grocery.js'
import { withPlan, itemOf } from './meal-plan.js'
import { foodEntry, quickEntry } from './food-log.js'
import { starterPlan } from './meal-templates.js'

const byKey = new Map(FOODS.map(r => toFood(r)).map(f => [f.key, f]))
const food = k => byKey.get(k)
const item = (key, portion, x) => { const f = food(key); return itemOf(foodEntry({ food: f, portion: f.portions.find(p => p[0] === portion), count: x }), f.name) }
const grams = (key, g) => itemOf(foodEntry({ food: food(key), grams: g }), food(key).name)
const MON = '2026-10-19'
const opts = { from: MON, food, recipes: RECIPES, ingredients: INGREDIENTS }
const profile = plan => ({ nutrition: { plan: 'p', meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] }, mealPlans: withPlan({}, plan, 'p', 1), mealDays: {} })
const find = (list, name) => list.flatMap(s => s.items).find(i => i.name === name)

describe('grocery list', () => {
  it('expands a dish into what it is made of, added up over the week', () => {
    // one katori of toor dal a day: 550 g cooked from 100 g dry, so 27.3 g dry a katori, × 7
    const plan = { name: 'Dal', mode: 'same', days: { all: [[], [item('in:toor-dal', 'katori', 1)], [], []] } }
    const list = groceryList(profile(plan), opts)
    expect(find(list, 'Toor dal').g).toBe(190)
    expect(find(list, 'Onions').g).toBe(80)
    expect(list.find(s => s.section === 'pulses').items.map(i => i.name)).toContain('Toor dal')
  })

  it('lists cooked rice as the dry rice to buy, and says "cooked weight" where it cannot convert', () => {
    const plan = { name: 'x', mode: 'same', days: { all: [[], [grams('u:20045', 150)], [grams('u:05064', 150)], []] } }
    const list = groceryList(profile(plan), opts)
    expect(find(list, 'Rice, white').g).toBe(370) // 150 g cooked × 0.35 × 7 = 367.5
    const chicken = find(list, 'Chicken breast, roasted')
    expect(chicken.cooked).toBe(true)
    expect(amountText(chicken)).toBe('1.1 kg cooked weight')
  })

  it('counts eggs and fruit by the piece, and leaves out quick adds and brewed tea', () => {
    const plan = { name: 'x', mode: 'same', days: { all: [[item('u:01129', 'egg', 3), item('in:masala-chai', 'cup', 1)], [], [], [item('u:09040', 'medium', 1), itemOf(quickEntry({ kcal: 200, name: 'Bar' }))]] } }
    const list = groceryList(profile(plan), opts)
    expect(amountText(find(list, 'Egg, hard-boiled'))).toBe('21')
    expect(amountText(find(list, 'Banana'))).toBe('7')
    expect(list.flatMap(s => s.items).some(i => /Bar|Tea/.test(i.name))).toBe(false)
    // chai brings its milk and sugar, not tea leaves by the gram
    expect(find(list, 'Milk')).toBeTruthy()
  })

  it('follows one-off days and days with no plan', () => {
    const plan = { name: 'x', mode: 'same', days: { all: [[item('u:01129', 'egg', 2)], [], [], []] } }
    const S = profile(plan)
    S.mealDays = { '2026-10-20': { plan: 'none', _ts: 1 } }
    expect(find(groceryList(S, opts), 'Egg, hard-boiled').pieces).toBe(12)
  })

  it('keeps ticks per list and copies the list as text', () => {
    const plan = { name: 'x', mode: 'same', days: { all: [[item('u:01129', 'egg', 2)], [], [], []] } }
    const list = groceryList(profile(plan), opts)
    const key = list[0].items[0].key
    const ticks = withTick({}, MON, key, true, 5)
    expect(ticksOf({ groceryTicks: ticks }, MON)).toEqual({ [key]: true })
    expect(ticksOf({ groceryTicks: withTick(ticks, MON, key, false, 6) }, MON)).toEqual({})
    expect(listText(list, { title: 'Week of 19 Oct', ticks: ticksOf({ groceryTicks: ticks }, MON) })).toBe('Week of 19 Oct\n\ndairy\n☑ Egg, hard-boiled: 14')
  })

  it('turns a whole starter week into a sensible list', () => {
    const plan = starterPlan('veg', 2300, food)
    const list = groceryList(profile(plan), opts)
    const names = list.flatMap(s => s.items.map(i => i.name))
    for (const n of ['Atta (whole wheat flour)', 'Paneer', 'Curd (dahi)', 'Onions', 'Tomatoes', 'Cooking oil']) expect(names).toContain(n)
    // a week of rotis is a few kilos of atta at most, not tens
    expect(find(list, 'Atta (whole wheat flour)').g).toBeLessThan(3000)
    expect(find(list, 'Atta (whole wheat flour)').g).toBeGreaterThan(500)
  })
})
