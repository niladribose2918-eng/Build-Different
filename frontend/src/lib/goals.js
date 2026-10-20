// Goals beyond body weight (Insights → Goals, the Home "This week" card, the finish screen): a
// lift, a number of sessions a week, a measurement. Progress is read from the log the app
// already keeps; a goal itself stores only what you asked for:
//
//   S.goals = { [id]: { kind: 'lift', ex, kg, r, from, _ts }     a weight × reps on one exercise
//                     | { kind: 'freq', n, from, _ts }           sessions a week
//                     | { kind: 'measure', field, target, start, from, _ts } }
//
// Stamped per goal like day notes (lib/day-notes.js), so two devices that each set a goal keep
// both; removing one is a stamped empty entry, which syncs where a deleted key would come back.
// A lift's weight is kept in kg whatever the profile's unit, the way measurements are kept in
// cm (lib/measurements.js), so switching kg ↔ lb never has to rewrite it.
//
// A lift goal's bar fills with your best estimated 1RM of the last 90 days against the target's,
// but the goal is reached only by a set that meets it, logged on or after the day you set it:
// an estimate can say 100 kg long before 100 kg is on the bar ("ready to test"). A measurement
// goal is reached by a check-in at or past the target, lower or higher worked out from where it
// started. Sessions a week never finish; they read as a hit rate. The body-weight goal stays
// where it is (S.targetW and its own sheet) and is listed beside these, not copied into them.
import { uid, todayISO } from './format.js'
import { addDays } from './insights.js'
import { workoutDay, metricRowsForEntry } from './history.js'
import { isSideSet } from './workout-model.js'
import { bestSetOf, estimate1RM, formulaOf } from './onerm.js'
import { currentDbLoad, workoutAs } from './dumbbells.js'
import { isAssisted } from './exercises.js'
import { MEASUREMENT_KEYS, measurementValue } from './measurements.js'
import { LB_PER_KG } from './units.js'
import { weekTally } from './queue.js'
import { weekRows } from './streaks.js'
import { weightTrend } from './weight-trend.js'

export const MAX_ACTIVE = 6
export const LIFT_REPS_MAX = 10
// How far back the lift bar and the expected dates read.
export const LIFT_DAYS = 90
export const MEASURE_DAYS = 120
// Further out than this a date is a guess about a different body: none is given.
export const HORIZON_DAYS = 365
// A logged weight within this of the target meets it: kg ↔ lb conversion rounds sets to the
// nearest 0.25 kg or 0.5 lb, which must not leave a met goal a hair short.
const TOLERANCE = { kg: 0.13, lb: 0.26 }

const DAY = 86400000
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const noon = iso => Date.parse(iso + 'T12:00:00')
const unitOf = S => (S?.unit === 'lb' ? 'lb' : 'kg')
const r1 = v => Math.round(v * 10) / 10
const fieldOk = f => typeof f === 'string' && (MEASUREMENT_KEYS.includes(f) || (f.startsWith('other:') && f.length > 6))

/** A stored goal read back, junk left out, or null for none or a removed one. */
export function readGoal(e) {
  if (!isMap(e) || !ISO.test(e.from || '')) return null
  if (e.kind === 'lift') {
    const kg = Number(e.kg), r = Number(e.r)
    return typeof e.ex === 'string' && e.ex && kg > 0 && kg < 1000 && Number.isInteger(r) && r >= 1 && r <= LIFT_REPS_MAX
      ? { kind: 'lift', ex: e.ex, kg, r, from: e.from } : null
  }
  if (e.kind === 'freq') {
    const n = Number(e.n)
    return Number.isInteger(n) && n >= 1 && n <= 7 ? { kind: 'freq', n, from: e.from } : null
  }
  if (e.kind === 'measure') {
    const target = Number(e.target), start = Number(e.start)
    return fieldOk(e.field) && target > 0 && start > 0 && target !== start
      ? { kind: 'measure', field: e.field, target, start, from: e.from } : null
  }
  return null
}

/** Every goal, oldest first: [{ id, ...goal }]. */
export function goalsOf(S) {
  const m = isMap(S?.goals) ? S.goals : {}
  return Object.keys(m).map(id => { const g = readGoal(m[id]); return g && { id, ...g } }).filter(Boolean)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : (m[a.id]._ts || 0) - (m[b.id]._ts || 0)))
}

/** The map with `goal` stored under `id`, stamped `now`. */
export function withGoal(map, goal, id = uid(), now = Date.now()) {
  const clean = readGoal(goal)
  return { ...(isMap(map) ? map : {}), [id]: clean ? { ...clean, _ts: now } : { _ts: now } }
}

/** The map with goal `id` removed (a stamped empty entry, so the removal syncs). */
export const withoutGoal = (map, id, now = Date.now()) => ({ ...(isMap(map) ? map : {}), [id]: { _ts: now } })

/** A lift goal's weight in the profile's unit, unrounded. */
export const liftWeight = (g, unit) => (unit === 'lb' ? g.kg * LB_PER_KG : g.kg)
/** A weight in the profile's unit as the kg a lift goal stores. */
export const toGoalKg = (w, unit) => (unit === 'lb' ? w / LB_PER_KG : w)

/** The sessions-a-week the target streak counts against: a frequency goal's, else the plan's training days, else 0. */
export function weeklyTarget(S, today = todayISO()) {
  const g = goalsOf(S).find(x => x.kind === 'freq')
  if (g) return g.n
  try { return weekTally(S, today).planned || 0 } catch { return 0 }
}

// Least-squares slope per day through [{ t, y }] and its value at the last point.
function fit(pts) {
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p.t, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0, sxy = 0
  for (const p of pts) { sxx += (p.t - mx) ** 2; sxy += (p.t - mx) * (p.y - my) }
  const slope = sxx > 0 ? sxy / sxx * DAY : 0
  return { slope, last: my + (sxx > 0 ? sxy / sxx : 0) * (pts.at(-1).t - mx), lastT: pts.at(-1).t }
}

// When a fitted line through `pts` reaches `target` moving in `dir` (+1 up, −1 down): an ISO
// date, or null for too few points, a line going the other way, or a date past the horizon.
function expectedDate(pts, target, dir, today) {
  if (pts.length < 3 || (pts.at(-1).t - pts[0].t) / DAY < 14) return null
  const { slope, last, lastT } = fit(pts)
  if (!(slope * dir > 0)) return null
  const days = (target - last) / slope
  if (!(days > 0)) return null
  const at = lastT + days * DAY
  if ((at - noon(today)) / DAY > HORIZON_DAYS) return null
  const iso = new Date(at).toISOString().slice(0, 10)
  return iso < today ? today : iso
}

const limbsOf = row => (isSideSet(row) ? [row.sides.L, row.sides.R].filter(s => s?.done === true) : [row])

/**
 * A lift goal read against the log: { kind, target, targetE1rm, e1rm, pct, done, ready, date,
 * lastTrained }. `done` is the first set that met the goal ({ d, w, r, src }), `e1rm` the best
 * estimate of the last 90 days, both in the profile's unit.
 */
export function liftStatus(S, g, { today = todayISO() } = {}) {
  const unit = unitOf(S)
  const formula = formulaOf(S)
  const target = liftWeight(g, unit)
  const targetE1rm = estimate1RM(target, g.r, formula) || target
  const tol = TOLERANCE[unit]
  const since = addDays(today, -LIFT_DAYS)
  const as = currentDbLoad(S, g.ex)
  const sessions = (S?.workouts || []).map(w => ({ w, d: workoutDay(w) })).filter(x => x.d).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  let done = null, e1rm = null, lastTrained = null
  const pts = []
  for (const { w: w0, d } of sessions) {
    const entries = (workoutAs(w0, g.ex, as).entries || []).filter(e => e?.id === g.ex)
    if (!entries.length) continue
    let best = null
    for (const entry of entries) {
      const b = bestSetOf(entry, formula)
      if (b && (!best || b.est > best)) best = b.est
      if (!done && d >= g.from) {
        for (const s of metricRowsForEntry(entry, 'reps').flatMap(limbsOf)) {
          const w = Number(s.w), r = Math.round(Number(s.r) || 0)
          if (w >= target - tol && r >= g.r) { done = { d, w, r, src: w0 }; break }
        }
      }
    }
    if (best == null) continue
    lastTrained = d
    if (d >= since) {
      pts.push({ t: noon(d), y: best })
      if (e1rm == null || best > e1rm) e1rm = best
    }
  }
  const pct = e1rm ? Math.min(1, e1rm / targetE1rm) : 0
  const ready = !done && e1rm != null && e1rm >= targetE1rm
  return { kind: 'lift', target, targetE1rm: r1(targetE1rm), e1rm, pct, done, ready, lastTrained,
    date: done || ready ? null : expectedDate(pts, targetE1rm, 1, today) }
}

/**
 * A frequency goal: { kind, n, thisWeek, hit, of, pct } — `hit` of the last `of` finished weeks
 * (at most 12, none before your first workout, excused weeks left out) reached `n` sessions.
 */
export function freqStatus(S, g, { today = todayISO() } = {}) {
  const rows = weekRows(S, g.n, { today })
  const cur = rows.at(-1)
  const past = rows.filter(r => !r.current && !r.excused).slice(-12)
  const hit = past.filter(r => r.hit).length
  return { kind: 'freq', n: g.n, thisWeek: cur?.current ? cur.done : 0, hit, of: past.length, pct: past.length ? hit / past.length : 0, done: null, date: null }
}

/**
 * A measurement goal: { kind, cur, lower, pct, done, date, last } — values as stored (cm, or %
 * for body fat), `done` the first check-in at or past the target ({ d, v }).
 */
export function measureStatus(S, g, { today = todayISO() } = {}) {
  const vals = (Array.isArray(S?.measurements) ? S.measurements : [])
    .map(e => ({ d: e?.d, v: measurementValue(e, g.field) }))
    .filter(x => x.v != null && ISO.test(x.d || '')).sort((a, b) => (a.d < b.d ? -1 : 1))
  const lower = g.target < g.start
  const last = vals.at(-1) || null
  const cur = last ? last.v : null
  const done = vals.find(x => x.d >= g.from && (lower ? x.v <= g.target : x.v >= g.target)) || null
  const span = g.start - g.target
  const pct = cur == null ? 0 : Math.min(1, Math.max(0, (g.start - cur) / span))
  const since = addDays(today, -MEASURE_DAYS)
  const pts = vals.filter(x => x.d >= since).map(x => ({ t: noon(x.d), y: x.v }))
  return { kind: 'measure', cur, lower, pct, done, last: last?.d || null,
    date: done ? null : expectedDate(pts, g.target, lower ? -1 : 1, today) }
}

/** Any goal's status, as above. */
export function goalStatus(S, g, opts) {
  return g.kind === 'lift' ? liftStatus(S, g, opts) : g.kind === 'freq' ? freqStatus(S, g, opts) : measureStatus(S, g, opts)
}

/**
 * Insights' Goals card: { active, achieved, weight, full } — every goal joined with its status
 * ({ id, ...goal, status }), achieved ones newest first, the body-weight goal as weightTrend reads
 * it (null without one), and `full` once MAX_ACTIVE goals are running.
 */
export function goalsView(S, { today = todayISO() } = {}) {
  const all = goalsOf(S).map(g => ({ ...g, status: goalStatus(S, g, { today }) }))
  const active = all.filter(g => !g.status.done)
  const achieved = all.filter(g => g.status.done).sort((a, b) => (a.status.done.d < b.status.done.d ? 1 : -1))
  let weight = null
  if (Number(S?.targetW) > 0) {
    const tr = weightTrend(S, { today })
    weight = { target: Number(S.targetW), trend: tr.ok ? tr.trend : tr.trend ?? null, goal: tr.ok ? tr.goal : null }
  }
  return { active, achieved, weight, full: active.length >= MAX_ACTIVE }
}

/** The running goal nearest done, for the Home card: a lift or measurement first, then the weight, then sessions a week. */
export function nearestGoal(S, { today = todayISO() } = {}) {
  const view = goalsView(S, { today })
  const ranked = view.active.filter(g => g.kind !== 'freq').sort((a, b) => b.status.pct - a.status.pct)
  if (ranked.length) return ranked[0]
  if (view.weight?.goal && !view.weight.goal.reached) return { kind: 'weight', ...view.weight }
  return view.active.find(g => g.kind === 'freq') || null
}

/** The lift goals the workout `w` reached (`S` already holding it), for the finish screen. */
export function goalsReachedBy(S, w, { today = todayISO() } = {}) {
  return goalsOf(S).filter(g => g.kind === 'lift').map(g => ({ ...g, status: liftStatus(S, g, { today }) }))
    .filter(g => g.status.done && (g.status.done.src === w || (w?.id != null && g.status.done.src?.id === w.id)))
}

/** Whether `ex` can carry a lift goal: an assistance machine has no weight to aim up at. */
export const liftGoalOk = ex => !!ex && !isAssisted(ex)
