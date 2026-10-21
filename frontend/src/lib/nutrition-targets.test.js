import { describe, it, expect } from 'vitest'
import {
  computeTargets, restingBurn, bodyKg, goalDirection, goalOf, missingInputs, bodyFatOf, proteinPerUnit, defaultNutrition,
} from './nutrition-targets.js'

const today = new Date('2026-10-19T12:00:00')
// The plan's worked example: 78.3 kg, 178 cm, 32 years, moderately active, losing 0.5% a week.
const profile = (nutrition = {}, more = {}) => ({
  unit: 'kg', targetW: null, measurements: [],
  bodyweight: [{ d: '2026-10-01', w: 80 }, { d: '2026-10-18', w: 78.3 }],
  nutrition: { ...defaultNutrition(), sex: 'male', birthYear: 1994, heightCm: 178, activity: 'moderate', goal: 'lose', pace: 0.5, ...nutrition },
  ...more,
})

describe('nutrition targets', () => {
  it('works out the plan\'s example step by step', () => {
    const t = computeTargets(profile(), { today })
    expect(t.ok).toBe(true)
    expect(Math.round(t.bmr)).toBe(1741)        // 783 + 1112.5 − 160 + 5
    expect(Math.round(t.tdee)).toBe(2698)       // × 1.55
    expect(Math.round(t.delta)).toBe(-431)      // 0.5% × 78.3 kg × 7700 kcal / 7 days
    expect(t.kcal).toBe(2270)
    expect(t.protein).toBe(157)                 // 2.0 g/kg when losing
    expect(t.fat).toBe(63)                      // 25% of calories
    expect(t.carbs).toBe(268)                   // the rest, rounded down
    expect(t.protein * 4 + t.carbs * 4 + t.fat * 9).toBeLessThanOrEqual(t.kcal)
    expect(t.weeklyKg).toBeCloseTo(-0.39, 2)
  })

  it('uses the female constant of the formula', () => {
    expect(restingBurn({ sex: 'female', kg: 60, cm: 165, age: 30 })).toBe(600 + 1031.25 - 150 - 161)
  })

  it('never goes below resting burn, however fast the pace asked for', () => {
    const t = computeTargets(profile({ activity: 'sedentary', pace: 1 }), { today })
    // 1% of 78.3 kg is 861 kcal a day: 1.2 × 1741 − 861 would land under the resting burn
    expect(t.floored).toBe(true)
    expect(t.kcal).toBeGreaterThanOrEqual(Math.round(t.bmr / 10) * 10)
  })

  it('caps the pace at 1% a week losing and 0.5% gaining', () => {
    expect(computeTargets(profile({ activity: 'athlete', pace: 3 }), { today }).pace).toBe(1)
    expect(computeTargets(profile({ goal: 'gain', pace: 2 }), { today }).pace).toBe(0.5)
  })

  it('sets no deficit under 18', () => {
    const t = computeTargets(profile({ birthYear: 2010 }), { today })
    expect(t.minor).toBe(true)
    expect(t.delta).toBe(0)
    expect(t.kcal).toBe(Math.round(t.tdee / 10) * 10)
    // a surplus is still allowed
    expect(computeTargets(profile({ birthYear: 2010, goal: 'gain', pace: 0.25 }), { today }).delta).toBeGreaterThan(0)
  })

  it('takes recomp as a small deficit with high protein', () => {
    const t = computeTargets(profile({ goal: 'recomp', pace: 1 }), { today })
    expect(t.pace).toBe(0.25)
    expect(t.proteinPerKg).toBe(2.0)
    expect(t.delta).toBeLessThan(0)
  })

  it('defaults protein to 1.8 g/kg when not losing, and keeps a chosen value in range', () => {
    expect(computeTargets(profile({ goal: 'maintain' }), { today }).proteinPerKg).toBe(1.8)
    expect(computeTargets(profile({ proteinPerKg: 3 }), { today }).proteinPerKg).toBe(2.4)
    expect(computeTargets(profile({ fatPct: 10 }), { today }).fatPct).toBe(20)
  })

  it('bases protein on lean mass when body fat is logged above 20%', () => {
    const lean = profile({}, { measurements: [{ d: '2026-10-10', bodyFat: 35 }] })
    expect(bodyFatOf(lean)).toBe(0.35)
    const t = computeTargets(lean, { today })
    expect(t.lean).toBe(true)
    expect(t.protein).toBe(Math.round(2.0 * 78.3 * 0.65 / 0.8))
    const athletic = profile({}, { measurements: [{ d: '2026-10-10', bodyFat: 12 }] })
    expect(computeTargets(athletic, { today }).protein).toBe(157)
  })

  it('takes the direction from the body-weight goal when none is picked', () => {
    const S = profile({ goal: null }, { targetW: 74 })
    expect(goalDirection(S)).toBe('lose')
    expect(goalOf(S)).toBe('lose')
    expect(goalOf({ ...S, targetW: 82 })).toBe('gain')
    expect(goalOf({ ...S, targetW: 78.5 })).toBe('maintain')
    expect(goalOf({ ...S, targetW: null })).toBe('maintain')
  })

  it('reads a pound profile in kilograms', () => {
    const S = profile({}, { unit: 'lb', bodyweight: [{ d: '2026-10-18', w: 172.6 }], targetW: 165 })
    expect(bodyKg(S)).toBeCloseTo(78.3, 1)
    expect(goalDirection(S)).toBe('lose')
    expect(proteinPerUnit(2.0, 'lb')).toBe(0.91)
    expect(proteinPerUnit(2.0, 'kg')).toBe(2.0)
  })

  it('says what is missing before it can work anything out', () => {
    const S = { unit: 'kg', bodyweight: [], nutrition: defaultNutrition() }
    expect(missingInputs(S)).toEqual(['weight', 'height', 'birthYear', 'sex'])
    expect(computeTargets(S, { today })).toEqual({ ok: false, missing: ['weight', 'height', 'birthYear', 'sex'] })
  })

  it('lets manual targets stand in, with or without the maths', () => {
    const manual = { kcal: 2500, protein: 180, carbs: 280, fat: 70 }
    const t = computeTargets(profile({ manual }), { today })
    expect(t).toMatchObject({ manual: true, kcal: 2500, protein: 180, carbs: 280, fat: 70 })
    expect(t.bmr).toBeGreaterThan(0)
    const bare = computeTargets({ unit: 'kg', bodyweight: [], nutrition: { ...defaultNutrition(), manual } }, { today })
    expect(bare).toMatchObject({ ok: true, manual: true, kcal: 2500 })
  })
})
