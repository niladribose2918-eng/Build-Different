import { describe, it, expect } from 'vitest'
import { milestonesOf, milestonesView, milestonesEarnedBy, strengthMarkers, STEPS } from './milestones.js'
import { quickEntry, withEntry } from './food-log.js'

const TODAY = '2026-10-19'
const BENCH = '0025', SQUAT = '0043'
const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const workout = (id, d, entries = [], more = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00'), entries, ...more })
const lift = (ex, sets) => ({ id: ex, target: { mode: 'reps' }, sets })
const state = (more = {}) => ({ unit: 'kg', workouts: [], bodyweight: [], measurements: [], routines: [], week: {}, goals: {}, foodLog: {}, ...more })
const byId = (list, id) => list.find(m => m.id === id)
// One workout a week on Mondays, counting back from 19 Oct.
const weekly = (n, f = () => []) => Array.from({ length: n }, (_, i) => {
  const d = new Date('2026-10-19T12:00:00'); d.setDate(d.getDate() - 7 * (n - 1 - i))
  return workout('w' + i, d.toISOString().slice(0, 10), f(i))
})

describe('milestones', () => {
  it('date each one from the history, old ones keeping their old dates', () => {
    const S = state({ workouts: weekly(12) })
    const list = milestonesOf(S, { today: TODAY })
    expect(byId(list, 'workouts:1').earned).toBe('2026-08-03')
    expect(byId(list, 'workouts:10').earned).toBe('2026-10-05')
    expect(byId(list, 'workouts:25')).toMatchObject({ earned: null, cur: 12, of: 25 })
    expect(byId(list, 'streak:4').earned).toBe('2026-08-24')
    expect(byId(list, 'streak:12').earned).toBe('2026-10-19')
  })

  it('count volume in round numbers of the profile unit, and PR badges', () => {
    const S = state({ workouts: weekly(3, i => [lift(SQUAT, [set(100, 10), set(100, 10)])]).map((w, i) => ({ ...w, vol: 5000, prs: i === 1 ? [SQUAT] : [] })) })
    const kg = milestonesOf(S, { today: TODAY })
    expect(byId(kg, 'volume:10000').earned).toBe('2026-10-12')
    expect(byId(kg, 'records:1').earned).toBe('2026-10-12')
    expect(STEPS.volume.lb[0]).toBe(25000)
    expect(byId(milestonesOf({ ...S, unit: 'lb' }, { today: TODAY }), 'volume:25000')).toMatchObject({ earned: null, cur: 15000, unit: 'lb' })
  })

  it('name only what a workout itself earned, for the finish screen', () => {
    const before = weekly(9)
    const w = workout('new', TODAY)
    const S = state({ workouts: [...before.slice(1), w] })
    // the 10th workout would be earned only with one more; with the new one it is reached
    const S10 = state({ workouts: [...before, w] })
    expect(milestonesEarnedBy(S10, w, { today: TODAY }).map(m => m.id)).toContain('workouts:10')
    expect(milestonesEarnedBy(S, w, { today: TODAY }).map(m => m.id)).not.toContain('workouts:1')
    expect(milestonesEarnedBy({ ...S10, showMilestones: false }, w, { today: TODAY })).toEqual([])
  })
})

describe('strength markers', () => {
  const bw = (d, w) => ({ d, w, t: Date.parse(d + 'T08:00:00') })

  it('read the best estimated 1RM against body weight that day, from sets of 10 reps or fewer', () => {
    const S = state({
      bodyweight: [bw('2026-09-01', 80)],
      workouts: [
        workout('a', '2026-09-07', [lift(BENCH, [set(60, 15)])]),        // 15 reps: not counted
        workout('b', '2026-09-14', [lift(BENCH, [set(60, 10)])]),        // Epley 80 → 1.0×
      ],
    })
    const m = strengthMarkers(S).bench
    expect(m.ratio).toBeCloseTo(1, 5)
    expect(m.earned).toEqual(['2026-09-14', '2026-09-14', null, null])
  })

  it('keep a marker once earned when body weight goes up later, and use a session’s own weight', () => {
    const S = state({
      bodyweight: [bw('2026-09-01', 80), bw('2026-10-01', 95)],
      workouts: [workout('a', '2026-09-14', [lift(BENCH, [set(80, 1)])]), workout('b', '2026-10-05', [lift(BENCH, [set(80, 1)])], { bw: 100 })],
    })
    const list = milestonesOf(S, { today: TODAY })
    expect(byId(list, 'strength:bench:1').earned).toBe('2026-09-14')
    expect(byId(list, 'strength:bench:1.25')).toMatchObject({ earned: null, cur: 1, of: 1.25 })
    expect(strengthMarkers({ ...S, workouts: [S.workouts[1]] }).bench.ratio).toBeCloseTo(0.8, 5)
  })

  it('stay out of lifts never trained, and away when switched off', () => {
    const S = state({ bodyweight: [bw('2026-09-01', 80)], workouts: [workout('a', '2026-09-14', [lift(BENCH, [set(80, 1)])])] })
    const ids = milestonesOf(S, { today: TODAY }).filter(m => m.group === 'strength').map(m => m.id)
    expect(ids.every(id => id.startsWith('strength:bench'))).toBe(true)
    expect(milestonesOf({ ...S, showStrengthMarkers: false }, { today: TODAY }).some(m => m.group === 'strength')).toBe(false)
  })
})

describe('body and nutrition milestones', () => {
  it('mark the first weigh-in, the first check-in and the weight goal by its trend', () => {
    const days = ['2026-09-01', '2026-09-05', '2026-09-10', '2026-09-15', '2026-09-20', '2026-09-25', '2026-09-30']
    const weights = [82, 81.5, 80.6, 80, 79.2, 78.6, 78.4]
    const S = state({ targetW: 79, bodyweight: days.map((d, i) => ({ d, w: weights[i], t: Date.parse(d + 'T08:00:00') })),
      measurements: [{ d: '2026-09-02', t: 0, waist: 88 }] })
    const list = milestonesOf(S, { today: TODAY })
    expect(byId(list, 'weighIns:1').earned).toBe('2026-09-01')
    expect(byId(list, 'weighIns:10')).toMatchObject({ earned: null, cur: 7 })
    expect(byId(list, 'measure:1').earned).toBe('2026-09-02')
    const goal = byId(list, 'weightGoal')
    expect(goal.earned > '2026-09-15').toBe(true)
    expect(goal.earned <= '2026-09-30').toBe(true)
  })

  it('count days of food logged and protein hit, once Nutrition is in use', () => {
    let foodLog = {}
    const d = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']
    d.forEach((day, i) => { foodLog = withEntry(foodLog, quickEntry({ kcal: 2000, p: i < 5 ? 150 : 60, d: day }), 'e' + i, i) })
    const S = state({ foodLog, nutrition: { manual: { kcal: 2200, protein: 150, carbs: 220, fat: 70 } } })
    const list = milestonesOf(S, { today: TODAY })
    expect(byId(list, 'foodDays:7').earned).toBe('2026-10-16')
    expect(byId(list, 'proteinDays:7')).toMatchObject({ earned: null, cur: 5 })
    expect(milestonesOf(state(), { today: TODAY }).some(m => m.group === 'foodDays')).toBe(false)
  })
})

describe('the milestones card', () => {
  it('lists earned ones newest first, the next step of each ladder nearest first, and the week’s new ones', () => {
    const S = state({ workouts: weekly(12) })
    const v = milestonesView(S, { today: TODAY })
    expect(v.earned[0].earned).toBe(TODAY)
    expect(v.recent.map(m => m.id)).toEqual(expect.arrayContaining(['streak:12']))
    const groups = v.next.map(m => m.group)
    expect(new Set(groups).size).toBe(groups.length)
    expect(v.next.map(m => m.pct)).toEqual([...v.next.map(m => m.pct)].sort((a, b) => b - a))
  })
})
