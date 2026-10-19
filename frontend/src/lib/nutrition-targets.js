// Daily calorie and macro targets from the body, everyday activity, goal and pace (Nutrition
// setup). A starting point, said so on screen: Mifflin-St Jeor is the most reliable of the common
// formulas and can still be off by 10% or more for one person.
//
// Stored as one settings object, S.nutrition (null until Nutrition is set up):
//
//   { sex: 'male' | 'female', birthYear, heightCm, activity: 'moderate',
//     goal: null | 'lose' | 'maintain' | 'gain' | 'recomp',   null follows the body-weight goal
//     pace: 0.5,              % of body weight a week, lose 0.25–1, gain 0.25–0.5
//     proteinPerKg: null,     null = 2.0 when losing or recomping, 1.8 otherwise
//     fatPct: 25,             % of calories, 20–35; carbs fill the rest
//     manual: null | { kcal, protein, carbs, fat },
//     hideCalories: false, meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] }
//
// Guardrails, not options: no target below the estimated resting burn, no pace past 1% of body
// weight a week, and no deficit at all under 18.
import { latestMeasurement } from './measurements.js'
import { weightForTargets } from './weight-trend.js'

export const KCAL_PER_KG = 7700
const LB_PER_KG = 2.2046226218

/** Everyday activity, daily life and workouts together; the factor multiplies resting burn. */
export const ACTIVITY = [
  { key: 'sedentary', factor: 1.2 },
  { key: 'light', factor: 1.375 },
  { key: 'moderate', factor: 1.55 },
  { key: 'active', factor: 1.725 },
  { key: 'athlete', factor: 1.9 },
]
export const GOALS = ['lose', 'maintain', 'gain', 'recomp']
export const PACES = { lose: [0.25, 0.5, 0.75, 1], gain: [0.25, 0.5] }
export const RECOMP_PACE = 0.25
export const PROTEIN_RANGE = [1.4, 2.4]
export const FAT_RANGE = [20, 35]
export const DEFAULT_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks']
export const MAX_MEALS = 6

export const defaultNutrition = () => ({
  sex: null, birthYear: null, heightCm: null, activity: 'moderate', goal: null, pace: 0.5,
  proteinPerKg: null, fatPct: 25, manual: null, hideCalories: false, meals: [...DEFAULT_MEALS],
})

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** The newest weigh-in, in kg whatever the profile's unit, or null. */
export function bodyKg(S) {
  const list = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  let best = null
  for (const b of list) if (b && num(b.w) > 0 && (!best || String(b.d) > String(best.d))) best = b
  if (!best) return null
  return S.unit === 'lb' ? Number(best.w) / LB_PER_KG : Number(best.w)
}

/** The body-weight goal in kg, or null. */
export const goalKg = S => (num(S?.targetW) > 0 ? (S.unit === 'lb' ? S.targetW / LB_PER_KG : Number(S.targetW)) : null)

/** Which way the body-weight goal points from today's weight: lose, gain, or maintain within half a kilo. */
export function goalDirection(S, kg = bodyKg(S)) {
  const target = goalKg(S)
  if (target == null || kg == null) return null
  if (Math.abs(target - kg) < 0.5) return 'maintain'
  return target < kg ? 'lose' : 'gain'
}

/** The newest body-fat reading as a fraction (0.18), when one is plausible. */
export function bodyFatOf(S) {
  const v = num(latestMeasurement(S || {}, 'bodyFat')?.value)
  return v != null && v >= 3 && v <= 60 ? v / 100 : null
}

export const ageOf = (birthYear, today = new Date()) => (num(birthYear) ? today.getFullYear() - Number(birthYear) : null)

/** Mifflin-St Jeor resting burn, kcal a day. */
export function restingBurn({ sex, kg, cm, age }) {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'female' ? -161 : 5)
}

export const activityFactor = key => (ACTIVITY.find(a => a.key === key) || ACTIVITY[2]).factor

/** The goal in force: the one picked, else the body-weight goal's direction, else maintain. */
export const goalOf = (S, kg = bodyKg(S)) => (GOALS.includes(S?.nutrition?.goal) ? S.nutrition.goal : goalDirection(S, kg) || 'maintain')

/** The protein default for a goal, g per kg. */
export const defaultProtein = goal => (goal === 'lose' || goal === 'recomp' ? 2.0 : 1.8)

/** What the setup still needs before it can work anything out. */
export function missingInputs(S) {
  const n = S?.nutrition || {}
  const out = []
  if (bodyKg(S) == null) out.push('weight')
  if (!(num(n.heightCm) >= 100 && num(n.heightCm) <= 250)) out.push('height')
  const age = ageOf(n.birthYear)
  if (!(age >= 13 && age <= 100)) out.push('birthYear')
  if (n.sex !== 'male' && n.sex !== 'female') out.push('sex')
  return out
}

/**
 * The day's targets and every step of the maths behind them.
 *   { ok: false, missing } until the setup has what it needs, else
 *   { ok: true, kg, age, bmr, factor, tdee, goal, pace, delta, weeklyKg, kcal, protein, carbs, fat,
 *     proteinPerKg, fatPct, lean, floored, minor, manual }
 * `delta` is kcal a day against maintenance (negative in a deficit). Manual targets replace the
 * numbers but keep the maths beside them when it can be worked out.
 */
export function computeTargets(S, { today = new Date() } = {}) {
  const n = { ...defaultNutrition(), ...(S?.nutrition || {}) }
  const manual = n.manual && num(n.manual.kcal) > 0 ? n.manual : null
  const missing = missingInputs(S)
  if (missing.length && !manual) return { ok: false, missing }

  // The trend weight once there is one (lib/weight-trend.js): a salty dinner's water on the
  // scale does not move tomorrow's calories.
  const w = weightForTargets(S)
  const kg = w?.kg ?? null
  const goal = goalOf(S, kg)
  const base = { ok: true, kg, weightSource: w?.source ?? null, goal, manual: !!manual, hideCalories: !!n.hideCalories }
  if (missing.length) return { ...base, ...manualNumbers(manual), missing }

  const age = ageOf(n.birthYear, today)
  const minor = age < 18
  const bmr = restingBurn({ sex: n.sex, kg, cm: Number(n.heightCm), age })
  const factor = activityFactor(n.activity)
  const tdee = bmr * factor
  const pace = goal === 'recomp' ? RECOMP_PACE
    : goal === 'lose' ? clamp(num(n.pace) ?? 0.5, PACES.lose[0], PACES.lose.at(-1))
    : goal === 'gain' ? clamp(num(n.pace) ?? 0.25, PACES.gain[0], PACES.gain.at(-1))
    : 0
  const sign = goal === 'gain' ? 1 : goal === 'maintain' ? 0 : -1
  let delta = minor && sign < 0 ? 0 : sign * pace / 100 * kg * KCAL_PER_KG / 7
  let kcal = tdee + delta
  const floored = kcal < bmr
  if (floored) { kcal = bmr; delta = bmr - tdee }
  kcal = Math.round(kcal / 10) * 10

  const proteinPerKg = clamp(num(n.proteinPerKg) ?? defaultProtein(goal), PROTEIN_RANGE[0], PROTEIN_RANGE[1])
  const fatPct = clamp(num(n.fatPct) ?? 25, FAT_RANGE[0], FAT_RANGE[1])
  // With body fat known, protein follows lean mass: someone at 35% fat gets less than their
  // weight alone says. Below 20% fat the plain body-weight number stands.
  const bf = bodyFatOf(S)
  const lean = bf != null && bf > 0.2
  const proteinBase = lean ? kg * (1 - bf) / 0.8 : kg
  const protein = Math.round(proteinPerKg * proteinBase)
  const fat = Math.round(kcal * fatPct / 100 / 9)
  // Carbs fill what is left, rounded down so the three never add up past the calories.
  const carbs = Math.max(0, Math.floor((kcal - protein * 4 - fat * 9) / 4))

  return {
    ...base, age, minor, bmr, factor, tdee, pace: minor && sign < 0 ? 0 : pace, delta,
    // what the target works out to on the scale, the resting-burn floor included
    weeklyKg: delta * 7 / KCAL_PER_KG,
    kcal, protein, carbs, fat, proteinPerKg, fatPct, lean, floored,
    ...(manual ? manualNumbers(manual) : {}),
  }
}

function manualNumbers(m) {
  const g = v => Math.max(0, Math.round(num(v) || 0))
  return { kcal: g(m.kcal), protein: g(m.protein), carbs: g(m.carbs), fat: g(m.fat) }
}

/** Grams of protein per kg shown in the profile's unit: per lb for lb profiles. */
export const proteinPerUnit = (perKg, unit) => (unit === 'lb' ? Math.round(perKg / LB_PER_KG * 100) / 100 : perKg)
