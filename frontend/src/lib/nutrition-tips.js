// Nutrition tips: short, factual lines that use the training plan (Nutrition → Today and the
// finish screen). One at a time, dismissible for the day, and switched off in Nutrition settings
// (S.nutrition.tips). They push the daily protein total first: timing matters far less than the
// total, so a training-day tip is a nudge, not a rule. They never comment on body size and never
// call a food bad.
//
//   training  a session is planned or done today: protein before and after it
//   fibre     the 3 complete days before today all under 25 g of fibre, where the log has fibre
//             data for each (a day of quick adds has none, so it says nothing)
// plus finishProtein, the "protein so far today" line on the finish summary.
import { todayISO } from './format.js'
import { effectiveRoutineIds } from './history.js'
import { computeTargets } from './nutrition-targets.js'
import { dayTotals, dayDone, entriesOn, QUICK } from './food-log.js'

export const FIBRE_FLOOR = 25
export const FIBRE_DAYS = 3
const DAY = 86400000
const shift = (iso, n) => new Date(Date.parse(iso + 'T12:00:00') + n * DAY).toISOString().slice(0, 10)

/** Whether tips show at all: Nutrition set up and its Tips switch on. */
export const tipsOn = S => !!S?.nutrition && S.nutrition.tips !== false

/** Today's session, planned or already logged, as a name; null on a rest day. */
export function todaysSession(S, today = todayISO()) {
  const routines = Array.isArray(S?.routines) ? S.routines : []
  const ids = effectiveRoutineIds(S, today, today)
  const planned = ids.map(id => routines.find(r => r.id === id)?.name).filter(Boolean)
  if (planned.length) return planned.join(' + ')
  const done = (S?.workouts || []).filter(w => w.d === today)
  return done.length ? done.at(-1).name || '' : null
}

export function trainingTip(S, today = todayISO()) {
  const name = todaysSession(S, today)
  return name == null ? null : { id: 'training', data: { name } }
}

export function fibreTip(S, today = todayISO()) {
  const days = Array.from({ length: FIBRE_DAYS }, (_, i) => shift(today, -1 - i))
  for (const d of days) {
    if (!dayDone(S, d)) return null
    if (!entriesOn(S, d).some(e => e.f !== QUICK)) return null
    if (dayTotals(S, d).fb >= FIBRE_FLOOR) return null
  }
  const avg = Math.round(days.reduce((a, d) => a + dayTotals(S, d).fb, 0) / FIBRE_DAYS)
  return { id: 'fibre', data: { avg, floor: FIBRE_FLOOR } }
}

/** The tips for today, in order, leaving out any dismissed today (`dismissed`: id → date). */
export function tipsFor(S, { today = todayISO(), dismissed = {} } = {}) {
  if (!tipsOn(S)) return []
  return [trainingTip(S, today), fibreTip(S, today)].filter(t => t && dismissed[t.id] !== today)
}

/** Protein so far today against the target, for the finish summary, or null. */
export function finishProtein(S, today = todayISO()) {
  if (!tipsOn(S)) return null
  const tg = computeTargets(S)
  if (!tg.ok || !(tg.protein > 0)) return null
  const p = Math.round(dayTotals(S, today).p)
  return p > 0 ? { p, target: tg.protein } : null
}
