// What a change in body weight is made of (Insights → Body): fat mass and lean mass at each
// body-fat check-in, a plain reading of waist against weight, the change in every measurement
// since the first check-in, and waist-to-height once Nutrition knows the height. Read from the
// measurements and weigh-ins the app already keeps; nothing is stored.
//
// Consumer body-fat readings are noisy (often ±3–5 points), so masses need three check-ins
// before they show, and everything here is an estimate, said so on screen.
import { MEASUREMENT_FIELDS, measurementValue, enabledMeasurementFields } from './measurements.js'
import { weighIns } from './weight-trend.js'

const DAY = 86400000
export const MIN_BODY_FAT = 3
export const NEAR_DAYS = 3
// Below these a change in waist or weight is noise, not a direction.
export const WAIST_CM = 1
export const WEIGHT_PCT = 1
const noon = iso => Date.parse(iso + 'T12:00:00')
const r1 = v => Math.round(v * 10) / 10

/** The weigh-in nearest `iso`, within three days either side, or null. */
export function weightNear(list, iso) {
  const at = noon(iso)
  let best = null
  for (const p of list) {
    const gap = Math.abs(p.t - at)
    if (gap <= NEAR_DAYS * DAY && (!best || gap < best.gap)) best = { ...p, gap }
  }
  return best ? best.w : null
}

/** Each body-fat check-in with a weigh-in near it, as { d, bf, w, fat, lean } in the profile's unit. */
export function compositionSeries(S) {
  const list = weighIns(S)
  return (Array.isArray(S?.measurements) ? S.measurements : [])
    .map(e => ({ d: e?.d, bf: measurementValue(e, 'bodyFat') }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.d || '') && x.bf != null && x.bf < 70)
    .sort((a, b) => (a.d < b.d ? -1 : 1))
    .map(x => {
      const w = weightNear(list, x.d)
      if (w == null) return null
      const fat = w * x.bf / 100
      return { d: x.d, bf: x.bf, w, fat: r1(fat), lean: r1(w - fat) }
    })
    .filter(Boolean)
}

/**
 * Waist against weight from the first waist reading with a weigh-in near it to the last:
 *   'fatLoss'  both falling                 'recomp'   weight flat, waist falling
 *   'leanGain' weight rising, waist flat    'gaining'  both rising
 *   'steady'   neither moving               'scale'    weight falling, waist not (yet)
 *   'mixed'    anything else
 */
export function waistReading(S) {
  const list = weighIns(S)
  const points = (Array.isArray(S?.measurements) ? S.measurements : [])
    .map(e => ({ d: e?.d, waist: measurementValue(e, 'waist') }))
    .filter(x => x.waist != null && /^\d{4}-\d{2}-\d{2}$/.test(x.d || ''))
    .sort((a, b) => (a.d < b.d ? -1 : 1))
    .map(x => ({ ...x, w: weightNear(list, x.d) }))
    .filter(x => x.w != null)
  if (points.length < 2) return null
  const a = points[0], b = points.at(-1)
  if (a.d === b.d) return null
  const dWaist = b.waist - a.waist, dWeight = b.w - a.w
  const pct = dWeight / a.w * 100
  const waistDown = dWaist <= -WAIST_CM, waistUp = dWaist >= WAIST_CM
  const wDown = pct <= -WEIGHT_PCT, wUp = pct >= WEIGHT_PCT
  const kind = waistDown && wDown ? 'fatLoss'
    : waistDown && !wDown && !wUp ? 'recomp'
    : wUp && !waistDown && !waistUp ? 'leanGain'
    : wUp && waistUp ? 'gaining'
    : !waistDown && !waistUp && !wDown && !wUp ? 'steady'
    : wDown && !waistDown ? 'scale'
    : 'mixed'
  return { kind, from: a.d, to: b.d, waist: r1(dWaist), weight: r1(dWeight), pct: r1(pct) }
}

/** Every tracked measurement's change since its first reading: [{ key, label, from, to, diff }] in cm or %. */
export function measurementChanges(S) {
  const entries = (Array.isArray(S?.measurements) ? S.measurements : []).filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e?.d || ''))
    .sort((a, b) => (a.d < b.d ? -1 : 1))
  const fields = enabledMeasurementFields(S)
  for (const f of MEASUREMENT_FIELDS) if (!fields.some(x => x.key === f.key) && entries.some(e => measurementValue(e, f.key) != null)) fields.push(f)
  return fields.map(f => {
    const vals = entries.map(e => ({ d: e.d, v: measurementValue(e, f.key) })).filter(x => x.v != null)
    if (vals.length < 2) return null
    const a = vals[0], b = vals.at(-1)
    return { key: f.key, label: f.label, custom: !!f.custom, percent: f.key === 'bodyFat', from: a.v, to: b.v, since: a.d, diff: r1(b.v - a.v) }
  }).filter(Boolean)
}

// The usual guideline: keep your waist under half your height.
export const WHTR_LIMIT = 0.5
/** Waist ÷ height from the newest waist reading and the height Nutrition was given, or null. */
export function waistToHeight(S) {
  const cm = Number(S?.nutrition?.heightCm)
  if (!(cm >= 100 && cm <= 250)) return null
  const last = (Array.isArray(S?.measurements) ? S.measurements : [])
    .filter(e => measurementValue(e, 'waist') != null).sort((a, b) => (a.d < b.d ? -1 : 1)).at(-1)
  if (!last) return null
  const waist = measurementValue(last, 'waist')
  const ratio = Math.round(waist / cm * 100) / 100
  return { ratio, d: last.d, waist, heightCm: cm, under: ratio < WHTR_LIMIT }
}

/**
 * The Body composition card's whole picture:
 *   { masses: { ok, count, need, series, first, last, fat, lean } , reading, changes, whtr }
 * `fat` and `lean` are the change from the first check-in to the last, in the profile's unit.
 */
export function bodyComp(S) {
  const series = compositionSeries(S)
  const ok = series.length >= MIN_BODY_FAT
  const first = series[0], last = series.at(-1)
  return {
    masses: { ok, count: series.length, need: Math.max(0, MIN_BODY_FAT - series.length), series,
      first: ok ? first : null, last: ok ? last : null,
      fat: ok ? r1(last.fat - first.fat) : null, lean: ok ? r1(last.lean - first.lean) : null },
    reading: waistReading(S),
    changes: measurementChanges(S),
    whtr: waistToHeight(S),
  }
}
