// The weight trend (Insights → Body, the Nutrition targets): a smoothed weight that ignores the
// day-to-day water swing, the rate it is moving at, a plain verdict on that pace, and the date the
// goal comes at this pace. Worked out from S.bodyweight and S.targetW; nothing is stored.
//
// Trend: a moving average that knows how far apart the weigh-ins are, so weighing every day,
// twice a week or with gaps all read the same way. Each weigh-in pulls the trend towards it by
// 1 − e^(−days/τ); τ = 9.5 days is the classic 10%-a-day smoothing of a daily scale.
// Rate: the least-squares slope of the weigh-ins over the last three weeks, widened back to at
// least four weigh-ins over ten days. Nothing is projected from less than that: until then the
// result says how many more weigh-ins it needs.
//
// Weights stay in the profile's unit (kg or lb); the pace is a percentage, so its bands fit any
// body. Guidance for a cut that keeps muscle is 0.5–1% of body weight a week; for a gain that
// keeps fat down, 0.25–0.5%.
import { todayISO } from './format.js'

const DAY = 86400000
export const TAU_DAYS = 9.5
export const RATE_DAYS = 21
export const MIN_WEIGH_INS = 4
export const MIN_SPAN_DAYS = 10
// Under this share of body weight a week the weight is holding, whichever way it drifts.
export const FLAT_PCT = 0.1
export const BANDS = { lose: [0.5, 1], gain: [0.25, 0.5] }
const LB_PER_KG = 2.2046226218

const noon = iso => Date.parse(iso + 'T12:00:00')

/** The weigh-ins as [{ d, t, w }] by date, one per day (two on one day are averaged). */
export function weighIns(S) {
  const byDay = new Map()
  for (const b of Array.isArray(S?.bodyweight) ? S.bodyweight : []) {
    const w = Number(b?.w)
    if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.d || '') || !(w > 0)) continue
    const x = byDay.get(b.d) || { sum: 0, n: 0 }
    x.sum += w; x.n += 1
    byDay.set(b.d, x)
  }
  return [...byDay].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, x]) => ({ d, t: noon(d), w: x.sum / x.n }))
}

/** Each weigh-in with the trend as of that day. */
export function trendSeries(list, tau = TAU_DAYS) {
  let trend = null, prev = null
  return list.map(p => {
    trend = trend == null ? p.w : trend + (1 - Math.exp(-(p.t - prev) / DAY / tau)) * (p.w - trend)
    prev = p.t
    return { ...p, trend }
  })
}

/** Least-squares slope of w over t, per day. */
function slopePerDay(points) {
  const n = points.length
  const mx = points.reduce((a, p) => a + p.t, 0) / n, my = points.reduce((a, p) => a + p.w, 0) / n
  let num = 0, den = 0
  for (const p of points) { num += (p.t - mx) * (p.w - my); den += (p.t - mx) ** 2 }
  return den ? num / den * DAY : 0
}

// The weigh-ins the rate is read from: the last three weeks, widened back until there are at
// least four of them over at least ten days.
function rateWindow(list) {
  const last = list.at(-1)
  let i = list.findIndex(p => p.t >= last.t - RATE_DAYS * DAY)
  const span = j => (last.t - list[j].t) / DAY
  while (i > 0 && (list.length - i < MIN_WEIGH_INS || span(i) < MIN_SPAN_DAYS)) i--
  return list.slice(i)
}

/**
 * The trend and everything read from it:
 *   { ok: false, count, needWeighIns, needDays }   too little to go on yet
 *   { ok: true, latest, trend, series, perWeek, pctPerWeek, windowDays, direction, verdict,
 *     stale, daysSince, goal }
 * perWeek is in the profile's unit, signed (negative = losing); pctPerWeek is of the trend weight.
 * verdict: 'holding' | 'gentle' | 'steady' | 'fast' | 'away' (moving away from the goal).
 * goal: null without a body-weight goal, else { target, start, remaining, done, progress,
 *       reached, away, weeks, date } (weeks and date null when the pace will not get there).
 */
export function weightTrend(S, { today = todayISO() } = {}) {
  const list = weighIns(S)
  const series = trendSeries(list)
  const count = list.length
  const spanDays = count ? Math.round((list.at(-1).t - list[0].t) / DAY) : 0
  if (count < MIN_WEIGH_INS || spanDays < MIN_SPAN_DAYS) {
    return { ok: false, count, series, trend: series.at(-1)?.trend ?? null,
      needWeighIns: Math.max(0, MIN_WEIGH_INS - count), needDays: Math.max(0, MIN_SPAN_DAYS - spanDays) }
  }
  const latest = list.at(-1)
  const trend = series.at(-1).trend
  const win = rateWindow(list)
  const perWeek = slopePerDay(win) * 7
  const pctPerWeek = perWeek / trend * 100
  const daysSince = Math.max(0, Math.round((noon(today) - latest.t) / DAY))
  // A rate read off weigh-ins weeks old says nothing about now.
  const stale = daysSince > 14
  const direction = Math.abs(pctPerWeek) < FLAT_PCT ? 'flat' : perWeek < 0 ? 'down' : 'up'

  const goal = goalOf(S, list, trend, perWeek, latest, stale)
  let verdict
  if (direction === 'flat') verdict = 'holding'
  else if (goal?.away) verdict = 'away'
  else {
    const [lo, hi] = BANDS[direction === 'down' ? 'lose' : 'gain']
    const pct = Math.abs(pctPerWeek)
    verdict = pct > hi ? 'fast' : pct >= lo ? 'steady' : 'gentle'
  }
  return { ok: true, count, latest, trend, series, perWeek, pctPerWeek, windowDays: Math.round((latest.t - win[0].t) / DAY),
    direction, verdict, stale, daysSince, goal }
}

function goalOf(S, list, trend, perWeek, latest, stale) {
  const target = Number(S?.targetW)
  if (!(target > 0)) return null
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  // Within half a kilo (a pound) is there: the trend never lands exactly.
  const close = unit === 'lb' ? 1 : 0.5
  const start = list[0].w
  const remaining = target - trend
  const reached = Math.abs(remaining) <= close
  const toGo = Math.abs(target - start)
  const done = Math.sign(target - start) * (trend - start)
  const progress = toGo > 0 ? Math.min(1, Math.max(0, done / toGo)) : reached ? 1 : 0
  const towards = Math.sign(perWeek) === Math.sign(remaining)
  const away = !reached && !towards && Math.abs(perWeek / trend * 100) >= FLAT_PCT
  let weeks = null, date = null
  if (!reached && towards && !stale && Math.abs(perWeek) > 0) {
    const w = remaining / perWeek
    // Past two years the "date" is a guess about a different body; it says so instead.
    if (w <= 104) {
      weeks = w
      date = new Date(latest.t + w * 7 * DAY).toISOString().slice(0, 10)
    }
  }
  return { target, start, remaining, done, toGo, progress, reached, away, weeks, date }
}

/** The weight the Nutrition targets use, in kg: the trend once there is one, else the newest weigh-in. */
export function weightForTargets(S) {
  const tr = weightTrend(S)
  const list = weighIns(S)
  if (!list.length) return null
  const v = tr.ok ? tr.trend : list.at(-1).w
  return { kg: S.unit === 'lb' ? v / LB_PER_KG : v, source: tr.ok ? 'trend' : 'latest' }
}
