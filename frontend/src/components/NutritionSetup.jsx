import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, fmtPlate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  ACTIVITY, PACES, PROTEIN_RANGE, FAT_RANGE, MAX_MEALS, computeTargets, defaultNutrition, goalDirection, goalOf,
  defaultProtein, proteinPerUnit,
} from '../lib/nutrition-targets.js'
import { weightForTargets } from '../lib/weight-trend.js'
import { bwSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import { Button, NumberField, Section, Segmented, SelectRow, Stepper, Switch, TextField } from './ui.jsx'

// Nutrition setup (first visit to Nutrition, then its gear): the body, everyday activity, goal and
// pace that the targets are worked out from (lib/nutrition-targets.js), with the maths on show.
// Height and birth year are asked here and used for nothing else.

const LB_PER_KG = 2.2046226218

// Written out as t() calls so the string check finds every one of them.
export const ACTIVITY_COPY = {
  sedentary: () => ({ name: t('Mostly sitting'), about: t('Desk job, little walking, no regular workouts.') }),
  light: () => ({ name: t('Lightly active'), about: t('Desk job with some walking, or 1–3 workouts a week.') }),
  moderate: () => ({ name: t('Moderately active'), about: t('On your feet part of the day, or 3–5 workouts a week.') }),
  active: () => ({ name: t('Very active'), about: t('Physical job, or hard training 6–7 days a week.') }),
  athlete: () => ({ name: t('Athlete'), about: t('Physical job plus hard training, or training twice a day.') }),
}
export const GOAL_COPY = {
  lose: () => t('Lose weight'), maintain: () => t('Maintain'), gain: () => t('Gain weight'), recomp: () => t('Recomp'),
}
export const MEAL_COPY = { Breakfast: () => t('Breakfast'), Lunch: () => t('Lunch'), Dinner: () => t('Dinner'), Snacks: () => t('Snacks') }
/** A meal's name as shown: the default names translated, a renamed one as typed. */
export const mealLabel = name => (MEAL_COPY[name] ? MEAL_COPY[name]() : name)

const kcalOf = n => fmtNum(Math.round(n))

/** The steps from resting burn to the daily target, one line each (Nutrition → How we got here). */
export function TargetMaths({ tg, unit }) {
  if (!tg?.ok || tg.bmr == null) return null
  const kgShown = unit === 'lb' ? fmtNum(Math.abs(tg.weeklyKg) * LB_PER_KG) + ' lb' : fmtNum(Math.abs(tg.weeklyKg)) + ' kg'
  return <div className="nt-maths" data-target-maths>
    <div className="nt-mrow"><span>{t('Resting burn (Mifflin-St Jeor)')}</span><b>{kcalOf(tg.bmr)}</b></div>
    <div className="nt-mrow"><span>{t('× everyday activity: {0}', fmtPlate(tg.factor))}</span><b>{kcalOf(tg.tdee)}</b></div>
    {Math.round(tg.delta) !== 0 && <div className="nt-mrow"><span>{tg.delta < 0 ? t('Deficit, about {0} a week', kgShown) : t('Surplus, about {0} a week', kgShown)}</span><b>{tg.delta > 0 ? '+' : '−'}{kcalOf(Math.abs(tg.delta))}</b></div>}
    <div className="nt-mrow nt-mtot"><span>{t('Daily target')}</span><b>{fmtNum(tg.kcal)} {t('kcal')}</b></div>
    {tg.floored && <div className="small dim" style={{ marginTop: 6 }}>{t('Held at your resting burn: a target below it is not set here, whatever the pace.')}</div>}
    {tg.minor && <div className="small dim" style={{ marginTop: 6 }}>{t('Under 18: no deficit is set. Talk to a doctor or dietitian before trying to lose weight.')}</div>}
    <div className="small dim" style={{ marginTop: 6 }}>{t('An estimate to start from: the formula can be off by 10% or more for one person.')}</div>
  </div>
}

function NutritionSetup({ close, first }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [n, setN] = useState(() => ({ ...defaultNutrition(), ...(S.nutrition || {}) }))
  const set = patch => setN(v => ({ ...v, ...patch }))
  const preview = { ...S, nutrition: n }
  const tg = computeTargets(preview)
  const weight = weightForTargets(S)
  const kg = weight?.kg ?? null
  const goal = goalOf(preview, kg)
  const fromWeightGoal = !n.goal && goalDirection(S, kg)
  const lb = S.unit === 'lb'
  const heightShown = n.heightCm == null ? null : lb ? Math.round(n.heightCm / 2.54) : Math.round(n.heightCm)
  const paces = goal === 'lose' ? PACES.lose : goal === 'gain' ? PACES.gain : null
  const pace = paces ? (paces.includes(n.pace) ? n.pace : goal === 'gain' ? 0.25 : 0.5) : null
  const protein = n.proteinPerKg ?? defaultProtein(goal)
  const meals = n.meals?.length ? n.meals : defaultNutrition().meals

  const save = () => {
    update(s => {
      s.nutrition = { ...n, pace: pace ?? n.pace, meals: meals.map(m => String(m || '').trim()).filter(Boolean).slice(0, MAX_MEALS) }
      if (!s.nutrition.meals.length) s.nutrition.meals = defaultNutrition().meals
    })
    close()
  }

  return <div className="nt-setup">
    <h3>{first ? t('Set up Nutrition') : t('Nutrition settings')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Your daily calories and macros, worked out from your body, activity and goal. Used only for Nutrition.')}</div>

    <Section title={t('You')}>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Body weight')}</span>
          <span className="lrow-s">{kg == null ? t('Log a weigh-in first; the targets follow your weight as it changes.')
            : weight.source === 'trend' ? t('Trend weight, smoothed from your weigh-ins') : t('From your latest weigh-in, until there are enough for a trend')}</span></span>
        {kg == null
          ? <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          : <span className="lrow-v">{fmtNum(lb ? kg * LB_PER_KG : kg)} {S.unit}</span>}
      </div>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Height')}</span></span>
        <span className="measure-input nt-num"><NumberField nullable decimal={false} value={heightShown} aria-label={t('Height')}
          onChange={v => set({ heightCm: v == null ? null : lb ? Math.round(v * 2.54) : v })} /><i>{lb ? 'in' : 'cm'}</i></span>
      </div>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Birth year')}</span></span>
        <span className="measure-input nt-num"><NumberField nullable decimal={false} value={n.birthYear} aria-label={t('Birth year')} onChange={v => set({ birthYear: v })} /></span>
      </div>
      <div className="lrow nt-stack">
        <span className="lrow-m"><span className="lrow-t">{t('Sex for the formula')}</span>
          <span className="lrow-s">{t('The resting-burn formula differs by sex. Separate from the body diagram setting.')}</span></span>
        <Segmented className="seg-inline" value={n.sex} onChange={v => set({ sex: v })}
          options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
      </div>
    </Section>

    <Section title={t('Everyday activity')} footer={t('Count daily life and workouts together: lifting four times a week with a desk job is Moderately active.')}>
      <SelectRow title={t('Activity')} sheetTitle={t('Everyday activity')} value={n.activity} onChange={v => set({ activity: v })}
        options={ACTIVITY.map(a => ({ value: a.key, label: ACTIVITY_COPY[a.key]().name, subtitle: ACTIVITY_COPY[a.key]().about }))} />
    </Section>

    <Section title={t('Goal')} footer={fromWeightGoal ? t('Following your body-weight goal: {0}.', GOAL_COPY[fromWeightGoal]()) : null}>
      <div className="lrow nt-stack">
        <Segmented value={n.goal || 'auto'} onChange={v => set({ goal: v === 'auto' ? null : v })}
          options={[
            ...(goalDirection(S, kg) ? [{ value: 'auto', label: t('Auto') }] : []),
            { value: 'lose', label: t('Lose') }, { value: 'maintain', label: t('Maintain') }, { value: 'gain', label: t('Gain') }, { value: 'recomp', label: t('Recomp') },
          ]} />
      </div>
      {paces && <div className="lrow nt-stack">
        <span className="lrow-m"><span className="lrow-t">{t('Pace, % of body weight a week')}</span></span>
        <Segmented value={pace} onChange={v => set({ pace: v })} options={paces.map(p => ({ value: p, label: fmtPlate(p) + '%' }))} />
      </div>}
      {goal === 'recomp' && <div className="lrow"><span className="lrow-m"><span className="lrow-s">{t('Recomp: a small deficit (0.25% a week) with high protein, to lose fat while you build muscle.')}</span></span></div>}
    </Section>

    <Section title={t('Macros')} footer={t('Carbs fill the calories left after protein and fat.')}>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Protein')}</span>
          <span className="lrow-s">{lb ? t('g per kg · {0} g per lb', fmtPlate(proteinPerUnit(protein, 'lb'))) : t('g per kg of body weight')}</span></span>
        <Stepper value={protein} step={0.1} min={PROTEIN_RANGE[0]} max={PROTEIN_RANGE[1]} onChange={v => set({ proteinPerKg: v })} ariaLabel="protein" />
      </div>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Fat')}</span><span className="lrow-s">{t('% of calories')}</span></span>
        <Stepper value={n.fatPct ?? 25} step={5} min={FAT_RANGE[0]} max={FAT_RANGE[1]} decimal={false} onChange={v => set({ fatPct: v })} ariaLabel="fat" />
      </div>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Set my own targets')}</span><span className="lrow-s">{t('For when you already know your numbers.')}</span></span>
        <Switch checked={!!n.manual} onChange={v => set({ manual: v ? { kcal: tg.kcal || 2000, protein: tg.protein || 120, carbs: tg.carbs || 220, fat: tg.fat || 65 } : null })} />
      </div>
      {n.manual && <div className="nt-manual">
        {[['kcal', t('Calories'), t('kcal')], ['protein', t('Protein'), 'g'], ['carbs', t('Carbs'), 'g'], ['fat', t('Fat'), 'g']].map(([k, label, unit]) =>
          <label key={k} className="measure-field"><span>{label}</span>
            <span className="measure-input"><NumberField decimal={false} value={n.manual[k]} onChange={v => set({ manual: { ...n.manual, [k]: v } })} /><i>{unit}</i></span>
          </label>)}
      </div>}
    </Section>

    <Section title={t('Your targets')}>
      {tg.ok ? <div className="nt-preview">
        <div className="nt-pbig">{n.hideCalories ? <>{fmtNum(tg.protein)} <small>g {t('protein')}</small></> : <>{fmtNum(tg.kcal)} <small>{t('kcal a day')}</small></>}</div>
        <div className="small muted">{t('Protein {0} g · carbs {1} g · fat {2} g', fmtNum(tg.protein), fmtNum(tg.carbs), fmtNum(tg.fat))}</div>
        {!tg.manual && <TargetMaths tg={tg} unit={S.unit} />}
      </div> : <div className="lrow"><span className="lrow-m"><span className="lrow-s">{t('Fill in weight, height, birth year and sex to see your targets, or set your own.')}</span></span></div>}
    </Section>

    <Section title={t('Meals')} footer={t('Rename them to fit your day, up to six.')}>
      {meals.map((m, i) => <div className="lrow" key={i}>
        <TextField value={MEAL_COPY[m] ? MEAL_COPY[m]() : m} maxLength={30} aria-label={t('Meal name')} onChange={e => set({ meals: meals.map((x, j) => (j === i ? e.target.value : x)) })} />
        {meals.length > 1 && <button className="iconbtn" aria-label={t('Remove')} onClick={() => set({ meals: meals.filter((_, j) => j !== i) })}><Icon name="minus" /></button>}
      </div>)}
      {meals.length < MAX_MEALS && <Row2 onClick={() => set({ meals: [...meals, t('Meal {0}', meals.length + 1)] })} />}
    </Section>

    <Section title={t('Display')}>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Hide calories')}</span><span className="lrow-s">{t('Track protein and meals without calorie numbers.')}</span></span>
        <Switch checked={!!n.hideCalories} onChange={v => set({ hideCalories: v })} />
      </div>
    </Section>

    <div className="small dim" style={{ margin: '4px 2px 14px' }}>{t('Pregnant, breastfeeding or managing a medical condition? Ask a doctor or dietitian for your targets and set them as your own.')}</div>
    <Button variant="primary" onClick={save} disabled={!tg.ok}>{first ? t('Start tracking') : t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </div>
}

const Row2 = ({ onClick }) => <button className="lrow tap" onClick={onClick}>
  <span className="lrow-i" style={{ '--tint': 'var(--green)' }}><Icon name="plus" /></span>
  <span className="lrow-m"><span className="lrow-t">{t('Add a meal')}</span></span>
</button>

export function nutritionSetupSheet({ first = false } = {}) {
  return useUI.getState().openSheet(close => <NutritionSetup close={close} first={first} />)
}
