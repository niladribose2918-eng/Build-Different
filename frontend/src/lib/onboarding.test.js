import { describe, it, expect } from 'vitest'
import { firstMonthSteps, showFirstMonth, FIRST_DAYS } from './onboarding.js'
import { addDays } from './insights.js'
import { withGoal } from './goals.js'

const TODAY = '2026-10-19'
const workout = (d, sets = [], more = {}) => ({ id: d, d, start: Date.parse(d + 'T10:00:00'), entries: [{ id: '0025', sets }], ...more })
const fresh = (more = {}) => ({ unit: 'kg', routines: [{ id: 'r1', name: 'A', ex: [] }], workouts: [], bodyweight: [], goals: {}, hints: {}, ...more })
const doneOf = S => Object.fromEntries(firstMonthSteps(S).map(s => [s.key, s.done]))

describe('first-month checklist', () => {
  it('ticks each step off from the log', () => {
    expect(Object.values(doneOf(fresh())).every(v => v === false)).toBe(true)
    const S = fresh({
      workouts: [workout('2026-10-12', [{ w: 60, r: 8, done: true, rir: 2 }], { prs: ['0025'] }), workout('2026-10-14'), workout('2026-10-16')],
      bodyweight: [{ d: '2026-10-12', w: 80 }, { d: '2026-10-19', w: 79.6 }],
      goals: withGoal({}, { kind: 'freq', n: 3, from: TODAY }, 'g', 1),
    })
    expect(doneOf(S)).toEqual({ workout: true, goal: true, effort: true, threeInWeek: true, weighTwice: true, pr: true })
    // an effort typed on a set never done does not count, and the weight goal is a goal too
    expect(doneOf(fresh({ workouts: [workout(TODAY, [{ w: 60, r: 8, rir: 2 }])], targetW: 75 }))).toMatchObject({ effort: false, goal: true })
  })

  it('shows for a new lifter once there is a plan, never for one with months behind them', () => {
    expect(showFirstMonth(fresh(), { today: TODAY })).toBe(true)
    expect(showFirstMonth(fresh({ routines: [] }), { today: TODAY })).toBe(false)
    expect(showFirstMonth(fresh({ workouts: [workout(addDays(TODAY, -10))] }), { today: TODAY })).toBe(true)
    expect(showFirstMonth(fresh({ workouts: [workout(addDays(TODAY, -FIRST_DAYS - 1))] }), { today: TODAY })).toBe(false)
  })

  it('goes for good when dismissed or when every step is done', () => {
    expect(showFirstMonth(fresh({ hints: { firstMonthDone: true } }), { today: TODAY })).toBe(false)
    const all = fresh({
      workouts: [workout('2026-10-12', [{ w: 60, r: 8, done: true, rpe: 8 }], { prs: ['0025'] }), workout('2026-10-14'), workout('2026-10-16')],
      bodyweight: [{ d: '2026-10-12', w: 80 }, { d: '2026-10-19', w: 79.6 }], targetW: 75,
    })
    expect(showFirstMonth(all, { today: TODAY })).toBe(false)
  })
})
