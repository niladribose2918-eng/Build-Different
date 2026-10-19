import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { finishContext, previousSameRoutine } from './finish-context.js'

const set = (w, r) => ({ w, r, done: true })
const day = d => Date.parse(d + 'T10:00:00')
const workout = (id, d, more = {}) => ({ id, d, start: day(d), end: day(d) + 50 * 60000, name: 'Push Day', routineId: 'push', routineIds: ['push'],
  entries: [{ id: '0025', sets: [set(60, 8), set(60, 8)] }], ...more })
const state = (workouts, more = {}) => ({ unit: 'kg', weekStart: 1, routines: [{ id: 'push', name: 'Push Day', ex: [] }, { id: 'pull', name: 'Pull Day', ex: [] }, { id: 'legs', name: 'Leg Day', ex: [] }],
  week: { 1: ['push'], 3: ['pull'], 5: ['legs'] }, workouts, dayPlan: {}, queue: null, ...more })

describe('where this session leaves you', () => {
  // streakWeeks reads the clock, so each test runs on the day it names.
  const on = iso => vi.setSystemTime(new Date(iso + 'T18:00:00'))
  beforeEach(() => { vi.useFakeTimers(); on('2026-10-19') })
  afterEach(() => { vi.useRealTimers() })

  it('counts the week against the plan and says the streak was kept by the week\'s first session', () => {
    const w = workout('w3', '2026-10-19', { vol: 1000 })
    const S = state([workout('w1', '2026-10-05', { vol: 900 }), workout('w2', '2026-10-12', { vol: 960 }), w])
    const c = finishContext(S, w, { today: '2026-10-19' })
    expect(c.week).toEqual({ done: 1, planned: 3 })
    expect(c.streak).toEqual({ weeks: 3, extended: true })
  })

  it('does not claim the streak was extended by a second session in the same week', () => {
    const w = workout('w4', '2026-10-21', { routineId: 'pull', routineIds: ['pull'], name: 'Pull Day' })
    const S = state([workout('w1', '2026-10-05'), workout('w2', '2026-10-12'), workout('w3', '2026-10-19'), w])
    on('2026-10-21')
    expect(finishContext(S, w, { today: '2026-10-21' }).streak).toEqual({ weeks: 3, extended: false })
  })

  it('says nothing about the week or the streak for a workout logged into an earlier week', () => {
    const w = workout('w2', '2026-10-06')
    const S = state([workout('w1', '2026-09-29'), w])
    const c = finishContext(S, w, { today: '2026-10-19' })
    expect(c.week).toBeNull()
    expect(c.streak).toBeNull()
  })

  it('compares with the last session of the same routine, even after the routine was renamed', () => {
    const before = workout('w1', '2026-10-12', { name: 'Push A', vol: 900, entries: [{ id: '0025', sets: [set(60, 8)] }] })
    const other = workout('w2', '2026-10-14', { routineId: 'pull', routineIds: ['pull'], name: 'Pull Day' })
    const w = workout('w3', '2026-10-19', { name: 'Push Day', vol: 1000, end: day('2026-10-19') + 44 * 60000 })
    const S = state([before, other, w])
    expect(previousSameRoutine(S, w)).toBe(before)
    const c = finishContext(S, w, { today: '2026-10-19' })
    expect(c.vsLast).toEqual({ d: '2026-10-12', volume: { cur: 1000, prev: 900, diff: 100 }, sets: { cur: 2, prev: 1, diff: 1 }, minutes: { cur: 44, prev: 50, diff: -6 } })
  })

  it('matches a combined day only with the same combination, and a freestyle session by its name', () => {
    const combo = workout('w1', '2026-10-12', { routineIds: ['push', 'pull'], routineId: 'push' })
    const single = workout('w2', '2026-10-14')
    const w = workout('w3', '2026-10-19', { routineIds: ['pull', 'push'], routineId: 'pull' })
    expect(previousSameRoutine(state([combo, single, w]), w)).toBe(combo)
    const free1 = workout('f1', '2026-10-10', { routineId: null, routineIds: [], name: 'Arms' })
    const free2 = workout('f2', '2026-10-18', { routineId: null, routineIds: [], name: 'Arms' })
    expect(previousSameRoutine(state([free1, free2]), free2)).toBe(free1)
  })

  it('has no comparison for a session finished without a working set done', () => {
    const before = workout('w1', '2026-10-12')
    const w = workout('w2', '2026-10-19', { entries: [{ id: '0025', sets: [{ w: 60, r: 8 }] }] })
    expect(finishContext(state([before, w]), w, { today: '2026-10-19' }).vsLast).toBeNull()
  })

  it('has no comparison for a first session', () => {
    const w = workout('w1', '2026-10-19')
    expect(finishContext(state([w]), w, { today: '2026-10-19' }).vsLast).toBeNull()
  })
})
