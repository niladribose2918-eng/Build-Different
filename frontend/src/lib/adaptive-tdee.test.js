import { describe, it, expect } from 'vitest'
import { learnMaintenance, checkinFor, answerCheckin, checkinsOf, daysUntilCheckin, MAX_STEP } from './adaptive-tdee.js'
import { computeTargets, defaultNutrition } from './nutrition-targets.js'
import { quickEntry, withEntry, withDayDone } from './food-log.js'
import { buildDemoState } from './demoSeed.js'

const TODAY = '2026-10-19'
const iso = n => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const clone = o => JSON.parse(JSON.stringify(o))

// `days` complete days before today eating `kcal`, the weight falling `drop` kg over them,
// weighed every 3 days.
function profile({ days = 21, kcal = 2050, drop = 1.2, from = 80, complete = true, unit = 'kg', nutrition = {} } = {}) {
  let foodLog = {}, foodDays = {}
  for (let i = days; i >= 1; i--) {
    foodLog = withEntry(foodLog, quickEntry({ kcal, p: 150, d: iso(-i) }), 'f' + i, 1)
    if (complete) foodDays = withDayDone(foodDays, iso(-i), true, 1)
  }
  const bodyweight = []
  for (let i = days; i >= 1; i -= 3) {
    const kg = from - drop * (days - i) / (days - 1)
    bodyweight.push({ d: iso(-i), w: Math.round((unit === 'lb' ? kg * 2.2046226218 : kg) * 100) / 100 })
  }
  return {
    unit, targetW: null, bodyweight, measurements: [], foodLog, foodDays, nutritionCheckins: {},
    nutrition: { ...defaultNutrition(), sex: 'male', birthYear: 1994, heightCm: 178, activity: 'moderate', goal: 'lose', pace: 0.5, ...nutrition },
  }
}

describe('learning maintenance', () => {
  it('reads the plan\'s example: 2,050 kcal a day while the trend fell 1.2 kg in 3 weeks is about 2,490', () => {
    const l = learnMaintenance(profile(), { today: TODAY })
    expect(l.ok).toBe(true)
    expect(l.completeDays).toBe(21)
    expect(l.intake).toBe(2050)
    // 1.2 kg over the 20 days the weigh-ins span: 0.06 kg a day × 7,700 = 462 kcal a day
    expect(l.raw).toBeGreaterThan(2470)
    expect(l.raw).toBeLessThan(2530)
    expect(l.trust).toBe(1)
    expect(l.maintenance).toBe(l.raw)
  })

  it('says what is missing: complete days, weigh-ins and how long they span', () => {
    expect(learnMaintenance(profile({ days: 9 }), { today: TODAY })).toMatchObject({ ok: false, need: { days: 1 } })
    const S = profile()
    S.bodyweight = S.bodyweight.slice(-3)
    expect(learnMaintenance(S, { today: TODAY }).need).toMatchObject({ weighIns: 1, span: 8 })
  })

  it('counts only days marked complete, so a half-logged day cannot drag maintenance down', () => {
    const S = profile()
    const base = learnMaintenance(S, { today: TODAY }).raw
    // five more days with a forgotten dinner, not marked complete
    for (let i = 22; i <= 26; i++) S.foodLog = withEntry(S.foodLog, quickEntry({ kcal: 900, d: iso(-i) }), 'h' + i, 1)
    expect(learnMaintenance(S, { today: TODAY }).raw).toBe(base)
    expect(learnMaintenance(profile({ complete: false }), { today: TODAY }).need.days).toBe(10)
  })

  it('leans on the formula while the data is thin', () => {
    const l = learnMaintenance(profile({ days: 16 }), { today: TODAY })
    expect(l.trust).toBeCloseTo(16 / 21, 6)
    expect(l.maintenance).toBeGreaterThan(Math.min(l.raw, l.formula) - 1)
    expect(l.maintenance).toBeLessThan(Math.max(l.raw, l.formula) + 1)
  })

  it('reads a pound profile the same', () => {
    const kg = learnMaintenance(profile(), { today: TODAY }), lb = learnMaintenance(profile({ unit: 'lb' }), { today: TODAY })
    expect(Math.abs(lb.raw - kg.raw)).toBeLessThan(5)
  })
})

describe('the weekly check-in', () => {
  it('suggests the target for the pace from what the log learned, moved at most 10%', () => {
    const S = profile()
    const ci = checkinFor(S, { today: TODAY })
    expect(ci.due).toBe(true)
    expect(ci.current).toBe(computeTargets(S).kcal)
    // learned maintenance ~2,500 against a formula of ~2,690: the target comes down, capped
    expect(ci.suggested).toBeLessThan(ci.current)
    expect(ci.suggested).toBeGreaterThanOrEqual(Math.round(ci.current * (1 - MAX_STEP) / 10) * 10)
  })

  it('caps a big jump at 10% and never goes below resting burn', () => {
    const S = profile({ kcal: 1200, drop: 0.1 })
    const ci = checkinFor(S, { today: TODAY })
    expect(ci.capped).toBe(true)
    expect(ci.change).toBe(Math.round(ci.current * (1 - MAX_STEP) / 10) * 10 - ci.current)
    expect(ci.suggested).toBeGreaterThanOrEqual(computeTargets(S).bmr)
  })

  it('applies only on a tap, and the target then lands exactly where the card said', () => {
    const S = profile()
    const ci = checkinFor(S, { today: TODAY })
    const kept = answerCheckin(clone(S), ci, false, { today: TODAY, id: 'k' })
    expect(computeTargets(kept).kcal).toBe(ci.current)
    expect(checkinsOf(kept)[0]).toMatchObject({ d: TODAY, applied: false, from: ci.current, to: ci.current })
    const applied = answerCheckin(clone(S), ci, true, { today: TODAY, id: 'a' })
    expect(applied.nutrition.maintenance.d).toBe(TODAY)
    expect(computeTargets(applied).kcal).toBe(ci.suggested)
    expect(computeTargets(applied).learned.kcal).toBe(applied.nutrition.maintenance.kcal)
    expect(checkinsOf(applied)[0]).toMatchObject({ applied: true, to: ci.suggested })
  })

  it('moves manual targets by the calories and refills the carbs around the same protein and fat', () => {
    const S = profile({ nutrition: { manual: { kcal: 2600, protein: 160, carbs: 300, fat: 70 } } })
    const ci = checkinFor(S, { today: TODAY })
    expect(ci.current).toBe(2600)
    const out = answerCheckin(clone(S), ci, true, { today: TODAY })
    expect(out.nutrition.manual).toMatchObject({ kcal: ci.suggested, protein: 160, fat: 70, carbs: Math.floor((ci.suggested - 640 - 630) / 4) })
  })

  it('comes round 7 days after the last one answered', () => {
    const S = profile()
    const ci = checkinFor(S, { today: TODAY })
    const done = answerCheckin(clone(S), ci, false, { today: TODAY })
    expect(daysUntilCheckin(done, TODAY)).toBe(7)
    expect(checkinFor(done, { today: iso(3) })).toMatchObject({ due: false, inDays: 4 })
    expect(checkinFor(done, { today: iso(7) }).due).toBe(true)
    // a missed week does not pile up: it is simply due
    expect(daysUntilCheckin(done, iso(20))).toBe(0)
  })

  it('reads the demo history and has a check-in ready', () => {
    const S = { ...buildDemoState(), unit: 'kg' }
    const ci = checkinFor(S)
    expect(ci.due).toBe(true)
    expect(ci.learn.ok).toBe(true)
    expect(ci.learn.completeDays).toBeGreaterThanOrEqual(20)
    // the demo eats about 2,300 a day while losing about 0.34 kg a week: maintenance near 2,650–2,750
    expect(ci.learn.raw).toBeGreaterThan(2550)
    expect(ci.learn.raw).toBeLessThan(2850)
  })
})
