import { describe, it, expect } from 'vitest'
import {
  readGoal, goalsOf, withGoal, withoutGoal, liftWeight, toGoalKg, liftStatus, freqStatus, measureStatus,
  goalsView, nearestGoal, goalsReachedBy, weeklyTarget, liftGoalOk, MAX_ACTIVE,
} from './goals.js'
import { estimate1RM } from './onerm.js'
import { convertStateUnit } from './units.js'

const TODAY = '2026-10-19'
const BENCH = '0025'
const DIP_ASSIST = '0009'
const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const workout = (id, d, entries) => ({ id, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), entries })
const bench = (id, d, sets) => workout(id, d, [{ id: BENCH, target: { mode: 'reps' }, sets }])
const state = (more = {}) => ({ unit: 'kg', workouts: [], bodyweight: [], measurements: [], goals: {}, routines: [], week: {}, ...more })
const lift = (kg, r = 1, from = '2026-09-01') => ({ kind: 'lift', ex: BENCH, kg, r, from })
// Five weeks of bench, the best set climbing 2.5 kg a week.
const climbing = [
  bench('w1', '2026-09-21', [set(80, 5)]), bench('w2', '2026-09-28', [set(82.5, 5)]), bench('w3', '2026-10-05', [set(85, 5)]),
  bench('w4', '2026-10-12', [set(87.5, 5)]), bench('w5', '2026-10-19', [set(90, 5, { phase: 'warmup' }), set(90, 5)]),
]

describe('storing goals', () => {
  it('keeps only what you asked for, stamped per goal, and removes with a stamped empty entry', () => {
    let m = withGoal({}, { ...lift(100), extra: 'junk' }, 'g1', 5)
    expect(m.g1).toEqual({ kind: 'lift', ex: BENCH, kg: 100, r: 1, from: '2026-09-01', _ts: 5 })
    m = withGoal(m, { kind: 'freq', n: 3, from: TODAY }, 'g2', 6)
    expect(goalsOf({ goals: m }).map(g => g.id)).toEqual(['g1', 'g2'])
    m = withoutGoal(m, 'g1', 7)
    expect(m.g1).toEqual({ _ts: 7 })
    expect(goalsOf({ goals: m }).map(g => g.id)).toEqual(['g2'])
  })

  it('refuses goals that cannot be measured', () => {
    expect(readGoal({ ...lift(100), r: 12 })).toBeNull()
    expect(readGoal({ ...lift(0) })).toBeNull()
    expect(readGoal({ kind: 'freq', n: 8, from: TODAY })).toBeNull()
    expect(readGoal({ kind: 'measure', field: 'waist', target: 80, start: 80, from: TODAY })).toBeNull()
    expect(readGoal({ kind: 'measure', field: 'nose', target: 80, start: 90, from: TODAY })).toBeNull()
    expect(readGoal({ kind: 'measure', field: 'other:abc', target: 30, start: 32, from: TODAY })).not.toBeNull()
    expect(liftGoalOk(BENCH)).toBe(true)
    expect(liftGoalOk(DIP_ASSIST)).toBe(false)
  })

  it('keeps a lift weight in kg, so switching units never rewrites it', () => {
    expect(toGoalKg(225, 'lb')).toBeCloseTo(102.06, 2)
    expect(liftWeight({ kg: toGoalKg(225, 'lb') }, 'lb')).toBeCloseTo(225, 6)
    expect(liftWeight({ kg: 100 }, 'kg')).toBe(100)
  })
})

describe('a lift goal', () => {
  it('fills with the best estimated 1RM, but is reached only by a real set', () => {
    const S = state({ workouts: climbing })
    const st = liftStatus(S, lift(100), { today: TODAY })
    expect(st.e1rm).toBe(estimate1RM(90, 5))
    // the bar is full at the target's estimate, never past it
    expect(st.pct).toBe(1)
    expect(liftStatus(S, lift(120), { today: TODAY }).pct).toBeCloseTo(st.e1rm / 120, 5)
    expect(st.done).toBeNull()
    // 90 × 5 already estimates past 100 × 1: ready to test, not done
    expect(st.ready).toBe(true)
    expect(st.date).toBeNull()
  })

  it('counts the first set that meets it, from the day it was set, warm-ups aside', () => {
    const S = state({ workouts: [bench('a', '2026-08-20', [set(100, 1)]), bench('b', '2026-09-10', [set(100, 1, { phase: 'warmup' }), set(95, 3)]), bench('c', '2026-10-01', [set(100, 2)])] })
    const st = liftStatus(S, lift(100), { today: TODAY })
    expect(st.done).toMatchObject({ d: '2026-10-01', w: 100, r: 2 })
    expect(liftStatus(S, lift(100, 3), { today: TODAY }).done).toBeNull()
  })

  it('gives an expected date only while the trend climbs, and not past a year', () => {
    const S = state({ workouts: climbing })
    const st = liftStatus(S, lift(110, 3), { today: TODAY })
    expect(st.ready).toBe(false)
    expect(st.date > TODAY).toBe(true)
    expect(st.date < '2027-01-01').toBe(true)
    const falling = state({ workouts: climbing.map((w, i) => ({ ...w, d: ['2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21'][i] })) })
    expect(liftStatus(falling, lift(110, 3), { today: TODAY }).date).toBeNull()
    expect(liftStatus(state({ workouts: climbing.slice(-2) }), lift(110, 3), { today: TODAY }).date).toBeNull()
    expect(liftStatus(S, lift(400, 1), { today: TODAY }).date).toBeNull()
  })

  it('stays met after the profile switches to lb, and is met by a set logged in lb', () => {
    const S = state({ workouts: [bench('a', '2026-10-01', [set(100, 1)])] })
    expect(liftStatus(convertStateUnit(S, 'lb'), lift(100), { today: TODAY }).done).toBeTruthy()
    const lb = state({ unit: 'lb', workouts: [bench('a', '2026-10-01', [set(225, 1)])] })
    const g = lift(toGoalKg(225, 'lb'))
    expect(liftStatus(lb, g, { today: TODAY }).done).toBeTruthy()
    expect(liftStatus(convertStateUnit(lb, 'kg'), g, { today: TODAY }).done).toBeTruthy()
    // a real microplate short is still short
    expect(liftStatus(state({ workouts: [bench('a', '2026-10-01', [set(99.75, 1)])] }), lift(100), { today: TODAY }).done).toBeNull()
  })

  it('names the workout that reached it, for the finish screen', () => {
    const w = bench('new', TODAY, [set(100, 1)])
    const S = state({ workouts: [...climbing.slice(0, 4), w], goals: withGoal({}, lift(100), 'g1', 1) })
    expect(goalsReachedBy(S, w, { today: TODAY }).map(g => g.id)).toEqual(['g1'])
    expect(goalsReachedBy(S, climbing[0], { today: TODAY })).toEqual([])
  })
})

describe('a sessions-a-week goal', () => {
  it('reads as a hit rate over the finished weeks, an excused week left out', () => {
    const days = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-19']
    const S = state({ workouts: days.map((d, i) => workout('w' + i, d, [])), dayNotes: { '2026-09-30': { tag: 'sick', _ts: 1 }, '2026-10-02': { tag: 'sick', _ts: 1 } } })
    const st = freqStatus(S, { kind: 'freq', n: 3, from: TODAY }, { today: TODAY })
    expect(st).toMatchObject({ n: 3, thisWeek: 1, hit: 2, of: 3 })
  })

  it('is the streak target, else the plan', () => {
    const planned = state({ routines: [{ id: 'r1', name: 'A', ex: [] }], week: { 1: ['r1'], 3: ['r1'] } })
    expect(weeklyTarget(planned, TODAY)).toBe(2)
    expect(weeklyTarget({ ...planned, goals: withGoal({}, { kind: 'freq', n: 4, from: TODAY }, 'f', 1) }, TODAY)).toBe(4)
    expect(weeklyTarget(state(), TODAY)).toBe(0)
  })
})

describe('a measurement goal', () => {
  const m = (d, waist) => ({ d, t: Date.parse(d + 'T12:00:00'), waist })
  it('works out lower or higher from where it started, and dates the trend', () => {
    const S = state({ measurements: [m('2026-08-20', 92), m('2026-09-10', 90), m('2026-09-24', 88.5), m('2026-10-15', 86.5)] })
    const g = { kind: 'measure', field: 'waist', target: 80, start: 90, from: '2026-09-10' }
    const st = measureStatus(S, g, { today: TODAY })
    expect(st).toMatchObject({ cur: 86.5, lower: true, done: null })
    expect(st.pct).toBeCloseTo(0.35, 5)
    expect(st.date > TODAY).toBe(true)
    // a check-in before the goal was set does not reach it
    const early = { kind: 'measure', field: 'waist', target: 91, start: 93, from: '2026-09-01' }
    expect(measureStatus(S, early, { today: TODAY }).done).toMatchObject({ d: '2026-09-10', v: 90 })
    const up = { kind: 'measure', field: 'waist', target: 95, start: 90, from: '2026-09-10' }
    expect(measureStatus(S, up, { today: TODAY })).toMatchObject({ lower: false, pct: 0, date: null })
  })
})

describe('the goals list', () => {
  it('splits running and achieved goals, lists the weight goal, and caps the running ones', () => {
    let goals = withGoal({}, lift(100, 3), 'g1', 1)
    goals = withGoal(goals, lift(80), 'g2', 2)
    const S = state({ workouts: climbing, goals, targetW: 77 })
    const v = goalsView(S, { today: TODAY })
    expect(v.active.map(g => g.id)).toEqual(['g1'])
    expect(v.achieved.map(g => [g.id, g.status.done.d])).toEqual([['g2', '2026-09-21']])
    expect(v.weight.target).toBe(77)
    expect(v.full).toBe(false)
    for (let i = 0; i < MAX_ACTIVE; i++) goals = withGoal(goals, { kind: 'freq', n: 3, from: TODAY }, 'f' + i, 10 + i)
    expect(goalsView({ ...S, goals }, { today: TODAY }).full).toBe(true)
  })

  it('puts the goal nearest done on Home', () => {
    let goals = withGoal({}, lift(150, 1), 'far', 1)
    goals = withGoal(goals, lift(105, 1), 'near', 2)
    goals = withGoal(goals, { kind: 'freq', n: 3, from: TODAY }, 'f', 3)
    expect(nearestGoal(state({ workouts: climbing, goals }), { today: TODAY }).id).toBe('near')
    expect(nearestGoal(state({ goals: withGoal({}, { kind: 'freq', n: 3, from: TODAY }, 'f', 3) }), { today: TODAY }).kind).toBe('freq')
    expect(nearestGoal(state(), { today: TODAY })).toBeNull()
  })
})
