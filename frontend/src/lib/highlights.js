// Highlights: the few plain-language findings the Insights screen leads with.
//
// Rule-based and offline on purpose — the AI Coach writes prose with a provider key; these are
// fixed rules over the log that anyone can check by hand. Each rule returns data, never text
// ({ id, tone, data }); views/Insights.jsx words it through t(), so the rules stay testable and
// every phrase is translatable.
//
// A wrong highlight is worse than none, so every rule has a minimum of data before it speaks,
// and a highlight never prescribes a load: a plateau is pointed out, what to do about it stays
// with the progression rules and the lifter. At most three are shown, good news first.
//
// Rules, all anchored at the end of the period being read (`to`):
//   records      PR badges inside the period
//   liftUp       the biggest estimated-1RM gain over the 4 weeks to `to` (≥ 2.5 %, ≥ 3 sessions)
//   consistency  every planned session done, 3 or more full weeks running (fixed week only)
//   plateau      a lift still being trained whose best estimate has not moved for 4+ sessions
//                spread over 3+ weeks
//   neglected    a muscle the plan trains that has had no work at all for 14 days
//   volumeSpike  working sets in the last 7 days ≥ 30 % above the 4 weeks before
//   missedDay    a weekday whose planned session was missed 3+ times, ≥ 40 % of the time, over
//                the last 8 weeks (a day with a note — sick, travelling — is not a miss)
//
// With Nutrition set up, four more read food and training together. Each needs both halves to
// be reliable on its own before it says anything:
//   proteinTraining  protein hit on every training day in the period, 2 or more, each one logged
//   underfuel        working sets up ≥ 20 % on the 4 weeks before while calories on complete days
//                    ran ≥ 25 % under target (4+ complete days in the last 7)
//   flatWhileLogging trying to lose or gain, the trend flat for 3 weeks, most days logged complete
//   leanHeld         from the body-fat check-ins: fat down while lean mass held
import { addDays, periodStats, workoutsIn, nutritionStats, PROTEIN_HIT } from './insights.js'
import { goalOf } from './nutrition-targets.js'
import { dayDone } from './food-log.js'
import { weightTrend } from './weight-trend.js'
import { bodyComp } from './body-comp.js'
import { e1rmSeries } from './onerm.js'
import { effectiveRoutineIds, workoutDay } from './history.js'
import { loadOfWeeklyPlan, loadOfWorkouts } from './muscles.js'
import { excusedOn } from './day-notes.js'
import { scheduleModeOf } from './rotation.js'
import { queueOf } from './queue.js'
import { weekKey, todayISO, MONDAY } from './format.js'

export const MAX_HIGHLIGHTS = 3
export const LIFT_UP_MIN_PCT = 2.5
export const PLATEAU_SESSIONS = 4
export const PLATEAU_DAYS = 21
export const NEGLECT_DAYS = 14
export const SPIKE_RATIO = 1.3
export const SPIKE_MIN_SETS = 10
export const MISSED_MIN = 3
export const MISSED_RATE = 0.4
export const CONSISTENT_WEEKS = 3
export const UNDERFUEL_VOLUME = 1.2
export const UNDERFUEL_KCAL = 0.75
export const FLAT_DAYS = 21

const TONE_ORDER = { good: 0, watch: 1, info: 2 }
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)
const exercisesIn = (S, from, to) => {
  const ids = new Set()
  workoutsIn(S, from, to).forEach(w => (w.entries || []).forEach(e => { if (e?.id != null) ids.add(e.id) }))
  return [...ids]
}
// A fixed week of your own, with no coach week or rotation deciding the days.
const fixedWeek = S => scheduleModeOf(S) !== 'rotation' && !queueOf(S)
const plannedPerWeek = S => Object.values(S?.week || {})
  .filter(ids => [].concat(ids || []).some(id => (S.routines || []).some(r => r.id === id))).length

export function recordsRule(S, win) {
  const n = periodStats(S, win.from, win.to).prs
  if (!n) return null
  return { id: 'records', tone: 'good', data: { n, prev: periodStats(S, win.prevFrom, win.prevTo).prs } }
}

export function liftUpRule(S, win) {
  const from = addDays(win.to, -27)
  let best = null
  exercisesIn(S, from, win.to).forEach(id => {
    const pts = e1rmSeries(S, id).filter(p => p.d >= from && p.d <= win.to)
    if (pts.length < 3) return
    const first = pts[0].y, last = pts[pts.length - 1].y
    const pct = Math.round(((last - first) / first) * 1000) / 10
    if (pct >= LIFT_UP_MIN_PCT && (!best || pct > best.pct)) best = { id, from: first, to: last, pct }
  })
  return best ? { id: 'liftUp', tone: 'good', data: best } : null
}

export function consistencyRule(S, win) {
  if (!fixedWeek(S)) return null
  const planned = plannedPerWeek(S)
  if (!planned) return null
  const ws = S.weekStart === 0 ? 0 : MONDAY
  // The last full week at the end of the period: the period's own week once it has ended.
  let start = weekKey(win.to, ws)
  if (addDays(start, 6) > win.to) start = addDays(start, -7)
  let weeks = 0
  for (let i = 0; i < 104; i++, start = addDays(start, -7)) {
    if (workoutsIn(S, start, addDays(start, 6)).length >= planned) weeks++
    else break
  }
  return weeks >= CONSISTENT_WEEKS ? { id: 'consistency', tone: 'good', data: { weeks, planned } } : null
}

export function plateauRule(S, win) {
  const active = addDays(win.to, -(NEGLECT_DAYS - 1))
  let best = null
  exercisesIn(S, active, win.to).forEach(id => {
    const pts = e1rmSeries(S, id).filter(p => p.d <= win.to)
    if (pts.length < PLATEAU_SESSIONS) return
    const top = Math.max(...pts.map(p => p.y))
    const k = pts.findIndex(p => p.y >= top - 1e-9)
    const held = pts.length - k
    if (held < PLATEAU_SESSIONS || daysBetween(pts[k].d, pts[pts.length - 1].d) < PLATEAU_DAYS) return
    if (!best || held > best.sessions) best = { id, sessions: held, w: pts[k].w, r: pts[k].r, since: pts[k].d }
  })
  return best ? { id: 'plateau', tone: 'watch', data: best } : null
}

export function neglectedRule(S, win) {
  const plan = loadOfWeeklyPlan(S)
  const from = addDays(win.to, -(NEGLECT_DAYS - 1))
  const recent = workoutsIn(S, from, win.to)
  if (!recent.length) return null
  const load = loadOfWorkouts(recent)
  let pick = null
  Object.entries(plan).forEach(([muscle, sets]) => {
    if (sets >= 1 && !(load[muscle] > 0) && (!pick || sets > pick.planned)) pick = { muscle, planned: Math.round(sets * 10) / 10 }
  })
  return pick ? { id: 'neglected', tone: 'watch', data: { ...pick, days: NEGLECT_DAYS } } : null
}

export function volumeSpikeRule(S, win) {
  const cur = periodStats(S, addDays(win.to, -6), win.to).sets
  const weeks = [1, 2, 3, 4].map(i => periodStats(S, addDays(win.to, -6 - 7 * i), addDays(win.to, -7 * i)).sets)
  const trained = weeks.filter(n => n > 0)
  if (trained.length < 3 || cur < SPIKE_MIN_SETS) return null
  const base = weeks.reduce((a, b) => a + b, 0) / weeks.length
  if (!(base > 0) || cur < base * SPIKE_RATIO) return null
  return { id: 'volumeSpike', tone: 'watch', data: { cur, base: Math.round(base), pct: Math.round(((cur - base) / base) * 100) } }
}

export function missedDayRule(S, win) {
  if (!fixedWeek(S)) return null
  const ws = S.weekStart === 0 ? 0 : MONDAY
  const end = addDays(weekKey(win.to, ws), -1)
  const trained = new Set((S.workouts || []).map(workoutDay).filter(Boolean))
  const by = {}
  for (let iso = addDays(end, -55); iso <= end; iso = addDays(iso, 1)) {
    if (!effectiveRoutineIds(S, iso, iso).length) continue
    const wd = new Date(iso + 'T12:00:00').getDay()
    const row = by[wd] || (by[wd] = { weekday: wd, planned: 0, missed: 0 })
    row.planned++
    if (!trained.has(iso) && !excusedOn(S, iso)) row.missed++
  }
  let pick = null
  Object.values(by).forEach(row => {
    const rate = row.missed / row.planned
    if (row.missed >= MISSED_MIN && rate >= MISSED_RATE && (!pick || rate > pick.missed / pick.planned)) pick = row
  })
  return pick ? { id: 'missedDay', tone: 'info', data: pick } : null
}

// Days of the period that are over: today is still being eaten and trained.
const pastDays = (win, today = todayISO()) => (win.to < today ? win.to : addDays(today, -1))

export function proteinTrainingRule(S, win, today = todayISO()) {
  if (!S?.nutrition) return null
  const end = pastDays(win, today)
  const stats = nutritionStats(S, win.from, end, today)
  if (!stats) return null
  const trainedDays = [...new Set(workoutsIn(S, win.from, end).map(workoutDay))]
  if (trainedDays.length < 2) return null
  const byDay = Object.fromEntries(stats.perDay.map(x => [x.d, x]))
  // every training day logged, or the food half is not reliable enough to say "all"
  if (!trainedDays.every(d => byDay[d]?.logged)) return null
  if (!trainedDays.every(d => byDay[d].p >= stats.protein * PROTEIN_HIT)) return null
  return { id: 'proteinTraining', tone: 'good', data: { n: trainedDays.length, g: Math.round(stats.protein * PROTEIN_HIT) } }
}

export function underfuelRule(S, win, today = todayISO()) {
  if (!S?.nutrition) return null
  const end = pastDays(win, today)
  const stats = nutritionStats(S, addDays(end, -6), end, today)
  if (!stats || stats.complete < 4 || !(stats.avg > 0)) return null
  const cur = periodStats(S, addDays(end, -6), end).sets
  const weeks = [1, 2, 3, 4].map(i => periodStats(S, addDays(end, -6 - 7 * i), addDays(end, -7 * i)).sets)
  if (weeks.filter(n => n > 0).length < 3) return null
  const base = weeks.reduce((a, b) => a + b, 0) / weeks.length
  if (!(base > 0) || cur < base * UNDERFUEL_VOLUME || stats.avg > stats.target * UNDERFUEL_KCAL) return null
  return { id: 'underfuel', tone: 'watch', data: { volPct: Math.round((cur / base - 1) * 100), kcalPct: Math.round((1 - stats.avg / stats.target) * 100) } }
}

export function flatWhileLoggingRule(S, win, today = todayISO()) {
  if (!S?.nutrition) return null
  const goal = goalOf(S)
  if (goal !== 'lose' && goal !== 'gain') return null
  const end = pastDays(win, today)
  let complete = 0
  for (let i = 0; i < FLAT_DAYS; i++) if (dayDone(S, addDays(end, -i))) complete++
  if (complete < FLAT_DAYS * 0.8) return null
  const tr = weightTrend({ ...S, bodyweight: (S.bodyweight || []).filter(b => b.d <= end) }, { today: end })
  if (!tr.ok || tr.direction !== 'flat' || tr.windowDays < 14) return null
  return { id: 'flatWhileLogging', tone: 'info', data: { goal, days: complete } }
}

export function leanHeldRule(S, win) {
  const c = bodyComp(S).masses
  if (!c.ok) return null
  // only while it is news: the latest check-in no more than two weeks before the period ends
  if (c.last.d > win.to || c.last.d < addDays(win.to, -14)) return null
  const minFat = S.unit === 'lb' ? 2 : 1
  if (!(c.fat <= -minFat) || c.lean < -Math.max(0.5, c.first.lean * 0.01)) return null
  return { id: 'leanHeld', tone: 'good', data: { fat: -c.fat, lean: c.lean, since: c.first.d } }
}

export const RULES = [recordsRule, liftUpRule, consistencyRule, plateauRule, neglectedRule, volumeSpikeRule, missedDayRule,
  proteinTrainingRule, underfuelRule, flatWhileLoggingRule, leanHeldRule]

/** The highlights for a period window (lib/insights.js periodWindow), good news first, at most `max`. */
export function highlightsFor(S, win, { max = MAX_HIGHLIGHTS, rules = RULES } = {}) {
  const found = []
  rules.forEach((rule, i) => {
    const h = rule(S, win)
    if (h) found.push({ ...h, order: i })
  })
  return found.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.order - b.order).slice(0, max)
}
