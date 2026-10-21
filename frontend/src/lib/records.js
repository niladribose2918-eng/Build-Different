// Personal records, read back from the log for the Records board (/records).
//
// Nothing here is a new definition of a record. Every number comes from the helpers the rest of
// the app already uses, so the board can never disagree with a PR badge or a "Best:" line:
//
//   heaviest set  — bestWeightForEntry, folded with betterWeight: the lightest load wins on an
//                   assistance machine (issue #232), warm-ups never count, and a dumbbell weight
//                   is read in the exercise's current meaning (lib/dumbbells.js workoutAs)
//   best est. 1RM — bestSetOf with the profile's 1RM formula, the same scan e1rmSeries and
//                   best1RM run; assistance machines have none
//   most reps     — completedRepsOf, for work that has never carried a load
//   longest hold  — the longest completed timed set; top speed for cardio (kept in km/h, shown
//                   in the profile's speed unit by the view)
//
// The rep table is the one place that needs care. A program that only ever does sets of 8
// leaves "the heaviest weight lifted for at least 1 rep" at the same 75 kg as the 8 — a 1RM
// nobody tried. So a rep count is a record (`done`) only when a set at exactly that many reps
// set its weight. Any other count is an estimate back from the best 1RM (`est`), never lower
// than what a longer set already proves. Counts beyond what the estimate covers stay empty.
import { betterWeight, isAssisted } from './exercises.js'
import { bestWeightForEntry, completedRepsOf, metricRowsForEntry, metricModeForEntry, workoutAt, workoutDay } from './history.js'
import { isSideSet } from './workout-model.js'
import { bestSetOf, estimate1RM, formulaOf } from './onerm.js'
import { currentDbLoad, workoutAs } from './dumbbells.js'

export const REP_COUNTS = [1, 3, 5, 8, 10, 12]
export const RECENT_DAYS = 30

// Completed limbs of a row as plain { w, r } sets: both sides of a per-side row count apiece.
const limbsOf = row => (isSideSet(row) ? [row.sides.L, row.sides.R].filter(side => side?.done === true) : [row])

// The weight a best 1RM says you could move for `reps`, rounded to the 0.5 a plate allows. The
// formulas scale with the load, so one estimate of 100 × reps gives the factor for all of them.
export function weightForReps(e1rm, reps, formula) {
  if (!(e1rm > 0) || !(reps >= 1)) return null
  if (reps === 1) return Math.round(e1rm * 2) / 2
  const at100 = estimate1RM(100, reps, formula)
  if (!(at100 > 0)) return null
  return Math.round((e1rm / (at100 / 100)) * 2) / 2
}

// Every exercise ever logged, with its records. `S` is the whole state; nothing is written.
export function recordsFor(S) {
  const formula = formulaOf(S)
  const workouts = Array.isArray(S?.workouts) ? S.workouts : []
  const acc = new Map()
  const asOf = new Map()
  const as = id => {
    if (!asOf.has(id)) asOf.set(id, currentDbLoad(S, id))
    return asOf.get(id)
  }

  workouts.forEach(w0 => {
    const day = workoutDay(w0)
    const at = workoutAt(w0)
    const seen = new Set()
    ;(w0?.entries || []).forEach(raw => {
      const id = raw?.id
      if (id == null || id === '') return
      // Read the whole workout in this exercise's dumbbell meaning once per exercise, so two
      // entries of the same lift in one session are scanned once each and counted as one session.
      if (seen.has(id)) return
      seen.add(id)
      const w = workoutAs(w0, id, as(id))
      const entries = (w.entries || []).filter(e => e?.id === id)
      let r = acc.get(id)
      if (!r) {
        r = { id, name: raw?.muscleSnapshot?.n || raw?.n || null, sessions: 0, last: null, mode: null,
          heaviest: null, e1rm: null, mostReps: null, longestHold: null, topSpeed: null, bests: {} }
        acc.set(id, r)
      }
      r.sessions++
      if (!r.last || (day && day > r.last)) r.last = day
      entries.forEach(entry => {
        const mode = metricModeForEntry(entry)
        if (mode) r.mode = mode
        if (mode === 'reps') {
          // Heaviest set: the same fold bestWeightFor makes, plus the reps it was done for.
          const top = bestWeightForEntry(entry)
          if (top > 0) {
            const better = r.heaviest ? betterWeight(id, r.heaviest.w, top) : top
            const reps = metricRowsForEntry(entry, 'reps').flatMap(limbsOf)
              .filter(s => Number(s.w) === top).reduce((m, s) => Math.max(m, Math.round(Number(s.r) || 0)), 0)
            if (!r.heaviest || (better === top && (top !== r.heaviest.w || reps > r.heaviest.r))) r.heaviest = { w: top, r: reps, d: day, t: at }
          }
          const best = bestSetOf(entry, formula)
          if (best && (!r.e1rm || best.est > r.e1rm.est)) r.e1rm = { ...best, d: day, t: at }
          metricRowsForEntry(entry, 'reps').forEach(row => {
            const reps = completedRepsOf(row)
            if (reps > 0 && !(Number(row.w) > 0) && (!r.mostReps || reps > r.mostReps.r)) r.mostReps = { r: reps, d: day, t: at }
            // Best load at exactly each rep count, for the rep table below.
            if (isAssisted(id)) return
            limbsOf(row).forEach(s => {
              const n = Math.round(Number(s.r) || 0)
              const load = Number(s.w)
              if (n < 1 || !(load > 0)) return
              if (!r.bests[n] || load > r.bests[n].w) r.bests[n] = { w: load, d: day, t: at }
            })
          })
        } else if (mode === 'time') {
          metricRowsForEntry(entry, 'time').flatMap(limbsOf).forEach(s => {
            const sec = Number(s.sec) || 0
            if (sec > 0 && (!r.longestHold || sec > r.longestHold.sec)) r.longestHold = { sec, w: Number(s.w) || 0, d: day, t: at }
          })
        } else if (mode === 'cardio') {
          metricRowsForEntry(entry, 'cardio').forEach(s => {
            const speed = Number(s.speed) || 0
            if (speed > 0 && (!r.topSpeed || speed > r.topSpeed.speed)) r.topSpeed = { speed, min: Number(s.min) || 0, d: day, t: at }
          })
        }
      })
    })
  })

  const bw = latestBodyweight(S)
  const lastPr = lastPrDays(S)
  return [...acc.values()].map(r => {
    // Bodyweight work that never carried a load keeps its rep count as the record; one loaded
    // set later and the heaviest set takes over, the way Stats charts it (issue #5).
    if (r.heaviest) r.mostReps = null
    const out = { ...r, repTable: r.mode === 'reps' && r.heaviest ? repTable(r.bests, r.e1rm, formula) : null, lastPr: lastPr.get(r.id) || null }
    out.relative = r.e1rm && bw > 0 && !isAssisted(r.id) ? Math.round((r.e1rm.est / bw) * 100) / 100 : null
    delete out.bests
    return out
  }).filter(r => r.heaviest || r.e1rm || r.mostReps || r.longestHold || r.topSpeed)
}

// One row per count in REP_COUNTS: { n, w, done } for a weight lifted at exactly n reps that no
// longer set beats, { n, w, est } for an estimate, or { n, w: null } when there is nothing honest
// to show. `bests` maps an exact rep count to its best load.
export function repTable(bests, e1rm, formula) {
  const counts = Object.keys(bests || {}).map(Number)
  return REP_COUNTS.map(n => {
    // What sets of n reps or more already prove you can lift for n.
    let floor = null
    counts.forEach(c => { if (c >= n && (!floor || bests[c].w > floor.w)) floor = { ...bests[c], c } })
    if (floor && floor.c === n) return { n, w: floor.w, d: floor.d, done: true }
    const est = e1rm ? weightForReps(e1rm.est, n, formula) : null
    if (est != null) return { n, w: Math.max(est, floor ? floor.w : 0), est: true }
    return floor ? { n, w: floor.w, est: true } : { n, w: null }
  })
}

// The newest weigh-in by date, in the profile's unit, or 0 when there is none.
export function latestBodyweight(S) {
  const list = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  let best = null
  list.forEach(b => { if (b && b.w > 0 && (!best || String(b.d) > String(best.d) || (b.d === best.d && (b.t || 0) > (best.t || 0)))) best = b })
  return best ? best.w : 0
}

// The day each exercise last earned a PR badge — the badges are the record of a weight PR.
function lastPrDays(S) {
  const out = new Map()
  ;(S?.workouts || []).forEach(w => {
    const day = workoutDay(w)
    ;(w?.prs || []).forEach(id => { if (day && (!out.has(id) || day > out.get(id))) out.set(id, day) })
  })
  return out
}

// Every PR badge in the last `days` days, newest first, with the set that earned it:
// [{ id, d, t, w, r }]. The set is the heaviest completed set of that exercise in the workout.
export function recentPrs(S, { days = RECENT_DAYS, now = Date.now() } = {}) {
  const since = now - days * 86400000
  const out = []
  ;(S?.workouts || []).forEach(w0 => {
    const at = workoutAt(w0)
    if (!(at >= since) || !(w0?.prs || []).length) return
    const day = workoutDay(w0)
    ;[...new Set(w0.prs)].forEach(id => {
      const w = workoutAs(w0, id, currentDbLoad(S, id))
      const entries = (w.entries || []).filter(e => e?.id === id)
      let top = 0
      entries.forEach(e => { const b = bestWeightForEntry(e); if (b > 0) top = top > 0 ? betterWeight(id, top, b) : b })
      const reps = entries.flatMap(e => metricRowsForEntry(e, 'reps').flatMap(limbsOf))
        .filter(s => Number(s.w) === top).reduce((m, s) => Math.max(m, Math.round(Number(s.r) || 0)), 0)
      out.push({ id, d: day, t: at, w: top, r: reps })
    })
  })
  return out.sort((a, b) => b.t - a.t)
}

// How many PR badges the whole history carries.
export const prCount = S => (S?.workouts || []).reduce((n, w) => n + (Array.isArray(w?.prs) ? w.prs.length : 0), 0)

// Sorting for the board: 'recent' (newest record first, then most trained) or 'trained'.
export function sortRecords(list, by = 'recent') {
  const recentOf = r => [r.lastPr, r.heaviest?.d, r.e1rm?.d, r.mostReps?.d, r.longestHold?.d, r.topSpeed?.d].filter(Boolean).sort().at(-1) || ''
  return [...list].sort((a, b) => by === 'trained'
    ? b.sessions - a.sessions || String(b.last).localeCompare(String(a.last))
    : recentOf(b).localeCompare(recentOf(a)) || b.sessions - a.sessions)
}
