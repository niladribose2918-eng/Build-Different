import { describe, it, expect } from 'vitest'
import {
  foodEntry, quickEntry, withEntry, withoutEntry, entriesOn, totalsOf, dayTotals, byMeal, copyMeal, recentFoods,
  amountOf, dayDone, withDayDone, savedMealsOf, withSavedMeal, logSavedMeal, mealsOf, nutrientsFor,
} from './food-log.js'
import { mergeStates } from './sync-merge.js'

const roti = { key: 'in:roti', name: 'Roti / chapati', kcal: 255, p: 10, c: 54, f: 2, fib: 6, portions: [['roti', 40]] }
const curd = { key: 'u:01116', name: 'Curd', kcal: 61, p: 3.5, c: 4.7, f: 3.3, fib: 0, portions: [['cup', 245]] }
const day = '2026-10-19', yesterday = '2026-10-18'

describe('food log entries', () => {
  it('copies the nutrients for the amount eaten into the entry', () => {
    const e = foodEntry({ food: roti, portion: ['roti', 40], count: 2, meal: 1, d: day })
    expect(e).toEqual({ d: day, m: 1, f: 'in:roti', g: 80, s: 'roti', x: 2, k: 204, p: 8, c: 43.2, fa: 1.6, fb: 4.8 })
    expect(amountOf(e)).toBe('2 × roti')
    const g = foodEntry({ food: curd, grams: 150, d: day })
    expect(g).toEqual({ d: day, m: 0, f: 'u:01116', g: 150, k: 92, p: 5.3, c: 7.1, fa: 5 })
    expect(amountOf(g)).toBe('150 g')
    expect(nutrientsFor(curd, 0)).toMatchObject({ k: 0, p: 0 })
  })

  it('keeps a quick add with its name, and nothing negative', () => {
    expect(quickEntry({ kcal: '350.4', p: 20, c: -5, name: '  Office cake ', d: day, meal: 3 }))
      .toEqual({ d: day, m: 3, f: 'q', n: 'Office cake', k: 350, p: 20, c: 0, fa: 0 })
  })

  it('adds a day up by meal, and every meal shows even when empty', () => {
    let log = withEntry({}, foodEntry({ food: roti, portion: ['roti', 40], count: 2, meal: 1, d: day }), 'a1', 1)
    log = withEntry(log, foodEntry({ food: curd, grams: 100, meal: 1, d: day }), 'a2', 2)
    log = withEntry(log, quickEntry({ kcal: 200, p: 5, meal: 3, d: day }), 'a3', 3)
    log = withEntry(log, foodEntry({ food: curd, grams: 100, d: yesterday }), 'a0', 0)
    const S = { foodLog: log }
    expect(entriesOn(S, day).map(e => e.id)).toEqual(['a1', 'a2', 'a3'])
    expect(dayTotals(S, day)).toEqual({ k: 465, p: 16.5, c: 47.9, fa: 4.9, fb: 4.8 })
    const meals = byMeal(S, day)
    expect(meals.map(m => m.name)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks'])
    expect(meals[0].entries).toEqual([])
    expect(meals[1].totals.k).toBe(265)
    expect(meals[3].totals.k).toBe(200)
  })

  it('removes with a stamped empty entry that wins the merge on another device', () => {
    const one = withEntry({}, quickEntry({ kcal: 100, d: day }), 'x', 10)
    const removed = withoutEntry(one, 'x', 20)
    expect(entriesOn({ foodLog: removed }, day)).toEqual([])
    const base = { _ts: 1, unit: 'kg', workouts: [], routines: [] }
    for (const m of [mergeStates({ ...base, foodLog: removed }, { ...base, foodLog: one }), mergeStates({ ...base, foodLog: one }, { ...base, foodLog: removed })]) {
      expect(entriesOn(m, day)).toEqual([])
    }
  })

  it('merges two devices\' logs entry by entry', () => {
    const base = { _ts: 1, unit: 'kg', workouts: [], routines: [] }
    const phone = { ...base, _ts: 5, foodLog: withEntry({}, quickEntry({ kcal: 300, d: day }), 'p1', 5) }
    const laptop = { ...base, _ts: 9, foodLog: withEntry({}, quickEntry({ kcal: 500, d: day, meal: 2 }), 'l1', 9) }
    expect(dayTotals(mergeStates(phone, laptop), day).k).toBe(800)
    expect(dayTotals(mergeStates(laptop, phone), day).k).toBe(800)
  })

  it('copies yesterday\'s meal to today as new entries', () => {
    let log = withEntry({}, foodEntry({ food: roti, portion: ['roti', 40], count: 2, meal: 1, d: yesterday }), 'y1', 1)
    log = withEntry(log, foodEntry({ food: curd, grams: 100, meal: 1, d: yesterday }), 'y2', 2)
    const S = { foodLog: log }
    const out = copyMeal(log, S, yesterday, 1, day)
    const S2 = { foodLog: out }
    expect(byMeal(S2, day)[1].entries.map(e => e.f)).toEqual(['in:roti', 'u:01116'])
    expect(byMeal(S2, yesterday)[1].entries.length).toBe(2)
  })

  it('ranks recent foods by how often they were eaten lately, quick adds left out', () => {
    let log = {}
    for (let i = 0; i < 3; i++) log = withEntry(log, foodEntry({ food: roti, grams: 40, d: day }), 'r' + i, i)
    log = withEntry(log, foodEntry({ food: curd, grams: 100, d: '2026-06-01' }), 'old', 1)
    log = withEntry(log, quickEntry({ kcal: 100, d: day }), 'q', 1)
    const recent = recentFoods({ foodLog: log }, { today: day })
    expect([...recent.keys()]).toEqual(['in:roti'])
  })

  it('marks a day complete and takes it back', () => {
    const m = withDayDone({}, day, true, 5)
    expect(dayDone({ foodDays: m }, day)).toBe(true)
    expect(dayDone({ foodDays: withDayDone(m, day, false, 6) }, day)).toBe(false)
  })

  it('saves a meal and logs it again on another day', () => {
    const entries = [{ id: 'a', ...foodEntry({ food: roti, portion: ['roti', 40], count: 2, meal: 1, d: day }), _ts: 1 }]
    const saved = withSavedMeal({}, ' My lunch ', entries, 's1', 5)
    const meals = savedMealsOf({ savedMeals: saved })
    expect(meals[0]).toMatchObject({ id: 's1', name: 'My lunch' })
    expect(meals[0].items[0]).toEqual({ f: 'in:roti', g: 80, s: 'roti', x: 2, k: 204, p: 8, c: 43.2, fa: 1.6, fb: 4.8 })
    const log = logSavedMeal({}, meals[0], '2026-10-20', 0)
    expect(totalsOf(entriesOn({ foodLog: log }, '2026-10-20')).k).toBe(204)
  })

  it('uses the profile\'s meal names, up to six', () => {
    expect(mealsOf({})).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks'])
    expect(mealsOf({ nutrition: { meals: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] } })).toHaveLength(6)
  })
})
