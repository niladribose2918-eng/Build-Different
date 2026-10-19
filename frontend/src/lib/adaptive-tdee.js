// The weekly check-in (Nutrition → Week): what you ate against how your weight moved, read back
// as the maintenance calories your own body runs on, and a target for your pace that you apply or
// keep. Nothing changes without that tap.
//
//   maintenance = average intake − weight change × 7,700 kcal/kg ÷ days
//
// over the last 28 days before today. 7,700 kcal/kg is a simplification (real change mixes fat,
// muscle and water, and water rules short windows), so:
//   - only days marked complete count: a forgotten snack would read as a lower maintenance and
//     push the target down; at least 10 of them
//   - the weight change is the trend line through the window's weigh-ins (lib/weight-trend.js
//     reads the same weigh-ins), never two raw weigh-ins; at least 4, over at least 14 days
//   - while the data is thin it is blended with the formula, all of it own data from 21 days on
//   - a check-in moves the target by at most 10%, and never below resting burn or past the pace
//     limits the targets already keep (lib/nutrition-targets.js)
//
// Check-ins are kept in a stamped map, one entry each, so their history syncs:
//   S.nutritionCheckins = { [id]: { d, intake, days, change, maintenance, from, to, applied, _ts } }
import { todayISO, uid } from './format.js'
import { computeTargets, targetFor, KCAL_PER_KG } from './nutrition-targets.js'
import { dayTotals, dayDone } from './food-log.js'
import { weighIns } from './weight-trend.js'

const DAY = 86400000
export const WINDOW_DAYS = 28
export const MIN_COMPLETE_DAYS = 10
export const MIN_WEIGH_INS = 4
export const MIN_SPAN_DAYS = 14
export const FULL_TRUST_DAYS = 21
export const MAX_STEP = 0.10
export const EVERY_DAYS = 7
// A suggestion smaller than this is noise: the check-in says the target is on track.
export const ON_TRACK_KCAL = 30
const LB_PER_KG = 2.2046226218
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const noon = iso => Date.parse(iso + 'T12:00:00')
const addDays = (iso, n) => new Date(noon(iso) + n * DAY).toISOString().slice(0, 10)

function slopePerDay(points) {
  const n = points.length
  const mx = points.reduce((a, p) => a + p.t, 0) / n, my = points.reduce((a, p) => a + p.w, 0) / n
  let num = 0, den = 0
  for (const p of points) { num += (p.t - mx) * (p.w - my); den += (p.t - mx) ** 2 }
  return den ? num / den * DAY : 0
}

/**
 * What the log says about maintenance:
 *   { ok: false, need: { days, weighIns, span } }  how much more is needed, each 0 once met
 *   { ok: true, from, to, days, completeDays, intake, weighInsUsed, changeKg, perDay, raw,
 *     formula, trust, maintenance }
 * `raw` is from the log alone; `maintenance` blends it with the formula by `trust` (0–1).
 */
export function learnMaintenance(S, { today = todayISO() } = {}) {
  const to = addDays(today, -1), from = addDays(today, -WINDOW_DAYS)
  const days = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (dayDone(S, d)) days.push({ d, k: dayTotals(S, d).k })
  const complete = days.filter(x => x.k > 0)
  const wins = weighIns(S).filter(p => p.d >= from && p.d <= to)
  const span = wins.length ? Math.round((wins.at(-1).t - wins[0].t) / DAY) : 0
  const need = {
    days: Math.max(0, MIN_COMPLETE_DAYS - complete.length),
    weighIns: Math.max(0, MIN_WEIGH_INS - wins.length),
    span: Math.max(0, MIN_SPAN_DAYS - span),
  }
  const tg = computeTargets(S)
  if (need.days || need.weighIns || need.span || !tg.ok || tg.bmr == null) return { ok: false, need, targetsOk: tg.ok }

  const intake = complete.reduce((a, x) => a + x.k, 0) / complete.length
  const toKg = S.unit === 'lb' ? 1 / LB_PER_KG : 1
  const perDay = slopePerDay(wins) * toKg
  const raw = intake - perDay * KCAL_PER_KG
  const trust = Math.min(1, complete.length / FULL_TRUST_DAYS)
  const maintenance = trust * raw + (1 - trust) * tg.formulaTdee
  return {
    ok: true, from, to, days: WINDOW_DAYS, completeDays: complete.length, intake: Math.round(intake),
    weighInsUsed: wins.length, changeKg: perDay * span, perDay, raw: Math.round(raw),
    formula: Math.round(tg.formulaTdee), trust, maintenance: Math.round(maintenance), targets: tg,
  }
}

/** The check-ins, newest first. */
export function checkinsOf(S) {
  const m = isMap(S?.nutritionCheckins) ? S.nutritionCheckins : {}
  return Object.keys(m).filter(id => m[id]?.d).map(id => ({ id, ...m[id] })).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b._ts || 0) - (a._ts || 0)))
}

/** Days until the next check-in is due (0 = due today), counted from the last one answered. */
export function daysUntilCheckin(S, today = todayISO()) {
  const last = checkinsOf(S)[0]
  if (!last) return 0
  return Math.max(0, EVERY_DAYS - Math.round((noon(today) - noon(last.d)) / DAY))
}

/**
 * The check-in for today:
 *   { due: false, inDays, learn }               not yet a week since the last one
 *   { due: true, learn }                        due, but learn.ok is false (it says what is missing)
 *   { due: true, learn, current, suggested, change, capped, onTrack, maintenance }
 * `suggested` is the daily target the learned maintenance gives for the profile's pace, moved at
 * most 10% from the current target and never below resting burn.
 */
export function checkinFor(S, { today = todayISO() } = {}) {
  const inDays = daysUntilCheckin(S, today)
  const learn = learnMaintenance(S, { today })
  if (inDays > 0) return { due: false, inDays, learn }
  if (!learn.ok) return { due: true, learn }
  const tg = learn.targets
  const current = tg.kcal
  const free = targetFor(learn.maintenance, tg)
  const lo = Math.round(current * (1 - MAX_STEP) / 10) * 10, hi = Math.round(current * (1 + MAX_STEP) / 10) * 10
  let suggested = Math.min(hi, Math.max(lo, free.kcal))
  // The cap never takes a target under resting burn either.
  suggested = Math.max(suggested, Math.ceil(tg.bmr / 10) * 10)
  const change = suggested - current
  return {
    due: true, learn, current, suggested, change, capped: suggested !== free.kcal,
    onTrack: Math.abs(change) < ON_TRACK_KCAL, maintenance: learn.maintenance,
  }
}

/**
 * The profile after answering a check-in: the check-in recorded, and on Apply the learned
 * maintenance behind the suggested target saved (or, with manual targets, the calories moved and
 * carbs refilled around the same protein and fat). Mutates `s`, the way store updates do.
 */
export function answerCheckin(s, ci, apply, { today = todayISO(), now = Date.now(), id = uid() } = {}) {
  const l = ci.learn
  const entry = {
    d: today, intake: l.intake, days: l.completeDays, change: Math.round(l.changeKg * 100) / 100,
    maintenance: l.maintenance, from: ci.current, to: apply ? ci.suggested : ci.current, applied: !!apply && !ci.onTrack, _ts: now,
  }
  s.nutritionCheckins = { ...(isMap(s.nutritionCheckins) ? s.nutritionCheckins : {}), [id]: entry }
  if (!apply || ci.onTrack) return s
  const n = s.nutrition || {}
  if (n.manual && Number(n.manual.kcal) > 0) {
    const kcal = ci.suggested
    const carbs = Math.max(0, Math.floor((kcal - (Number(n.manual.protein) || 0) * 4 - (Number(n.manual.fat) || 0) * 9) / 4))
    s.nutrition = { ...n, manual: { ...n.manual, kcal, carbs } }
  } else {
    // The maintenance that gives the suggested target at this pace: the capped step, not the raw
    // reading, so the target lands exactly where the card said it would.
    const tg = l.targets
    const paceDelta = targetFor(0, { ...tg, bmr: -Infinity }).delta
    const kcal = Math.round(ci.suggested - paceDelta)
    s.nutrition = { ...n, maintenance: { kcal, d: today } }
  }
  return s
}
