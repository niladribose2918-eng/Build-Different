import { describe, it, expect } from 'vitest'
import { weekRows, targetStreak, targetRunReached, weekStreakReached } from './streaks.js'
import { streakWeeks } from './history.js'

const TODAY = '2026-10-19' // a Monday
const w = (d, i = 0) => ({ id: d + i, d, start: Date.parse(d + 'T10:00:00'), entries: [] })
// Mon/Wed/Fri of the weeks starting 21 Sep, 28 Sep, 5 Oct and 12 Oct, then this Monday.
const DAYS = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30',
  '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19']
const state = (days = DAYS, dayNotes = {}) => ({ unit: 'kg', workouts: days.map(d => w(d)), dayNotes })
const sick = d => ({ [d]: { tag: 'sick', _ts: 1 } })

describe('target streak', () => {
  it('reads each week as hit, excused or missed, and leaves the running week open', () => {
    const rows = weekRows(state(DAYS, sick('2026-10-02')), 3, { today: TODAY })
    expect(rows.map(r => [r.key, r.done, r.hit, r.excused])).toEqual([
      ['2026-09-21', 3, true, false], ['2026-09-28', 2, false, true], ['2026-10-05', 3, true, false],
      ['2026-10-12', 3, true, false], ['2026-10-19', 1, false, false],
    ])
    expect(rows.at(-1).current).toBe(true)
    expect(rows[0].hitOn).toBe('2026-09-25')
  })

  it('lets a week covered by a sick note neither break the run nor add to it', () => {
    const s = targetStreak(state(DAYS, sick('2026-10-02')), 3, { today: TODAY })
    expect(s).toMatchObject({ weeks: 3, best: 3, excused: 1, target: 3, thisWeek: { done: 1, left: 2, hit: false } })
  })

  it('breaks on a short week with nothing to excuse it', () => {
    expect(targetStreak(state(), 3, { today: TODAY })).toMatchObject({ weeks: 2, best: 2, excused: 0 })
  })

  it('does not take a note on a day you trained as the missing session', () => {
    expect(targetStreak(state(DAYS, sick('2026-09-30')), 3, { today: TODAY }).weeks).toBe(2)
  })

  it('counts this week once it is hit, and never breaks on it before', () => {
    const more = [...DAYS, '2026-10-20', '2026-10-21']
    expect(targetStreak(state(more, sick('2026-10-02')), 3, { today: '2026-10-21' })).toMatchObject({ weeks: 4, thisWeek: { hit: true, left: 0 } })
    // the week before last missed, and this one only just begun: the run is the last week alone
    expect(targetStreak(state(DAYS.filter(d => d < '2026-10-05' || d >= '2026-10-12')), 3, { today: TODAY }).weeks).toBe(1)
  })

  it('needs a target, and remembers the longest run', () => {
    expect(targetStreak(state(), 0, { today: TODAY })).toBeNull()
    const gap = DAYS.filter(d => d < '2026-10-12' || d === '2026-10-19')
    expect(targetStreak(state(gap, sick('2026-10-02')), 3, { today: TODAY })).toMatchObject({ weeks: 0, best: 2 })
  })

  it('dates a run of hit weeks, and the week streak the way Home counts it', () => {
    const S = state(DAYS, sick('2026-10-02'))
    expect(targetRunReached(S, 3, 1, { today: TODAY })).toBe('2026-09-25')
    expect(targetRunReached(S, 3, 3, { today: TODAY })).toBe('2026-10-16')
    expect(targetRunReached(S, 3, 4, { today: TODAY })).toBeNull()
    const ws = weekStreakReached(S, [4, 12])
    expect(ws.reached).toEqual({ 4: '2026-10-12', 12: null })
    expect(ws.best).toBe(5)
    expect(ws.best).toBeGreaterThanOrEqual(streakWeeks(S))
  })
})
