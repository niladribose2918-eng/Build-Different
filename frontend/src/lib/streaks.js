// The target streak (Insights → Consistency, the Home "This week" card, the finish screen): weeks
// in a row in which you trained as often as you meant to, beside the week streak Home has always
// shown (history.js streakWeeks: any week with one workout). The week streak is left as it is.
//
// The target is a number of sessions a week (goals.js weeklyTarget: a frequency goal, else the
// plan's training days). A week is
//   hit      as many workouts as the target, or more
//   excused  short of it, but every session missing is covered by a day note (sick, travelling,
//            injured, rest) on a day you did not train: such a week neither breaks the run nor
//            adds to it, so a flu does not teach you to train ill or to give up on the streak
//   missed   anything else, which ends the run.
// The week still running never breaks it: until it is over it only counts once it is hit. Notes
// can only go on today and the days before (day-notes.js canNoteDay), so a week cannot be
// excused in advance.
//
// The target is today's, applied to the weeks before as well: the plan of a past week is not
// kept, so a lifter who moved from 3 days to 4 sees the old weeks against 4.
import { weekKey, weekStartOf, todayISO } from './format.js'
import { addDays } from './insights.js'
import { workoutDay } from './history.js'
import { excusedOn } from './day-notes.js'

const MAX_WEEKS = 520

// The workouts' days in order, and how many fell on each day.
function daysOf(S) {
  const out = []
  for (const w of S?.workouts || []) { const d = workoutDay(w); if (d) out.push(d) }
  return out.sort()
}

/**
 * One row per week from the first workout's week to `today`'s, oldest first:
 * { key, done, noted, hit, excused, current, hitOn } — `key` is the week's first day, `noted` the
 * days so far that carry a note and no workout, `hitOn` the day the target was reached.
 */
export function weekRows(S, target, { today = todayISO() } = {}) {
  const days = daysOf(S)
  if (!days.length) return []
  const ws = weekStartOf(S)
  const byWeek = new Map()
  for (const d of days) {
    const k = weekKey(d, ws)
    const list = byWeek.get(k) || []
    list.push(d)
    byWeek.set(k, list)
  }
  const trained = new Set(days)
  const current = weekKey(today, ws)
  const rows = []
  let key = weekKey(days[0], ws)
  for (let i = 0; i < MAX_WEEKS && key <= current; i++) {
    const list = byWeek.get(key) || []
    let noted = 0
    for (let j = 0; j < 7; j++) {
      const d = addDays(key, j)
      if (d > today) break
      if (!trained.has(d) && excusedOn(S, d)) noted++
    }
    const hit = target > 0 && list.length >= target
    rows.push({
      key, done: list.length, noted, hit,
      excused: !hit && target > 0 && key !== current && list.length + noted >= target,
      current: key === current,
      hitOn: hit ? list[target - 1] : null,
    })
    key = addDays(key, 7)
  }
  return rows
}

/**
 * The target streak: { weeks, best, target, excused, thisWeek: { done, left, hit } }, or null
 * without a target. `excused` counts the excused weeks inside the current run.
 */
export function targetStreak(S, target, { today = todayISO() } = {}) {
  if (!(target > 0)) return null
  const rows = weekRows(S, target, { today })
  const cur = rows.at(-1)
  const thisWeek = { done: cur?.current ? cur.done : 0, left: Math.max(0, target - (cur?.current ? cur.done : 0)), hit: !!(cur?.current && cur.hit) }
  let weeks = 0, excused = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.hit) weeks++
    else if (r.current) continue
    else if (r.excused) excused++
    else break
  }
  return { weeks, best: Math.max(weeks, ...runsOf(rows).map(r => r.length)), target, excused, thisWeek }
}

// Each unbroken run of hit weeks, oldest first, as the list of days each of its weeks was hit.
function runsOf(rows) {
  const runs = []
  let run = []
  for (const r of rows) {
    if (r.hit) run.push(r.hitOn)
    else if (r.excused || r.current) continue
    else { if (run.length) runs.push(run); run = [] }
  }
  if (run.length) runs.push(run)
  return runs
}

/** The first day a run of `n` hit weeks in a row was reached, or null. */
export function targetRunReached(S, target, n, { today = todayISO() } = {}) {
  if (!(target > 0)) return null
  const hits = runsOf(weekRows(S, target, { today })).filter(r => r.length >= n).map(r => r[n - 1])
  return hits.length ? hits.sort()[0] : null
}

/**
 * The week streak's history, read the way Home counts it (any week with a workout): the first day
 * a run of `n` weeks was reached, for each `n` in `steps` → { [n]: iso | null }, and the longest
 * run ever.
 */
export function weekStreakReached(S, steps) {
  const ws = weekStartOf(S)
  const out = Object.fromEntries(steps.map(n => [n, null]))
  let run = 0, best = 0, prev = null
  const firstOfWeek = new Map()
  for (const d of daysOf(S)) { const k = weekKey(d, ws); if (!firstOfWeek.has(k)) firstOfWeek.set(k, d) }
  for (const [k, d] of [...firstOfWeek.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    run = prev && addDays(prev, 7) === k ? run + 1 : 1
    prev = k
    best = Math.max(best, run)
    for (const n of steps) if (run === n && !out[n]) out[n] = d
  }
  return { reached: out, best }
}
