import { describe, it, expect } from 'vitest'
import { recordsFor, repTable, weightForReps, recentPrs, prCount, sortRecords, latestBodyweight } from './records.js'
import { bestWeightFor } from './history.js'
import { best1RM, formulaOf } from './onerm.js'
import { currentDbLoad } from './dumbbells.js'

const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const day = d => Date.parse(d + 'T10:00:00')
const workout = (id, d, entries, more = {}) => ({ id, d, start: day(d), end: day(d) + 3600000, entries, ...more })
const entry = (id, sets, target = {}) => ({ id, target: { mode: 'reps', ...target }, sets })
const state = (workouts, more = {}) => ({ unit: 'kg', workouts, bodyweight: [], exWeights: {}, ...more })
const byId = (list, id) => list.find(r => r.id === id)

const BENCH = '0025'      // barbell bench press
const DIP_ASSIST = '0009' // assisted chest dip (kneeling), a leverage machine: lighter is better
const DB_PRESS = '0289'   // dumbbell bench press

describe('records board', () => {
  it('agrees with the helpers the PR badges and "Best:" lines use', () => {
    const S = state([
      workout('w1', '2026-09-01', [entry(BENCH, [set(20, 10, { phase: 'warmup' }), set(60, 8), set(60, 8)])]),
      workout('w2', '2026-09-08', [entry(BENCH, [set(65, 8), set(65, 7)])]),
      workout('w3', '2026-09-15', [entry(BENCH, [set(70, 5), set(62.5, 10)])]),
    ])
    const r = byId(recordsFor(S), BENCH)
    expect(r.heaviest.w).toBe(bestWeightFor(S, BENCH, currentDbLoad(S, BENCH)))
    expect(r.heaviest).toMatchObject({ w: 70, r: 5, d: '2026-09-15' })
    expect(r.e1rm.est).toBe(best1RM(S, BENCH).est)
    expect(r.sessions).toBe(3)
    expect(r.last).toBe('2026-09-15')
  })

  it('never counts a warm-up, however heavy', () => {
    const S = state([workout('w1', '2026-09-01', [entry(BENCH, [set(100, 1, { phase: 'warmup' }), set(60, 5)])])])
    const r = byId(recordsFor(S), BENCH)
    expect(r.heaviest.w).toBe(60)
    expect(r.e1rm.w).toBe(60)
  })

  it('keeps the most reps at the heaviest weight, from the first time they were reached', () => {
    const S = state([
      workout('w1', '2026-09-01', [entry(BENCH, [set(70, 5)])]),
      workout('w2', '2026-09-08', [entry(BENCH, [set(70, 6)])]),
      workout('w3', '2026-09-15', [entry(BENCH, [set(70, 6)])]),
    ])
    expect(byId(recordsFor(S), BENCH).heaviest).toMatchObject({ w: 70, r: 6, d: '2026-09-08' })
  })

  it('reads an assistance machine the other way round and gives it no 1RM or rep table', () => {
    const S = state([
      workout('w1', '2026-09-01', [entry(DIP_ASSIST, [set(40, 8)])]),
      workout('w2', '2026-09-08', [entry(DIP_ASSIST, [set(30, 8), set(0, 8)])]),
    ])
    const r = byId(recordsFor(S), DIP_ASSIST)
    expect(r.heaviest.w).toBe(30)
    expect(r.heaviest.w).toBe(bestWeightFor(S, DIP_ASSIST))
    expect(r.e1rm).toBeNull()
    expect(r.relative).toBeNull()
    expect(r.repTable.every(x => !x.done && x.w == null)).toBe(true)
  })

  it('compares dumbbell sessions logged per bell and in total in one meaning', () => {
    const S = state([
      workout('w1', '2026-09-01', [entry(DB_PRESS, [set(20, 10)], { dbLoad: 'each' })]),
      workout('w2', '2026-09-08', [entry(DB_PRESS, [set(44, 8)], { dbLoad: 'total' })]),
    ], { dbLoad: { [DB_PRESS]: { mode: 'total' } } })
    const r = byId(recordsFor(S), DB_PRESS)
    expect(r.heaviest.w).toBe(44)
    expect(r.heaviest.w).toBe(bestWeightFor(S, DB_PRESS, currentDbLoad(S, DB_PRESS)))
    // The per-bell session reads as 40 in total, so its 10 reps sit at 40 in the rep table.
    expect(r.repTable.find(x => x.n === 10)).toMatchObject({ w: 40, done: true })
  })

  it('keeps the rep count for work that never carried a load, until a loaded set appears', () => {
    const PULL = 'pullup-custom'
    const bwOnly = state([
      workout('w1', '2026-09-01', [entry(PULL, [set(0, 8), set(0, 10)])]),
      workout('w2', '2026-09-08', [entry(PULL, [set(0, 9)])]),
    ])
    expect(byId(recordsFor(bwOnly), PULL)).toMatchObject({ mostReps: { r: 10, d: '2026-09-01' }, heaviest: null })
    const loaded = state([...bwOnly.workouts, workout('w3', '2026-09-15', [entry(PULL, [set(10, 5)])])])
    const r = byId(recordsFor(loaded), PULL)
    expect(r.mostReps).toBeNull()
    expect(r.heaviest).toMatchObject({ w: 10, r: 5 })
  })

  it('keeps the longest hold for timed work and the top speed for cardio', () => {
    const PLANK = 'plank-custom', RUN = 'run-custom'
    const S = state([
      workout('w1', '2026-09-01', [entry(PLANK, [{ sec: 45, w: 0, done: true }, { sec: 60, w: 0, done: true }], { mode: 'time' })]),
      workout('w2', '2026-09-08', [entry(RUN, [{ min: 20, speed: 10.5, done: true }], { mode: 'cardio' })]),
      workout('w3', '2026-09-15', [entry(PLANK, [{ sec: 50, w: 0, done: true }, { sec: 90, w: 0 }], { mode: 'time' })]),
    ])
    const list = recordsFor(S)
    expect(byId(list, PLANK).longestHold).toMatchObject({ sec: 60, d: '2026-09-01' })
    expect(byId(list, RUN).topSpeed).toMatchObject({ speed: 10.5, min: 20 })
  })

  it('states strength relative to the newest weigh-in', () => {
    const S = state([workout('w1', '2026-09-01', [entry(BENCH, [set(100, 1)])])], {
      bodyweight: [{ d: '2026-09-02', w: 80 }, { d: '2026-08-01', w: 90 }],
    })
    expect(latestBodyweight(S)).toBe(80)
    expect(byId(recordsFor(S), BENCH).relative).toBe(1.25)
    expect(byId(recordsFor({ ...S, bodyweight: [] }), BENCH).relative).toBeNull()
  })
})

describe('rep table', () => {
  it('shows only the rep counts actually done as records; the rest are estimates from the 1RM', () => {
    // The demo profile only ever does sets of 8: 75 × 8 must not read as a 75 kg single.
    const S = state([workout('w1', '2026-10-12', [entry(BENCH, [set(75, 8), set(75, 8), set(75, 8)])])])
    const table = byId(recordsFor(S), BENCH).repTable
    expect(table.find(x => x.n === 8)).toMatchObject({ w: 75, done: true })
    const one = table.find(x => x.n === 1)
    expect(one.done).toBeUndefined()
    expect(one.est).toBe(true)
    expect(one.w).toBeGreaterThan(75)
    for (const n of [3, 5]) expect(table.find(x => x.n === n)).toMatchObject({ est: true })
    expect(table.find(x => x.n === 10).w).toBeLessThan(75)
  })

  it('never estimates below what a longer set already proves', () => {
    // 80 × 10 proves at least 80 for 5, whatever a poor 5-rep day estimates.
    const table = repTable({ 10: { w: 80, d: '2026-09-01' }, 5: { w: 70, d: '2026-09-02' } }, { est: 85 }, 'epley')
    expect(table.find(x => x.n === 10)).toMatchObject({ w: 80, done: true })
    expect(table.find(x => x.n === 5).w).toBeGreaterThanOrEqual(80)
    expect(table.find(x => x.n === 5).done).toBeUndefined()
  })

  it('leaves a count empty when there is nothing honest to show', () => {
    expect(repTable({}, null, 'epley').every(x => x.w == null)).toBe(true)
  })

  it('turns a 1RM back into a weight for n reps, rounded to half a kilo', () => {
    expect(weightForReps(95, 1, 'epley')).toBe(95)
    // Epley: 95 / (1 + 8/30) = 75.0
    expect(weightForReps(95, 8, 'epley')).toBe(75)
    expect(weightForReps(0, 5, 'epley')).toBeNull()
    // The profile's formula choice carries through: Brzycki gives 100 × 32/36 ≈ 89, Epley ≈ 85.5.
    expect(weightForReps(100, 5, formulaOf({ oneRmFormula: 'brzycki' }))).toBe(89)
    expect(weightForReps(100, 5, formulaOf({}))).toBe(85.5)
  })
})

describe('recent records', () => {
  const now = day('2026-10-19')
  const S = state([
    workout('w1', '2026-08-01', [entry(BENCH, [set(60, 8)])], { prs: [BENCH] }),
    workout('w2', '2026-10-12', [entry(BENCH, [set(75, 8), set(75, 7)])], { prs: [BENCH] }),
    workout('w3', '2026-10-16', [entry('0043', [set(120, 5)]), entry(BENCH, [set(70, 8)])], { prs: ['0043'] }),
  ])
  it('lists the PR badges of the last 30 days, newest first, with the set that earned them', () => {
    expect(recentPrs(S, { now })).toEqual([
      { id: '0043', d: '2026-10-16', t: day('2026-10-16'), w: 120, r: 5 },
      { id: BENCH, d: '2026-10-12', t: day('2026-10-12'), w: 75, r: 8 },
    ])
  })
  it('counts every badge in the history', () => {
    expect(prCount(S)).toBe(3)
    expect(prCount({})).toBe(0)
  })
  it('sorts by the newest record, or by how often an exercise was trained', () => {
    const list = recordsFor(S)
    expect(sortRecords(list, 'recent')[0].id).toBe('0043')
    expect(sortRecords(list, 'trained')[0].id).toBe(BENCH)
  })
})
