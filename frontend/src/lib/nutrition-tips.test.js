import { describe, it, expect } from 'vitest'
import { tipsFor, trainingTip, fibreTip, finishProtein, todaysSession, FIBRE_FLOOR } from './nutrition-tips.js'
import { defaultNutrition } from './nutrition-targets.js'
import { foodEntry, quickEntry, withEntry, withDayDone } from './food-log.js'

const TODAY = '2026-10-19' // a Monday
const iso = n => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const apple = { key: 'u:09003', kcal: 52, p: 0.3, c: 13.8, f: 0.2, fib: 2.4 }
const dal = { key: 'in:toor-dal', kcal: 85, p: 4.2, c: 12.8, f: 2.1, fib: 3 }
const push = { id: 'r1', name: 'Push Day', exercises: [] }

function profile(more = {}) {
  return {
    unit: 'kg', routines: [push], week: { 1: 'r1' }, dayPlan: {}, queue: null, workouts: [],
    bodyweight: [{ d: iso(-1), w: 78 }], measurements: [], foodLog: {}, foodDays: {},
    nutrition: { ...defaultNutrition(), sex: 'male', birthYear: 1994, heightCm: 178, goal: 'maintain' },
    ...more,
  }
}
// `n` complete days before today, each with `grams` of a food carrying fibre.
function withDays(S, n, food, grams) {
  for (let i = 1; i <= n; i++) {
    S.foodLog = withEntry(S.foodLog, foodEntry({ food, grams, d: iso(-i) }), 'e' + i, 1)
    S.foodDays = withDayDone(S.foodDays, iso(-i), true, 1)
  }
  return S
}

describe('nutrition tips', () => {
  it('names today\'s planned session for the protein tip, and stays quiet on a rest day', () => {
    expect(todaysSession(profile(), TODAY)).toBe('Push Day')
    expect(trainingTip(profile(), TODAY)).toEqual({ id: 'training', data: { name: 'Push Day' } })
    expect(trainingTip(profile(), iso(1))).toBeNull()
    // a session logged on a rest day still counts
    const S = profile({ workouts: [{ id: 'w', d: iso(1), name: 'Extra arms', entries: [] }] })
    expect(trainingTip(S, iso(1)).data.name).toBe('Extra arms')
  })

  it('nudges fibre only after three complete days under 25 g, with fibre in the log', () => {
    expect(fibreTip(withDays(profile(), 3, apple, 300), TODAY)).toEqual({ id: 'fibre', data: { avg: 7, floor: FIBRE_FLOOR } })
    // enough fibre on one of them
    const S = withDays(profile(), 3, apple, 300)
    S.foodLog = withEntry(S.foodLog, foodEntry({ food: dal, grams: 700, d: iso(-2) }), 'x', 2)
    expect(fibreTip(S, TODAY)).toBeNull()
    // only two days, or a day not marked complete
    expect(fibreTip(withDays(profile(), 2, apple, 300), TODAY)).toBeNull()
    const half = withDays(profile(), 3, apple, 300)
    half.foodDays = withDayDone(half.foodDays, iso(-3), false, 3)
    expect(fibreTip(half, TODAY)).toBeNull()
  })

  it('says nothing about fibre from quick adds, which carry none', () => {
    const S = profile()
    for (let i = 1; i <= 3; i++) {
      S.foodLog = withEntry(S.foodLog, quickEntry({ kcal: 2000, p: 120, d: iso(-i) }), 'q' + i, 1)
      S.foodDays = withDayDone(S.foodDays, iso(-i), true, 1)
    }
    expect(fibreTip(S, TODAY)).toBeNull()
  })

  it('leaves out a tip dismissed today, and every tip when switched off', () => {
    const S = withDays(profile(), 3, apple, 300)
    expect(tipsFor(S, { today: TODAY }).map(x => x.id)).toEqual(['training', 'fibre'])
    expect(tipsFor(S, { today: TODAY, dismissed: { training: TODAY } }).map(x => x.id)).toEqual(['fibre'])
    expect(tipsFor(S, { today: TODAY, dismissed: { training: iso(-1) } }).map(x => x.id)).toEqual(['training', 'fibre'])
    expect(tipsFor({ ...S, nutrition: { ...S.nutrition, tips: false } }, { today: TODAY })).toEqual([])
    expect(tipsFor({ ...S, nutrition: null }, { today: TODAY })).toEqual([])
  })

  it('reports protein so far today for the finish screen once something is logged', () => {
    const S = profile()
    expect(finishProtein(S, TODAY)).toBeNull()
    S.foodLog = withEntry(S.foodLog, quickEntry({ kcal: 500, p: 62, d: TODAY }), 't', 1)
    const fp = finishProtein(S, TODAY)
    expect(fp.p).toBe(62)
    expect(fp.target).toBeGreaterThan(100)
    expect(finishProtein({ ...S, nutrition: { ...S.nutrition, tips: false } }, TODAY)).toBeNull()
  })
})
