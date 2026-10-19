import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { computeTargets } from '../lib/nutrition-targets.js'
import { byMeal, dayTotals, amountOf, copyMeal, dayDone, withDayDone, withSavedMeal, QUICK } from '../lib/food-log.js'
import { loadFoods } from '../lib/foods.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import Icon from '../components/Icon.jsx'
import MacroSummary from '../components/MacroSummary.jsx'
import { nutritionSetupSheet, mealLabel, TargetMaths } from '../components/NutritionSetup.jsx'
import { addFoodSheet, editEntrySheet, FoodPic } from '../components/AddFood.jsx'
import { Button, Segmented, Switch, TextField } from '../components/ui.jsx'
import NutritionWeek from '../components/NutritionWeek.jsx'

// Nutrition (Home → Today's nutrition): the day's food by meal against the day's targets. A day
// can be stepped back through; tomorrow is the meal plan's job, not the log's. Nothing here is
// worked out anywhere but on the device (lib/food-log.js, lib/nutrition-targets.js).

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

function mathsSheet() {
  useUI.getState().openSheet(close => <Maths close={close} />)
}
function Maths({ close }) {
  const S = useStore(s => s.S)
  const tg = computeTargets(S)
  return <>
    <h3>{t('How we got here')}</h3>
    {tg.manual ? <div className="muted small">{t('These are the targets you set yourself.')}</div> : <TargetMaths tg={tg} unit={S.unit} />}
    <div style={{ height: 14 }} />
    <Button onClick={() => { close(); nutritionSetupSheet() }}>{t('Change targets')}</Button>
    <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Close')}</Button>
  </>
}

function saveMealSheet(entries, name) {
  useUI.getState().openSheet(close => <SaveMeal entries={entries} start={name} close={close} />)
}
function SaveMeal({ entries, start, close }) {
  const [name, setName] = useState(start)
  return <>
    <h3>{t('Save as a meal')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Log these foods again in one tap, from Saved meals.')}</div>
    <TextField value={name} maxLength={60} onChange={e => setName(e.target.value)} aria-label={t('Name')} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={!name.trim()} onClick={() => { update(s => { s.savedMeals = withSavedMeal(s.savedMeals, name, entries) }); toast(t('Meal saved')); close() }}>{t('Save')}</Button>
    <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

function Meal({ m, d, S, foods, hide, yesterdayMeal }) {
  return <div className="card nt-meal" data-meal={m.meal}>
    <div className="row between">
      <h2 style={{ margin: 0 }}>{mealLabel(m.name)}</h2>
      <div className="row" style={{ gap: 6 }}>
        {m.entries.length > 0 && <span className="small dim">{hide ? `${fmtNum(m.totals.p)} g ${t('protein')}` : `${fmtNum(m.totals.k)} ${t('kcal')}`}</span>}
        {m.entries.length > 0 && <button className="iconbtn" aria-label={t('Save as a meal')} onClick={() => saveMealSheet(m.entries, mealLabel(m.name))}><Icon name="star" /></button>}
        <button className="iconbtn" aria-label={t('Add food')} onClick={() => addFoodSheet({ d, meal: m.meal })}><Icon name="plus" /></button>
      </div>
    </div>
    {m.entries.length ? <div className="nt-entries">{m.entries.map(e => {
      const food = foods?.byKey.get(e.f)
      const name = e.f === QUICK ? (e.n || t('Quick add')) : food?.name || t('Logged food')
      return <div className="nt-entry tappable" key={e.id} data-entry={e.id} {...tappable(() => editEntrySheet(e.id))}>
        <FoodPic food={food} />
        <div className="grow"><div className="nt-name">{name}</div><div className="small dim">{amountOf(e, t) || t('Quick add')}</div></div>
        <span className="small">{hide ? `${fmtNum(e.p)} g` : fmtNum(e.k)}</span>
      </div>
    })}</div> : yesterdayMeal ? <Button size="sm" variant="ghost" icon="copy" className="nt-copy"
      onClick={() => { update(s => { s.foodLog = copyMeal(s.foodLog, S, shift(d, -1), m.meal, d) }); toast(t('Copied from the day before')) }}>
      {t('Same as the day before')}
    </Button> : <div className="small dim" style={{ marginTop: 6 }}>{t('Nothing logged')}</div>}
  </div>
}

export default function Nutrition() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  const [d, setD] = useState(today)
  // The Home card's check-in note opens straight on Week.
  const loc = useLocation()
  const [tab, setTab] = useState(() => (loc?.state?.tab === 'week' ? 'week' : 'today'))
  const [foods, setFoods] = useState(null)
  useEffect(() => { let live = true; loadFoods().then(f => { if (live) setFoods(f) }, () => {}); return () => { live = false } }, [])

  const header = <div className="hdr">
    <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('Nutrition')}</h1><div className="sub">{S.nutrition && tab === 'week' ? t('Your week and check-in') : d === today ? t('Today') : fmtDate(d, true)}</div></div>
    {S.nutrition && <button className="iconbtn" onClick={() => nutritionSetupSheet()} aria-label={t('Nutrition settings')}><Icon name="gear" /></button>}
  </div>

  if (!S.nutrition) return <div className="narrow">
    {header}
    <div className="card nt-intro" data-nutrition-intro>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="utensils" /></span>
        <div className="big" style={{ fontSize: 22 }}>{t('Eat for your training')}</div>
      </div>
      <div className="muted small" style={{ marginBottom: 12 }}>{t('Daily calories and protein worked out from your body and goal, and a food log with everyday foods and Indian dishes built in. Everything stays on your device and syncs like your workouts.')}</div>
      <Button variant="primary" icon="target" onClick={() => nutritionSetupSheet({ first: true })}>{t('Set my targets')}</Button>
    </div>
  </div>

  const tg = computeTargets(S)
  const hide = !!S.nutrition.hideCalories
  const meals = byMeal(S, d)
  const before = byMeal(S, shift(d, -1))
  const totals = dayTotals(S, d)
  const done = dayDone(S, d)

  return <div className="narrow">
    {header}
    <Segmented className="nt-tabs" value={tab} onChange={setTab} options={[{ value: 'today', label: t('Today') }, { value: 'week', label: t('Week') }]} />
    {tab === 'week' ? <NutritionWeek /> : <>
    <div className="nt-daynav">
      <button className="iconbtn" aria-label={t('Previous day')} onClick={() => setD(shift(d, -1))}><Icon name="chevronLeft" /></button>
      <span className="small">{fmtDate(d, true)}</span>
      <button className="iconbtn" aria-label={t('Next day')} disabled={d >= today} onClick={() => setD(shift(d, 1))}><Icon name="chevronRight" /></button>
    </div>

    <div className="card" data-nutrition-day>
      {tg.ok ? <MacroSummary tg={tg} totals={totals} hideCalories={hide} fibre />
        : <div className="muted small">{t('Your targets need a weigh-in. Log one and they appear here.')}</div>}
      <div className="row between" style={{ marginTop: 10 }}>
        <span className="small dim">{tg.manual ? t('Your own targets') : t('Targets are estimates')}</span>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={mathsSheet}>{t('How we got here')}</Button>
      </div>
    </div>

    {meals.map(m => <Meal key={m.meal} m={m} d={d} S={S} foods={foods} hide={hide} yesterdayMeal={before[m.meal]?.entries.length > 0} />)}

    <div className="card">
      <div className="lrow" style={{ padding: 0 }}>
        <span className="lrow-m"><span className="lrow-t">{t('Day complete')}</span>
          <span className="lrow-s">{t('Everything eaten is logged. Only complete days count when your targets are checked against your weight.')}</span></span>
        <Switch checked={done} onChange={v => update(s => { s.foodDays = withDayDone(s.foodDays, d, v) })} />
      </div>
    </div>
    </>}
    <div className="small dim nt-credit">{t('Food values: USDA National Nutrient Database (SR28). Indian dishes are recipe estimates built from it.')}</div>
  </div>
}
