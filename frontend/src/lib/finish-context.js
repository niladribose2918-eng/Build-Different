// "Where this leaves you" on the finish summary: what today's session means for the week, the
// streak, and against the last time the same routine was trained.
//
// Read from the state right after the workout was saved (`S` already holds `w`), with the same
// helpers Home reads: weekTally for this week's sessions against the plan, streakWeeks for the
// streak. Nothing is stored.
//
// The previous session is matched by routine, not by name: renaming a routine must not make its
// history disappear from the comparison. A session of the same routines (a combined day matches
// the same combination) wins; a freestyle session, which has no routine, falls back to its name.
// The Coach's sessionInsights matches by name only and is left as it is.
import { streakWeeks, workoutAt, workoutDay, workoutDuration, workoutVolume, workSetsDone } from './history.js'
import { weekTally } from './queue.js'
import { todayISO, weekKey, weekStartOf } from './format.js'

const idsOf = w => (Array.isArray(w?.routineIds) ? w.routineIds : w?.routineId ? [w.routineId] : []).filter(Boolean)
const key = w => [...idsOf(w)].sort().join('+')
const volumeOf = w => Math.round(Number.isFinite(w?.vol) ? w.vol : workoutVolume(w))

/** The last session before `w` of the same routine(s), or of the same name for a freestyle one. */
export function previousSameRoutine(S, w) {
  const at = workoutAt(w)
  const k = key(w)
  const before = (S?.workouts || []).filter(x => x && x !== w && (w.id == null || x.id !== w.id) && workoutAt(x) < at)
  const same = k ? before.filter(x => key(x) === k) : before.filter(x => !idsOf(x).length && x.name && x.name === w.name)
  return same.sort((a, b) => workoutAt(a) - workoutAt(b)).at(-1) || null
}

/**
 * { week, streak, vsLast } — each null when it has nothing to say:
 *   week   { done, planned } this calendar week, only when the workout is dated this week
 *   streak { weeks, extended } the week streak (2+ weeks); `extended` when this was the week's first session
 *   vsLast { d, volume, sets, minutes } — each { cur, prev, diff } — against previousSameRoutine
 */
export function finishContext(S, w, { today = todayISO() } = {}) {
  const ws = weekStartOf(S)
  const day = workoutDay(w)
  const thisWeek = !!day && weekKey(day, ws) === weekKey(today, ws)
  let week = null, streak = null
  if (thisWeek) {
    const { done, planned } = weekTally(S, today)
    week = { done, planned }
    const weeks = streakWeeks(S)
    const firstThisWeek = (S.workouts || []).filter(x => { const d = workoutDay(x); return d && weekKey(d, ws) === weekKey(today, ws) }).length === 1
    if (weeks >= 2) streak = { weeks, extended: firstThisWeek }
  }
  let vsLast = null
  // A session finished with no working set done has nothing to hold against last time: "volume
  // −100 %" would be true and useless.
  const prev = workSetsDone(w) > 0 ? previousSameRoutine(S, w) : null
  if (prev) {
    const pair = (cur, was) => ({ cur, prev: was, diff: cur - was })
    vsLast = {
      d: workoutDay(prev),
      volume: pair(volumeOf(w), volumeOf(prev)),
      sets: pair(workSetsDone(w), workSetsDone(prev)),
      minutes: pair(Math.round(workoutDuration(w) / 60000), Math.round(workoutDuration(prev) / 60000)),
    }
  }
  return { week, streak, vsLast }
}
