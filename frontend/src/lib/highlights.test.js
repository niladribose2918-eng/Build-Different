import { describe, it, expect } from 'vitest'
import {
  highlightsFor, recordsRule, liftUpRule, consistencyRule, plateauRule, neglectedRule, volumeSpikeRule, missedDayRule,
  proteinTrainingRule, underfuelRule, flatWhileLoggingRule, leanHeldRule,
} from './highlights.js'
import { periodWindow, addDays } from './insights.js'
import { buildDemoState } from './demoSeed.js'
import { todayISO, MONDAY } from './format.js'
import { musclesOf } from './muscles.js'
import { EXIDX } from './exercises.js'

const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const day = d => Date.parse(d + 'T10:00:00')
const workout = (id, d, entries, more = {}) => ({ id, d, start: day(d), end: day(d) + 3600000, entries, ...more })
const entry = (id, sets) => ({ id, target: { mode: 'reps' }, sets })
const BENCH = '0025', ROW = '0027', SQUAT = '0043'
const routine = (id, ex) => ({ id, name: id, ex: ex.map(e => ({ id: e, sets: 3, reps: 8, mode: 'reps' })) })
const base = (more = {}) => ({ unit: 'kg', weekStart: 1, workouts: [], routines: [], week: {}, dayPlan: {}, dayNotes: {}, queue: null, scheduleMode: null, ...more })
const lastWeek = periodWindow('lastWeek', '2026-10-19', MONDAY) // 12–18 Oct

// One workout a week on `weekday` offsets from Monday 7 Sep, with the sets `make(i)` returns.
const weekly = (n, offset, make) => Array.from({ length: n }, (_, i) => {
  const d = addDays('2026-09-07', i * 7 + offset)
  return workout('w' + offset + '-' + i, d, make(i))
})

describe('records', () => {
  it('counts the badges in the period and the one before', () => {
    const S = base({ workouts: [
      workout('a', '2026-10-13', [entry(BENCH, [set(80, 5)])], { prs: [BENCH, ROW] }),
      workout('b', '2026-10-07', [entry(BENCH, [set(77.5, 5)])], { prs: [BENCH] }),
    ] })
    expect(recordsRule(S, lastWeek)).toEqual({ id: 'records', tone: 'good', data: { n: 2, prev: 1 } })
    expect(recordsRule(base(), lastWeek)).toBeNull()
  })
})

describe('lift up', () => {
  it('names the biggest gain over 4 weeks once there are 3 sessions and 2.5 % to show', () => {
    const S = base({ workouts: [
      ...weekly(6, 0, i => [entry(BENCH, [set(70 + i * 2.5, 8)])]),
      ...weekly(6, 2, () => [entry(ROW, [set(60, 8)])]),
    ] })
    const h = liftUpRule(S, lastWeek)
    expect(h.data.id).toBe(BENCH)
    expect(h.data.pct).toBeGreaterThanOrEqual(2.5)
  })
  it('stays quiet for small changes', () => {
    const S = base({ workouts: weekly(6, 0, i => [entry(BENCH, [set(70 + (i % 2) * 0.5, 8)])]) })
    expect(liftUpRule(S, lastWeek)).toBeNull()
  })
})

describe('plateau', () => {
  it('points out a lift held for 4 sessions over 3 weeks', () => {
    const S = base({ workouts: weekly(6, 0, i => [entry(BENCH, [set(i < 2 ? 70 + i * 2.5 : 75, 8)])]) })
    expect(plateauRule(S, lastWeek)).toMatchObject({ id: 'plateau', tone: 'watch', data: { id: BENCH, sessions: 4, w: 75, r: 8 } })
  })
  it('does not call three sessions, or four inside two weeks, a plateau', () => {
    // 70, 72, 74, then 75 three times: held for 3 sessions only.
    const three = base({ workouts: weekly(6, 0, i => [entry(BENCH, [set(i < 3 ? 70 + i * 2 : 75, 8)])]) })
    expect(plateauRule(three, lastWeek)).toBeNull()
    const quick = base({ workouts: ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15'].map((d, i) => workout('q' + i, d, [entry(BENCH, [set(75, 8)])])) })
    expect(plateauRule(quick, lastWeek)).toBeNull()
  })
  it('ignores a lift that is no longer being trained', () => {
    const S = base({ workouts: weekly(4, 0, () => [entry(BENCH, [set(75, 8)])]) }) // last session 28 Sep
    expect(plateauRule(S, lastWeek)).toBeNull()
  })
})

describe('consistency', () => {
  const plan = { routines: [routine('push', [BENCH]), routine('legs', [SQUAT])], week: { 1: ['push'], 5: ['legs'] } }
  it('counts the full weeks in a row with every planned session done', () => {
    const S = base({ ...plan, workouts: [...weekly(6, 0, () => [entry(BENCH, [set(70, 8)])]), ...weekly(6, 4, () => [entry(SQUAT, [set(100, 5)])])] })
    expect(consistencyRule(S, lastWeek)).toMatchObject({ id: 'consistency', data: { weeks: 6, planned: 2 } })
  })
  it('needs three weeks, and a fixed week to count against', () => {
    // Friday's session only in the last two weeks: two full weeks in a row is not three.
    const S = base({ ...plan, workouts: [...weekly(6, 0, () => [entry(BENCH, [set(70, 8)])]), ...weekly(6, 4, () => [entry(SQUAT, [set(100, 5)])]).slice(4)] })
    expect(consistencyRule(S, lastWeek)).toBeNull()
    expect(consistencyRule(base({ ...plan, scheduleMode: 'rotation' }), lastWeek)).toBeNull()
  })
})

describe('neglected muscle', () => {
  it('flags the planned muscle with the most sets that went 14 days without any work', () => {
    const S = base({ routines: [routine('push', [BENCH]), routine('legs', [SQUAT])], week: { 1: ['push'], 5: ['legs'] },
      workouts: [workout('a', '2026-10-12', [entry(BENCH, [set(70, 8)])]), workout('b', '2026-10-15', [entry(BENCH, [set(70, 8)])])] })
    const h = neglectedRule(S, lastWeek)
    expect(h).toMatchObject({ id: 'neglected', tone: 'watch' })
    // A muscle the squat trains and the bench press does not.
    expect(Object.keys(musclesOf(EXIDX[SQUAT]))).toContain(h.data.muscle)
    expect(Object.keys(musclesOf(EXIDX[BENCH]))).not.toContain(h.data.muscle)
  })
  it('says nothing when there was no training at all in those 14 days', () => {
    const S = base({ routines: [routine('legs', [SQUAT])], week: { 5: ['legs'] } })
    expect(neglectedRule(S, lastWeek)).toBeNull()
  })
})

describe('volume spike', () => {
  it('flags a week 30 % above the four before it', () => {
    const four = weekly(6, 0, i => [entry(BENCH, Array.from({ length: i < 5 ? 10 : 15 }, () => set(60, 8)))])
    // weeks of 7 Sep … 5 Oct: 10 sets; week of 12 Oct: 15 sets
    expect(volumeSpikeRule(base({ workouts: four }), lastWeek)).toMatchObject({ id: 'volumeSpike', data: { cur: 15, base: 10, pct: 50 } })
  })
  it('needs three trained weeks before it, and at least 10 sets now', () => {
    const thin = [workout('a', '2026-10-05', [entry(BENCH, [set(60, 8)])]), workout('b', '2026-10-13', [entry(BENCH, Array.from({ length: 12 }, () => set(60, 8)))])]
    expect(volumeSpikeRule(base({ workouts: thin }), lastWeek)).toBeNull()
  })
})

describe('most-missed weekday', () => {
  const plan = { routines: [routine('push', [BENCH]), routine('legs', [SQUAT])], week: { 1: ['push'], 5: ['legs'] } }
  it('names a weekday missed 3+ times and 40 % of the time over 8 weeks', () => {
    // Mondays always done; Fridays done in only 4 of the 8 weeks.
    const S = base({ ...plan, workouts: [
      ...Array.from({ length: 8 }, (_, i) => workout('m' + i, addDays('2026-08-17', i * 7), [entry(BENCH, [set(70, 8)])])),
      ...Array.from({ length: 4 }, (_, i) => workout('f' + i, addDays('2026-08-21', i * 14), [entry(SQUAT, [set(100, 5)])])),
    ] })
    expect(missedDayRule(S, lastWeek)).toEqual({ id: 'missedDay', tone: 'info', data: { weekday: 5, planned: 8, missed: 4 } })
  })
  it('does not count a day with a note as missed', () => {
    const notes = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [addDays('2026-08-28', i * 14), { tag: 'sick', _ts: 1 }]))
    const S = base({ ...plan, dayNotes: notes, workouts: [
      ...Array.from({ length: 8 }, (_, i) => workout('m' + i, addDays('2026-08-17', i * 7), [entry(BENCH, [set(70, 8)])])),
      ...Array.from({ length: 4 }, (_, i) => workout('f' + i, addDays('2026-08-21', i * 14), [entry(SQUAT, [set(100, 5)])])),
    ] })
    expect(missedDayRule(S, lastWeek)).toBeNull()
  })
})

describe('highlights', () => {
  it('shows at most three, good news first', () => {
    const S = base({ workouts: [workout('a', '2026-10-13', [entry(BENCH, [set(80, 5)])], { prs: [BENCH] })] })
    const rules = [() => ({ id: 'x', tone: 'info', data: {} }), () => ({ id: 'y', tone: 'watch', data: {} }), recordsRule, () => ({ id: 'z', tone: 'good', data: {} })]
    expect(highlightsFor(S, lastWeek, { rules }).map(h => h.id)).toEqual(['records', 'z', 'y'])
  })
  it('finds the demo profile\'s real story: records, a lift going up, and a plateau', () => {
    const S = buildDemoState()
    const win = periodWindow('lastWeek', todayISO(), MONDAY)
    const ids = highlightsFor(S, win, { max: 10 }).map(h => h.id)
    expect(ids).toContain('records')
    expect(ids).toContain('liftUp')
  })
})

describe('food and training together', () => {
  const TODAY = '2026-10-19'
  const nutrition = { sex: 'male', birthYear: 1994, heightCm: 178, activity: 'moderate', goal: 'maintain', pace: 0.5, fatPct: 25, proteinPerKg: null, manual: null, meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] }
  // `days` before today logged at `kcal` with `p` g protein, all marked complete.
  const food = (days, { kcal = 2400, p = 160, from = 1 } = {}) => {
    const foodLog = {}, foodDays = {}
    for (let i = from; i < from + days; i++) {
      const d = addDays(TODAY, -i)
      foodLog['f' + i] = { d, m: 0, f: 'q', k: kcal, p, c: 250, fa: 70, _ts: 1 }
      foodDays[d] = { done: true, _ts: 1 }
    }
    return { foodLog, foodDays }
  }
  const fed = (more = {}) => base({ nutrition, bodyweight: [{ d: '2026-10-10', w: 78 }], measurements: [], ...food(28), ...more })

  it('says protein was hit on every training day, only when each one was logged', () => {
    const workouts = [workout('a', '2026-10-13', [entry(BENCH, [set(60, 8)])]), workout('b', '2026-10-15', [entry(SQUAT, [set(80, 5)])])]
    expect(proteinTrainingRule(fed({ workouts }), lastWeek, TODAY)).toMatchObject({ id: 'proteinTraining', tone: 'good', data: { n: 2 } })
    // one training day under target
    const S = fed({ workouts })
    S.foodLog.f6 = { ...S.foodLog.f6, p: 60 } // 13 Oct
    expect(proteinTrainingRule(S, lastWeek, TODAY)).toBeNull()
    // a training day with nothing logged: no claim about "all"
    const gap = fed({ workouts })
    delete gap.foodLog.f4 // 15 Oct
    expect(proteinTrainingRule(gap, lastWeek, TODAY)).toBeNull()
    // no Nutrition, no rule
    expect(proteinTrainingRule(base({ workouts }), lastWeek, TODAY)).toBeNull()
  })

  it('warns when training goes up while food runs well under target', () => {
    const sets = n => Array.from({ length: n }, () => set(60, 8))
    const workouts = [
      ...[1, 2, 3, 4].map(i => workout('o' + i, addDays('2026-10-13', -7 * i), [entry(BENCH, sets(10))])),
      workout('n', '2026-10-13', [entry(BENCH, sets(14))]),
    ]
    const lean = fed({ workouts, ...food(28, { kcal: 1500 }) })
    expect(underfuelRule(lean, lastWeek, TODAY)).toMatchObject({ id: 'underfuel', tone: 'watch', data: { volPct: 40 } })
    // eating to target: nothing to say
    expect(underfuelRule(fed({ workouts }), lastWeek, TODAY)).toBeNull()
  })

  it('points to the check-in when the weight sits flat for 3 weeks of careful logging while trying to lose', () => {
    const bodyweight = Array.from({ length: 12 }, (_, i) => ({ d: addDays(TODAY, -1 - i * 2), w: 80 + (i % 2 ? 0.2 : -0.2) }))
    const S = fed({ bodyweight, nutrition: { ...nutrition, goal: 'lose' } })
    expect(flatWhileLoggingRule(S, lastWeek, TODAY)).toMatchObject({ id: 'flatWhileLogging', tone: 'info' })
    expect(flatWhileLoggingRule({ ...S, nutrition }, lastWeek, TODAY)).toBeNull()          // maintaining: flat is the goal
    expect(flatWhileLoggingRule({ ...S, ...food(10) }, lastWeek, TODAY)).toBeNull()        // too few complete days
  })

  it('reads lean mass held while fat fell from the demo check-ins', () => {
    const S = buildDemoState()
    const win = periodWindow('lastWeek', todayISO(), MONDAY)
    const h = leanHeldRule(S, { ...win, to: todayISO() })
    expect(h).toMatchObject({ id: 'leanHeld', tone: 'good' })
    expect(h.data.fat).toBeGreaterThan(1)
  })
})
