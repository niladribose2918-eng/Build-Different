import { describe, it, expect } from 'vitest'
import { periodWindow, periodStats, periodReport, liftsMoved, defaultPeriod, change, addDays } from './insights.js'
import { MONDAY, SUNDAY } from './format.js'
import { e1rmSeries } from './onerm.js'

const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const day = d => Date.parse(d + 'T10:00:00')
const workout = (id, d, entries, more = {}) => ({ id, d, start: day(d), end: day(d) + 3600000, entries, ...more })
const entry = (id, sets) => ({ id, target: { mode: 'reps' }, sets })
const BENCH = '0025', SQUAT = '0043'

describe('period windows', () => {
  it('compares a running week with the same days of the week before', () => {
    // Monday 19 Oct 2026: one day against one day, never against a whole week.
    expect(periodWindow('week', '2026-10-19', MONDAY)).toEqual({
      kind: 'week', from: '2026-10-19', to: '2026-10-19', prevFrom: '2026-10-12', prevTo: '2026-10-12', partial: true,
    })
    expect(periodWindow('week', '2026-10-22', MONDAY)).toMatchObject({ from: '2026-10-19', to: '2026-10-22', prevFrom: '2026-10-12', prevTo: '2026-10-15' })
  })
  it('reads last week as two whole weeks, on the profile\'s week start', () => {
    expect(periodWindow('lastWeek', '2026-10-19', MONDAY)).toMatchObject({ from: '2026-10-12', to: '2026-10-18', prevFrom: '2026-10-05', prevTo: '2026-10-11', partial: false })
    expect(periodWindow('lastWeek', '2026-10-19', SUNDAY)).toMatchObject({ from: '2026-10-11', to: '2026-10-17' })
  })
  it('compares a running month with as many days of the month before, never past its end', () => {
    expect(periodWindow('month', '2026-10-19')).toMatchObject({ from: '2026-10-01', to: '2026-10-19', prevFrom: '2026-09-01', prevTo: '2026-09-19' })
    // 31 March against February: the comparison stops at the end of February.
    expect(periodWindow('month', '2026-03-31')).toMatchObject({ prevFrom: '2026-02-01', prevTo: '2026-02-28' })
    expect(periodWindow('lastMonth', '2026-03-10')).toMatchObject({ from: '2026-02-01', to: '2026-02-28', prevFrom: '2026-01-01', prevTo: '2026-01-31' })
  })
  it('crosses a year boundary', () => {
    expect(periodWindow('lastMonth', '2026-01-05')).toMatchObject({ from: '2025-12-01', to: '2025-12-31', prevFrom: '2025-11-01', prevTo: '2025-11-30' })
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('period totals', () => {
  const S = {
    workouts: [
      workout('a', '2026-10-12', [entry(BENCH, [set(20, 10, { phase: 'warmup' }), set(60, 8), set(60, 8)])], { vol: 960, prs: [BENCH] }),
      workout('b', '2026-10-14', [entry(SQUAT, [set(100, 5)])], { vol: 500 }),
      workout('c', '2026-10-14', [entry(BENCH, [set(62.5, 8)])]),
      workout('d', '2026-10-06', [entry(BENCH, [set(57.5, 8)])], { vol: 460 }),
    ],
  }
  it('counts working sets, volume, time, PRs and days inside the window only', () => {
    expect(periodStats(S, '2026-10-12', '2026-10-18')).toEqual({ workouts: 3, days: 2, sets: 4, volume: 960 + 500 + 500, ms: 3 * 3600000, prs: 1 })
  })
  it('reports each figure against the period before', () => {
    const r = periodReport(S, 'lastWeek', '2026-10-19', MONDAY)
    expect(r.delta.workouts).toEqual({ cur: 3, prev: 1, diff: 2, pct: 200 })
    expect(r.delta.prs.pct).toBe(null)
    expect(change(5, 0)).toEqual({ cur: 5, prev: 0, diff: 5, pct: null })
  })
})

describe('lifts that moved', () => {
  const S = {
    unit: 'kg',
    workouts: [
      workout('a', '2026-09-28', [entry(BENCH, [set(70, 8)]), entry(SQUAT, [set(100, 5)])]),
      workout('b', '2026-10-05', [entry(BENCH, [set(72.5, 8)]), entry(SQUAT, [set(100, 5)])]),
      workout('c', '2026-10-13', [entry(BENCH, [set(75, 8)]), entry(SQUAT, [set(97.5, 5)])]),
      workout('d', '2026-10-15', [entry('new-lift', [set(20, 10)])]),
    ],
  }
  it('holds the best estimate in the period against the last session before it, biggest gain first', () => {
    const moved = liftsMoved(S, '2026-10-12', '2026-10-18')
    expect(moved.map(m => m.id)).toEqual([BENCH, SQUAT])
    const bench = moved[0]
    expect(bench.before).toBe(e1rmSeries(S, BENCH).find(p => p.d === '2026-10-05').y)
    expect(bench.now).toBe(95)
    expect(bench.pct).toBeGreaterThan(0)
    expect(moved[1].pct).toBeLessThan(0)
  })
  it('leaves out a lift with nothing before the period', () => {
    expect(liftsMoved(S, '2026-10-12', '2026-10-18').some(m => m.id === 'new-lift')).toBe(false)
  })
})

describe('the period the screen opens on', () => {
  it('opens on last week in the first two days of a week, otherwise on what was picked', () => {
    expect(defaultPeriod(null, '2026-10-19', MONDAY)).toBe('lastWeek')
    expect(defaultPeriod(null, '2026-10-20', MONDAY)).toBe('lastWeek')
    expect(defaultPeriod(null, '2026-10-21', MONDAY)).toBe('week')
    expect(defaultPeriod('month', '2026-10-19', MONDAY)).toBe('month')
    expect(defaultPeriod('nonsense', '2026-10-22', MONDAY)).toBe('week')
  })
})
