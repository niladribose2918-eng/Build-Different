// The period report behind the Insights screen (/insights): a week or a month of training against
// the one before it, and the lifts that moved.
//
// Periods are calendar weeks (on the profile's own week start) and calendar months, read by each
// workout's local day like every other reader (workoutDay). A period still running is compared
// with the same number of days into the period before — on a Monday that is one day against one
// day, never one day against a whole week, which would read as a collapse every Monday morning.
//
// Every number reuses the app's own definitions: working sets are workSetsDone (warm-ups never
// count), volume is the workout's stored `vol` (workoutVolume for one saved without it), time is
// workoutDuration, and a PR is a badge on the workout. A lift's movement is its estimated 1RM
// from e1rmSeries — the profile's 1RM formula, dumbbells read in one meaning, assistance machines
// left out — so these figures always match the exercise's own chart in Stats.
import { isoOf, todayISO, weekKey, MONDAY } from './format.js'
import { workoutDay, workoutDuration, workoutVolume, workSetsDone } from './history.js'
import { e1rmSeries } from './onerm.js'
import { computeTargets } from './nutrition-targets.js'
import { dayTotals, dayDone, entriesOn } from './food-log.js'

export const PERIODS = ['week', 'lastWeek', 'month', 'lastMonth']

const noon = iso => new Date(iso + 'T12:00:00')
export const addDays = (iso, n) => { const d = noon(iso); d.setDate(d.getDate() + n); return isoOf(d) }
const daysBetween = (a, b) => Math.round((noon(b) - noon(a)) / 86400000)
const monthStart = iso => iso.slice(0, 8) + '01'
const monthEnd = iso => { const d = noon(monthStart(iso)); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoOf(d) }
const prevMonthStart = iso => { const d = noon(monthStart(iso)); d.setMonth(d.getMonth() - 1); return isoOf(d) }

/**
 * The days a period covers and the days it is compared with, all inclusive ISO dates:
 * { kind, from, to, prevFrom, prevTo, partial }. `partial` is true for a period still running.
 */
export function periodWindow(kind, today = todayISO(), ws = MONDAY) {
  if (kind === 'week' || kind === 'lastWeek') {
    const thisWeek = weekKey(today, ws)
    const from = kind === 'week' ? thisWeek : addDays(thisWeek, -7)
    const to = kind === 'week' ? today : addDays(from, 6)
    const span = daysBetween(from, to)
    return { kind, from, to, prevFrom: addDays(from, -7), prevTo: addDays(from, -7 + span), partial: kind === 'week' }
  }
  if (kind === 'month' || kind === 'lastMonth') {
    const from = kind === 'month' ? monthStart(today) : prevMonthStart(today)
    const to = kind === 'month' ? today : monthEnd(from)
    const prevFrom = prevMonthStart(from)
    // A month still running is compared with as many days of the month before, never past its end.
    const prevTo = kind === 'month' ? [addDays(prevFrom, daysBetween(from, to)), monthEnd(prevFrom)].sort()[0] : monthEnd(prevFrom)
    return { kind, from, to, prevFrom, prevTo, partial: kind === 'month' }
  }
  throw new Error('unknown period ' + kind)
}

/** The workouts dated inside [from, to]. */
export function workoutsIn(S, from, to) {
  return (S?.workouts || []).filter(w => { const d = workoutDay(w); return d && d >= from && d <= to })
}

/** Totals for [from, to]: { workouts, days, sets, volume, ms, prs }. */
export function periodStats(S, from, to) {
  const ws = workoutsIn(S, from, to)
  return {
    workouts: ws.length,
    days: new Set(ws.map(workoutDay)).size,
    sets: ws.reduce((n, w) => n + workSetsDone(w), 0),
    volume: Math.round(ws.reduce((n, w) => n + (Number.isFinite(w.vol) ? w.vol : workoutVolume(w)), 0)),
    ms: ws.reduce((n, w) => n + workoutDuration(w), 0),
    prs: ws.reduce((n, w) => n + (Array.isArray(w.prs) ? w.prs.length : 0), 0),
  }
}

/** One figure against the period before: { cur, prev, diff, pct } (pct null with nothing before). */
export function change(cur, prev) {
  return { cur, prev, diff: cur - prev, pct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null }
}

/** The period's report: its window, totals and the change of each against the period before. */
export function periodReport(S, kind, today = todayISO(), ws = MONDAY) {
  const win = periodWindow(kind, today, ws)
  const cur = periodStats(S, win.from, win.to)
  const prev = periodStats(S, win.prevFrom, win.prevTo)
  const delta = Object.fromEntries(Object.keys(cur).map(k => [k, change(cur[k], prev[k])]))
  return { ...win, cur, prev, delta }
}

/**
 * The lifts that moved in [from, to]: each exercise's best estimated 1RM inside the period
 * against its last session before it, biggest gain first: [{ id, before, now, pct, d }].
 * A single week rarely holds two sessions of one lift, so "first against last inside the
 * period" would almost always be empty; against the last time before, a week reads as well as a month.
 */
export function liftsMoved(S, from, to, { limit = 3 } = {}) {
  const ids = new Set()
  workoutsIn(S, from, to).forEach(w => (w.entries || []).forEach(e => { if (e?.id != null) ids.add(e.id) }))
  const out = []
  ids.forEach(id => {
    const pts = e1rmSeries(S, id)
    const inside = pts.filter(p => p.d >= from && p.d <= to)
    const before = pts.filter(p => p.d < from)
    if (!inside.length || !before.length) return
    const best = inside.reduce((a, b) => (b.y > a.y ? b : a))
    const then = before[before.length - 1].y
    if (!(then > 0)) return
    out.push({ id, before: then, now: best.y, pct: Math.round(((best.y - then) / then) * 1000) / 10, d: best.d })
  })
  return out.sort((a, b) => b.pct - a.pct || b.now - a.now).slice(0, limit)
}

/**
 * Which period the screen opens on. A remembered pick wins, except that "This week" in the
 * first two days of a week opens on last week instead: a day-old week has almost nothing to show.
 */
export function defaultPeriod(remembered, today = todayISO(), ws = MONDAY) {
  const pick = PERIODS.includes(remembered) ? remembered : 'week'
  const early = daysBetween(weekKey(today, ws), today) < 2
  return pick === 'week' && early ? 'lastWeek' : pick
}

// A protein day counts as hit from 90% of the target: a few grams short is a hit in practice.
export const PROTEIN_HIT = 0.9

/**
 * The food side of a period (Insights → Nutrition, Nutrition → Week), or null without Nutrition:
 *   { target, protein, days, logged, complete, avg, proteinDays, perDay: [{ d, k, p, logged, done, today }] }
 * Today is still being eaten, so it is drawn but left out of every count and average. The
 * average is over complete days when there are any, else over the days with anything logged.
 */
export function nutritionStats(S, from, to, today = todayISO()) {
  if (!S?.nutrition) return null
  const tg = computeTargets(S)
  if (!tg.ok) return null
  const perDay = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const tot = dayTotals(S, d)
    perDay.push({ d, k: tot.k, p: tot.p, logged: entriesOn(S, d).length > 0, done: dayDone(S, d), today: d === today })
  }
  const counted = perDay.filter(x => x.d < today)
  const logged = counted.filter(x => x.logged)
  const complete = logged.filter(x => x.done)
  const base = complete.length ? complete : logged
  return {
    target: tg.kcal, protein: tg.protein, days: counted.length, logged: logged.length, complete: complete.length,
    avg: base.length ? Math.round(base.reduce((a, x) => a + x.k, 0) / base.length) : null,
    proteinDays: logged.filter(x => x.p >= tg.protein * PROTEIN_HIT).length,
    perDay,
  }
}

