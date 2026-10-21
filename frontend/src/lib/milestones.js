// Milestones (Insights → Milestones, the Home "This week" card, the finish screen): quiet marks for
// showing up, for the work done and for the body changing, each with the next one in reach.
// Worked out from the log every time, never stored, so editing or deleting a workout moves them
// with it and two devices can never disagree.
//
// Each one carries the day it was earned, read back from the history. A profile that already had
// months of training when this arrived sees its old milestones with their old dates, and nothing
// is announced for them: the finish screen names only what that workout itself earned (the log
// with and without it), and "new" means earned in the last week.
//
// Strength markers are classic gym markers, not rankings: the best estimated 1RM against your body
// weight on the day of the set. Only sets of 10 reps or fewer count, where the 1RM formulas agree
// closely; the weight is that session's own, else the last weigh-in before it, so putting weight
// on later never takes a marker away. The ladders differ per lift because the lifts do: 2× body
// weight is a strong deadlift and an all but unheard-of overhead press.
import { todayISO } from './format.js'
import { addDays, PROTEIN_HIT } from './insights.js'
import { metricRowsForEntry, streakWeeks, workoutDay, workoutVolume } from './history.js'
import { isSideSet } from './workout-model.js'
import { canonicalExId } from './exercises.js'
import { estimate1RM, formulaOf } from './onerm.js'
import { weighIns, trendSeries } from './weight-trend.js'
import { measurementValue, MEASUREMENT_KEYS } from './measurements.js'
import { isLive, dayTotals } from './food-log.js'
import { computeTargets } from './nutrition-targets.js'
import { weeklyTarget } from './goals.js'
import { targetStreak, targetRunReached, weekStreakReached } from './streaks.js'

export const STEPS = {
  workouts: [1, 10, 25, 50, 100, 250, 500],
  streak: [4, 12, 26, 52],
  volume: { kg: [10e3, 50e3, 100e3, 250e3, 500e3, 1e6], lb: [25e3, 100e3, 250e3, 500e3, 1e6, 2e6] },
  records: [1, 10, 50, 100, 250],
  consistency: [1, 4, 12],
  weighIns: [1, 10, 50],
  foodDays: [1, 7, 30, 100],
  proteinDays: [7, 30, 100],
}
export const MARKER_REPS = 10
export const LIFTS = {
  bench: { ids: ['0025'], steps: [0.75, 1, 1.25, 1.5] },
  squat: { ids: ['0043', '1436', '1435', '1868', '3593'], steps: [1, 1.25, 1.5, 2] },
  deadlift: { ids: ['0032', '0966', '0967', '6692'], steps: [1, 1.5, 2, 2.5] },
  press: { ids: ['0091', '1162', '1165', '5328'], steps: [0.5, 0.75, 1] },
}
export const NEW_DAYS = 7
// A body-weight goal is met once the trend is this close (kg / lb), as weight-trend.js reads it.
const CLOSE = { kg: 0.5, lb: 1 }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const LIFT_OF = new Map(Object.entries(LIFTS).flatMap(([k, l]) => l.ids.map(id => [id, k])))
const limbsOf = row => (isSideSet(row) ? [row.sides.L, row.sides.R].filter(s => s?.done === true) : [row])

// The workouts in date order with their day.
const sessionsOf = S => (S?.workouts || []).map(w => ({ w, d: workoutDay(w) })).filter(x => x.d)
  .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.w.start || 0) - (b.w.start || 0)))

// The first day a running total reaches each step: [{ n, earned }] plus the total so far.
function ladder(steps, events) {
  let total = 0, i = 0
  const earned = steps.map(() => null)
  for (const { d, v } of events) {
    total += v
    while (i < steps.length && total >= steps[i]) earned[i++] = d
  }
  return { cur: total, earned }
}

const rows = (group, steps, { cur, earned }, label = {}) =>
  steps.map((n, i) => ({ id: `${group}:${n}`, group, n, earned: earned[i], cur, of: n, ...label }))

/** Each strength marker: { lift, ratio (best so far), earned per step }, from sets of ≤10 reps. */
export function strengthMarkers(S) {
  const formula = formulaOf(S)
  const weights = weighIns(S)
  const bwOn = (w, d) => {
    if (Number(w.bw) > 0) return Number(w.bw)
    let best = null
    for (const p of weights) { if (p.d <= d) best = p; else break }
    if (best) return best.w
    const after = weights.find(p => p.d > d && p.d <= addDays(d, 30))
    return after ? after.w : null
  }
  const out = Object.fromEntries(Object.entries(LIFTS).map(([k, l]) => [k, { lift: k, ratio: 0, earned: l.steps.map(() => null), trained: false }]))
  for (const { w, d } of sessionsOf(S)) {
    let bw = undefined
    for (const e of w.entries || []) {
      const lift = LIFT_OF.get(canonicalExId(e?.id))
      if (!lift) continue
      out[lift].trained = true
      if (bw === undefined) bw = bwOn(w, d)
      if (!(bw > 0)) continue
      for (const s of metricRowsForEntry(e, 'reps').flatMap(limbsOf)) {
        const r = Math.round(Number(s.r) || 0)
        if (r < 1 || r > MARKER_REPS) continue
        const est = estimate1RM(s.w, r, formula, s.rir ?? null)
        if (!(est > 0)) continue
        const ratio = est / bw
        const m = out[lift]
        if (ratio > m.ratio) m.ratio = ratio
        LIFTS[lift].steps.forEach((step, i) => { if (!m.earned[i] && ratio >= step) m.earned[i] = d })
      }
    }
  }
  return out
}

// The first day the trend weight reached the body-weight goal, or null.
function weightGoalReached(S) {
  const target = Number(S?.targetW)
  const list = weighIns(S)
  if (!(target > 0) || !list.length) return null
  const close = CLOSE[S.unit === 'lb' ? 'lb' : 'kg']
  const down = list[0].w > target
  const hit = trendSeries(list).find(p => (down ? p.trend <= target + close : p.trend >= target - close))
  return hit ? hit.d : null
}

/**
 * Every milestone: [{ id, group, n, earned, cur, of, lift? }] — `earned` the day it was reached or
 * null, `cur`/`of` the progress toward it. Strength markers drop out with showStrengthMarkers off,
 * nutrition ones until Nutrition is set up, consistency ones without a weekly target.
 */
export function milestonesOf(S, { today = todayISO() } = {}) {
  const unit = S?.unit === 'lb' ? 'lb' : 'kg'
  const sessions = sessionsOf(S)
  const out = []
  out.push(...rows('workouts', STEPS.workouts, ladder(STEPS.workouts, sessions.map(({ d }) => ({ d, v: 1 })))))
  const ws = weekStreakReached(S, STEPS.streak)
  const run = S?.workouts?.length ? streakWeeks(S) : 0
  out.push(...STEPS.streak.map(n => ({ id: `streak:${n}`, group: 'streak', n, earned: ws.reached[n], cur: run, of: n })))
  const vol = STEPS.volume[unit]
  out.push(...rows('volume', vol, ladder(vol, sessions.map(({ w, d }) => ({ d, v: Number.isFinite(w.vol) ? w.vol : workoutVolume(w) }))), { unit }))
  out.push(...rows('records', STEPS.records, ladder(STEPS.records, sessions.map(({ w, d }) => ({ d, v: Array.isArray(w.prs) ? w.prs.length : 0 })))))

  const target = weeklyTarget(S, today)
  if (target > 0) {
    const st = targetStreak(S, target, { today })
    out.push(...STEPS.consistency.map(n => ({ id: `consistency:${n}`, group: 'consistency', n, target,
      earned: targetRunReached(S, target, n, { today }), cur: st?.weeks || 0, of: n })))
  }

  const wl = weighIns(S)
  out.push(...rows('weighIns', STEPS.weighIns, ladder(STEPS.weighIns, wl.map(p => ({ d: p.d, v: 1 })))))
  const checks = (Array.isArray(S?.measurements) ? S.measurements : [])
    .filter(e => ISO.test(e?.d || '') && MEASUREMENT_KEYS.some(k => measurementValue(e, k) != null)).map(e => e.d).sort()
  out.push({ id: 'measure:1', group: 'measure', n: 1, earned: checks[0] || null, cur: checks.length ? 1 : 0, of: 1 })
  if (Number(S?.targetW) > 0) {
    const d = weightGoalReached(S)
    const first = wl[0]?.w, last = trendSeries(wl).at(-1)?.trend
    const span = first != null ? Math.abs(first - S.targetW) : 0
    const prog = span > 0 && last != null ? Math.min(1, Math.max(0, (first - last) / (first - S.targetW))) : 0
    out.push({ id: 'weightGoal', group: 'weightGoal', n: 1, earned: d, cur: d ? 1 : prog, of: 1, target: Number(S.targetW) })
  }

  if (S?.showStrengthMarkers !== false) {
    for (const m of Object.values(strengthMarkers(S))) {
      if (!m.trained) continue
      LIFTS[m.lift].steps.forEach((step, i) => out.push({ id: `strength:${m.lift}:${step}`, group: 'strength', lift: m.lift, n: step,
        earned: m.earned[i], cur: Math.round(m.ratio * 100) / 100, of: step }))
    }
  }

  const foodDays = [...new Set(Object.values(S?.foodLog || {}).filter(isLive).map(e => e.d))].sort()
  if (S?.nutrition || foodDays.length) {
    out.push(...rows('foodDays', STEPS.foodDays, ladder(STEPS.foodDays, foodDays.map(d => ({ d, v: 1 })))))
    const goal = computeTargets(S)
    if (goal?.ok && goal.protein > 0) {
      const hit = foodDays.filter(d => d <= today && dayTotals(S, d).p >= goal.protein * PROTEIN_HIT)
      out.push(...rows('proteinDays', STEPS.proteinDays, ladder(STEPS.proteinDays, hit.map(d => ({ d, v: 1 })))))
    }
  }
  return out
}

/**
 * Insights' Milestones card: { earned, next, recent } — earned newest first; next the first
 * unearned step of each ladder (one per lift), nearest done first; recent those earned in the
 * last NEW_DAYS days.
 */
export function milestonesView(S, { today = todayISO(), max = 4 } = {}) {
  const all = milestonesOf(S, { today })
  const earned = all.filter(m => m.earned).sort((a, b) => (a.earned < b.earned ? 1 : a.earned > b.earned ? -1 : b.of - a.of))
  const since = addDays(today, -NEW_DAYS)
  const recent = earned.filter(m => m.earned > since && m.earned <= today)
  const seen = new Set()
  const next = []
  for (const m of all) {
    const ladderKey = m.group === 'strength' ? 'strength:' + m.lift : m.group
    if (m.earned || seen.has(ladderKey)) continue
    seen.add(ladderKey)
    next.push({ ...m, pct: Math.min(1, m.of ? m.cur / m.of : 0) })
  }
  next.sort((a, b) => b.pct - a.pct)
  return { earned, next: next.slice(0, max), recent, all }
}

/** The milestones the workout `w` earned: the log with it against the log without it. */
export function milestonesEarnedBy(S, w, { today = todayISO() } = {}) {
  if (S?.showMilestones === false || !w) return []
  const without = { ...S, workouts: (S.workouts || []).filter(x => x !== w && (w.id == null || x.id !== w.id)) }
  const before = new Set(milestonesOf(without, { today }).filter(m => m.earned).map(m => m.id))
  return milestonesOf(S, { today }).filter(m => m.earned && !before.has(m.id))
}
