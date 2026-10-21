import { describe, it, expect } from 'vitest'
import { weighIns, trendSeries, weightTrend, weightForTargets, TAU_DAYS } from './weight-trend.js'
import { computeTargets, defaultNutrition } from './nutrition-targets.js'
import { buildDemoState } from './demoSeed.js'

const iso = (start, days) => { const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }
// A steady change of `perWeek` from `from`, weighed every `every` days for `n` weigh-ins.
const steady = (from, perWeek, { n = 12, every = 2, start = '2026-09-01', noise = () => 0 } = {}) =>
  Array.from({ length: n }, (_, i) => ({ d: iso(start, i * every), w: Math.round((from + perWeek / 7 * i * every + noise(i)) * 10) / 10 }))
const profile = (bodyweight, more = {}) => ({ unit: 'kg', targetW: null, bodyweight, ...more })
const today = list => list.at(-1).d

describe('weigh-ins', () => {
  it('keeps one per day, in date order, averaging two on one day and dropping junk', () => {
    const list = weighIns({ bodyweight: [{ d: '2026-09-03', w: 80 }, { d: '2026-09-01', w: 81 }, { d: '2026-09-03', w: 81 }, { d: 'x', w: 3 }, { d: '2026-09-04', w: 0 }] })
    expect(list.map(p => [p.d, p.w])).toEqual([['2026-09-01', 81], ['2026-09-03', 80.5]])
  })

  it('smooths the day-to-day swing, and knows how far apart the weigh-ins are', () => {
    const s = trendSeries(weighIns({ bodyweight: [{ d: '2026-09-01', w: 80 }, { d: '2026-09-02', w: 82 }] }))
    // one day apart: about 10% of the 2 kg jump
    expect(s[1].trend).toBeCloseTo(80 + 2 * (1 - Math.exp(-1 / TAU_DAYS)), 6)
    expect(s[1].trend).toBeGreaterThan(80.19)
    expect(s[1].trend).toBeLessThan(80.21)
    // a week apart, the same jump moves the trend much further
    const w = trendSeries(weighIns({ bodyweight: [{ d: '2026-09-01', w: 80 }, { d: '2026-09-08', w: 82 }] }))
    expect(w[1].trend).toBeGreaterThan(80.9)
  })
})

describe('weight trend', () => {
  it('needs four weigh-ins over ten days before it reads a rate, and says what is missing', () => {
    const t1 = weightTrend(profile(steady(80, -0.5, { n: 3 })), { today: '2026-09-05' })
    expect(t1).toMatchObject({ ok: false, count: 3, needWeighIns: 1, needDays: 6 })
    const t2 = weightTrend(profile(steady(80, -0.5, { n: 5, every: 1 })), { today: '2026-09-05' })
    expect(t2).toMatchObject({ ok: false, needWeighIns: 0, needDays: 6 })
  })

  it('reads the rate a week and as a share of body weight', () => {
    const list = steady(80, -0.5, { n: 15 })
    const tr = weightTrend(profile(list), { today: today(list) })
    expect(tr.ok).toBe(true)
    expect(tr.perWeek).toBeCloseTo(-0.5, 1)
    expect(tr.pctPerWeek).toBeCloseTo(tr.perWeek / tr.trend * 100, 6)
    expect(tr.direction).toBe('down')
    expect(tr.verdict).toBe('steady')
    // three weeks of weigh-ins every other day
    expect(tr.windowDays).toBeLessThanOrEqual(21)
  })

  it('sees through noisy daily weigh-ins', () => {
    const wobble = i => [0.8, -0.6, 0.3, -0.9, 0.5, 0, -0.4, 0.7][i % 8]
    const list = steady(90, -0.6, { n: 28, every: 1, noise: wobble })
    const tr = weightTrend(profile(list), { today: today(list) })
    expect(tr.perWeek).toBeLessThan(-0.3)
    expect(tr.perWeek).toBeGreaterThan(-0.9)
    // the trend sits between the raw extremes of the last week
    const last = list.slice(-7).map(p => p.w)
    expect(tr.trend).toBeLessThan(Math.max(...last))
    expect(tr.trend).toBeGreaterThan(Math.min(...last))
  })

  it('names the pace in percentages, so it fits every body', () => {
    const verdict = (perWeek, from = 80) => { const l = steady(from, perWeek, { n: 15 }); return weightTrend(profile(l), { today: today(l) }).verdict }
    expect(verdict(-0.05)).toBe('holding')
    expect(verdict(-0.24)).toBe('gentle')       // 0.3% a week
    expect(verdict(-0.6)).toBe('steady')        // 0.75%
    expect(verdict(-1.2)).toBe('fast')          // 1.5%
    expect(verdict(-1.2, 140)).toBe('steady')   // the same 1.2 kg is 0.86% of a bigger body
    expect(verdict(0.15)).toBe('gentle')        // gaining 0.19%
    expect(verdict(0.3)).toBe('steady')
    expect(verdict(0.6)).toBe('fast')
  })

  it('dates the goal at this pace and shows how far along it is', () => {
    const list = steady(84, -0.5, { n: 22 })
    const tr = weightTrend(profile(list, { targetW: 78 }), { today: today(list) })
    const g = tr.goal
    expect(g.start).toBe(84)
    expect(g.reached).toBe(false)
    expect(g.remaining).toBeLessThan(0)
    expect(g.progress).toBeGreaterThan(0.3)
    expect(g.progress).toBeLessThan(0.7)
    expect(g.weeks).toBeCloseTo(g.remaining / tr.perWeek, 6)
    expect(g.date > today(list)).toBe(true)
  })

  it('says when the trend moves away from the goal, and projects nothing then', () => {
    const list = steady(80, 0.4, { n: 15 })
    const tr = weightTrend(profile(list, { targetW: 75 }), { today: today(list) })
    expect(tr.verdict).toBe('away')
    expect(tr.goal).toMatchObject({ away: true, weeks: null, date: null })
  })

  it('calls a goal within half a kilo reached', () => {
    const list = steady(77.6, -0.2, { n: 15 })
    const tr = weightTrend(profile(list, { targetW: 77.3 }), { today: today(list) })
    expect(tr.goal.reached).toBe(true)
    expect(tr.goal.progress).toBe(1)
  })

  it('projects nothing from weigh-ins weeks old', () => {
    const list = steady(84, -0.5, { n: 15 })
    const tr = weightTrend(profile(list, { targetW: 78 }), { today: iso(today(list), 30) })
    expect(tr.stale).toBe(true)
    expect(tr.goal.date).toBeNull()
  })

  it('works in pounds the same way', () => {
    const kg = steady(84, -0.5, { n: 15 }), lb = kg.map(p => ({ ...p, w: Math.round(p.w * 2.2046 * 10) / 10 }))
    const a = weightTrend(profile(kg), { today: today(kg) }), b = weightTrend(profile(lb, { unit: 'lb' }), { today: today(lb) })
    expect(b.pctPerWeek).toBeCloseTo(a.pctPerWeek, 1)
    expect(b.verdict).toBe(a.verdict)
    expect(weightForTargets(profile(lb, { unit: 'lb' })).kg).toBeCloseTo(weightForTargets(profile(kg)).kg, 0)
  })
})

describe('nutrition targets follow the trend', () => {
  it('use the trend weight once there is one, the newest weigh-in before that', () => {
    const nutrition = { ...defaultNutrition(), sex: 'male', birthYear: 1994, heightCm: 178, goal: 'maintain' }
    const few = profile([{ d: '2026-09-01', w: 80 }, { d: '2026-09-03', w: 82 }], { nutrition })
    expect(weightForTargets(few)).toEqual({ kg: 82, source: 'latest' })
    expect(computeTargets(few).weightSource).toBe('latest')
    // a heavy weigh-in after a steady fortnight moves the trend a little, not the full 1.5 kg
    const list = [...steady(80, 0, { n: 8 }), { d: '2026-09-16', w: 81.5 }]
    const S = profile(list, { nutrition })
    const w = weightForTargets(S)
    expect(w.source).toBe('trend')
    expect(w.kg).toBeGreaterThan(80)
    expect(w.kg).toBeLessThan(80.5)
    expect(computeTargets(S).kg).toBe(w.kg)
  })

  it('reads the demo history as a steady cut towards its goal', () => {
    const S = buildDemoState()
    const tr = weightTrend(S)
    expect(tr.ok).toBe(true)
    expect(tr.direction).toBe('down')
    expect(['gentle', 'steady']).toContain(tr.verdict)
    expect(tr.goal.target).toBe(77)
    expect(tr.goal.progress).toBeGreaterThan(0.5)
  })
})
