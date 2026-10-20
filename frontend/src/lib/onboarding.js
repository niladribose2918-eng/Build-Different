// The first-month checklist on Home: six habits that make the rest of the app useful, each ticked
// off by the log itself. The first four weeks decide whether a beginner keeps training, and small
// early wins (a first workout, a first PR) carry the next ones; the steps also teach what makes
// Insights accurate later (an effort rating, a goal, a second weigh-in).
//
// Who sees it is read from the log, not stored: a profile with no workouts yet, or whose first one
// is under FIRST_DAYS old. A lifter with months of history never does. It waits for a plan, so it
// never stands beside Home's "Welcome!" card, and goes for good when every step is done or when it
// is dismissed (hints.firstMonthDone, synced with the other one-time hints).
import { todayISO, weekKey, weekStartOf } from './format.js'
import { addDays } from './insights.js'
import { workoutDay } from './history.js'
import { isSideSet } from './workout-model.js'
import { goalsOf } from './goals.js'
import { weighIns } from './weight-trend.js'

export const FIRST_DAYS = 35
export const STEPS = ['workout', 'goal', 'effort', 'threeInWeek', 'weighTwice', 'pr']

const rated = s => s && (s.rir != null || s.rpe != null)
const hasEffort = w => (w?.entries || []).some(e => (e?.sets || []).some(s => s?.done === true && (rated(s) || (isSideSet(s) && [s.sides?.L, s.sides?.R].some(rated)))))

/** Each step and whether the log already shows it: [{ key, done }]. */
export function firstMonthSteps(S) {
  const workouts = S?.workouts || []
  const ws = weekStartOf(S)
  const perWeek = new Map()
  for (const w of workouts) { const d = workoutDay(w); if (d) perWeek.set(weekKey(d, ws), (perWeek.get(weekKey(d, ws)) || 0) + 1) }
  const done = {
    workout: workouts.length > 0,
    goal: goalsOf(S).length > 0 || Number(S?.targetW) > 0,
    effort: workouts.some(hasEffort),
    threeInWeek: [...perWeek.values()].some(n => n >= 3),
    weighTwice: weighIns(S).length >= 2,
    pr: workouts.some(w => Array.isArray(w?.prs) && w.prs.length > 0),
  }
  return STEPS.map(key => ({ key, done: done[key] }))
}

/** Whether the checklist shows on Home today. */
export function showFirstMonth(S, { today = todayISO() } = {}) {
  if (S?.hints?.firstMonthDone || !(S?.routines || []).length) return false
  const first = (S?.workouts || []).map(workoutDay).filter(Boolean).sort()[0]
  if (first && first < addDays(today, -FIRST_DAYS)) return false
  return firstMonthSteps(S).some(s => !s.done)
}
