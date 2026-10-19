import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { DAYN, DAYS, fmtDate, fmtNum, todayISO, weekStartOf, weekOrder, weekDayOffset, isoOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { computeTargets } from '../lib/nutrition-targets.js'
import { mealsOf, entriesOn, amountOf } from '../lib/food-log.js'
import { loadFoods, foodLookup } from '../lib/foods.js'
import {
  plansOf, defaultPlanId, planOn, mealsOfPlanDay, plannedTotals, itemNutrients, itemOf, withPlan, withoutPlan,
  withMealDay, withPlanMeal, planFromWeek, addDays,
} from '../lib/meal-plan.js'
import { starterPlan } from '../lib/meal-templates.js'
import { groceryList, amountText, ticksOf, withTick, listText } from '../lib/grocery.js'
import { addFoodSheet, FoodPic } from './AddFood.jsx'
import { mealLabel } from './NutritionSetup.jsx'
import Icon from './Icon.jsx'
import { Button, Check, Segmented, SelectRow, TextField } from './ui.jsx'

// Nutrition → Meal plan (lib/meal-plan.js): weekly plans that work like the workout plan, each
// day read against the same daily target, a month calendar of which plan applies when, and the
// grocery list for the next 7 days (lib/grocery.js). The food list loads with it: plans keep only
// references and amounts, so their numbers are worked out here.

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const openSheet = r => useUI.getState().openSheet(r)

// Written out as t() calls so the string check finds them.
export const STARTER = {
  veg: () => ({ name: t('Vegetarian Indian'), about: t('Poha, idli and parathas; dal, roti and sabzi; paneer and curd for protein.') }),
  nonveg: () => ({ name: t('Non-veg Indian'), about: t('Eggs, chicken, fish and mutton with roti, rice and dal.') }),
  global: () => ({ name: t('Global mixed'), about: t('Oats and eggs; chicken, fish or beef with rice, pasta or potato; yogurt and fruit.') }),
}
const SECTION = {
  produce: () => t('Fruit and vegetables'), dairy: () => t('Dairy and eggs'), meat: () => t('Meat and fish'),
  grains: () => t('Grains, flour and bread'), pulses: () => t('Dals and pulses'), nuts: () => t('Nuts and seeds'),
  oils: () => t('Oils and ghee'), other: () => t('Everything else'),
}

export function useFoodsLookup(S) {
  const [foods, setFoods] = useState(null)
  useEffect(() => { let live = true; loadFoods().then(f => { if (live) setFoods(f) }, () => {}); return () => { live = false } }, [])
  return { foods, lookup: useMemo(() => foodLookup(foods), [foods]) }
}

const dayName = key => (key === 'all' ? t('Every day') : t(DAYN[Number(key)]))
const dayKeys = (plan, ws) => (plan.mode === 'same' ? ['all'] : weekOrder(ws).map(String))

function Totals({ tot, tg, hide }) {
  if (!tg.ok) return null
  return <span className="small dim">{hide ? t('P {0} of {1} g', fmtNum(Math.round(tot.p)), fmtNum(tg.protein))
    : t('{0} kcal · P {1} g', fmtNum(tot.k), fmtNum(Math.round(tot.p)))}</span>
}

// ── one day of a plan, meal by meal ──
function DayEditor({ planId, dayKey, close }) {
  const S = useStore(s => s.S)
  const { lookup } = useFoodsLookup(S)
  const plan = plansOf(S).find(p => p.id === planId)
  if (!plan) return null
  const names = mealsOf(S)
  const meals = mealsOfPlanDay(S, plan, dayKey)
  const tg = computeTargets(S)
  const hide = !!S.nutrition?.hideCalories
  const tot = plannedTotals(meals, lookup)
  const save = next => update(s => { s.mealPlans = withPlan(s.mealPlans, next, planId) })
  const setMeal = (m, items) => save(withPlanMeal(plan, dayKey, m, items, names.length))
  const add = m => addFoodSheet({ meal: m, title: t('{0}: {1}', dayName(dayKey), mealLabel(names[m])),
    onPick: entries => setMeal(m, [...meals[m], ...entries.map(e => itemOf(e, lookup(e.f)?.name || e.n))]) })
  const others = dayKeys(plan, weekStartOf(S)).filter(k => k !== dayKey)
  return <div data-day-editor={dayKey}>
    <h3>{dayName(dayKey)} · {plan.name}</h3>
    <div className="row between" style={{ marginBottom: 8 }}>
      <Totals tot={tot} tg={tg} hide={hide} />
      {tg.ok && !hide && <span className="small dim">{t('target {0}', fmtNum(tg.kcal))}</span>}
    </div>
    {meals.map((items, m) => <div className="card nt-meal" key={m} data-plan-meal={m}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{mealLabel(names[m])}</h2>
        <button className="iconbtn" aria-label={t('Add food')} onClick={() => add(m)}><Icon name="plus" /></button>
      </div>
      {items.length ? <div className="nt-entries">{items.map((it, j) => {
        const f = lookup(it.f), n = itemNutrients(it, lookup)
        return <div className="nt-entry" key={j}>
          <FoodPic food={f} />
          <div className="grow"><div className="nt-name">{it.n || f?.name || t('Logged food')}</div><div className="small dim">{amountOf(it, t)}</div></div>
          <span className="small">{n ? (hide ? `${fmtNum(n.p)} g` : fmtNum(n.k)) : '–'}</span>
          <button className="iconbtn" aria-label={t('Remove')} onClick={() => setMeal(m, items.filter((_, k) => k !== j))}><Icon name="minus" /></button>
        </div>
      })}</div> : <div className="small dim" style={{ marginTop: 6 }}>{t('Nothing planned')}</div>}
    </div>)}
    {others.length > 0 && <div className="sect-b" style={{ marginBottom: 10 }}>
      <SelectRow title={t('Copy another day here')} sheetTitle={t('Copy from')} value={null}
        options={others.map(k => ({ value: k, label: dayName(k) }))}
        onChange={k => { save({ ...plan, days: { ...plan.days, [dayKey]: plan.days?.[k] || [] } }); toast(t('Copied from {0}', dayName(k))) }} />
    </div>}
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </div>
}
export const dayEditorSheet = (planId, dayKey) => openSheet(close => <DayEditor planId={planId} dayKey={dayKey} close={close} />)

// ── a new plan: blank, from last week, or a starter week ──
function NewPlan({ close, lookup }) {
  const S = useStore(s => s.S)
  const tg = computeTargets(S)
  const lastWeek = useMemo(() => Array.from({ length: 7 }, (_, i) => entriesOn(S, addDays(todayISO(), -1 - i)).length).some(Boolean), [S.foodLog])
  const make = (plan, msg) => {
    let id = null
    update(s => {
      const next = withPlan(s.mealPlans, plan)
      id = Object.keys(next).find(k => !(s.mealPlans || {})[k])
      s.mealPlans = next
      if (!defaultPlanId(s)) s.nutrition = { ...s.nutrition, plan: id }
    })
    toast(msg)
    close()
  }
  const opt = (key, icon, title, sub, onClick, disabled) => <button key={key} className="lrow tap" data-new-plan={key} onClick={onClick} disabled={disabled}>
    <span className="lrow-i" style={{ '--tint': 'var(--green)' }}><Icon name={icon} /></span>
    <span className="lrow-m"><span className="lrow-t">{title}</span><span className="lrow-s">{sub}</span></span>
    <Icon name="chevronRight" className="lrow-c" />
  </button>
  return <>
    <h3>{t('New meal plan')}</h3>
    <div className="sect-b">
      {Object.keys(STARTER).map(k => opt(k, 'utensils', STARTER[k]().name, STARTER[k]().about + (tg.ok ? ' ' + t('Scaled to {0} kcal a day.', fmtNum(tg.kcal)) : ''),
        () => make(starterPlan(k, tg.ok ? tg.kcal : 2200, lookup, STARTER[k]().name), t('Plan added: {0}', STARTER[k]().name)), !lookup('in:roti')))}
      {opt('week', 'history', t('From last week'), lastWeek ? t('What you actually ate each day of the last 7, as a plan to repeat.') : t('Log a few days first; this copies what you ate.'),
        () => make(planFromWeek(S, addDays(todayISO(), -1), k => lookup(k)?.name || '', t('Last week')), t('Plan added: {0}', t('Last week'))), !lastWeek)}
      {opt('blank', 'plus', t('Blank'), t('Seven empty days to fill in yourself.'), () => make({ name: t('My plan'), mode: 'week', days: {} }, t('Plan added: {0}', t('My plan'))))}
    </div>
    <div style={{ height: 10 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

function RenamePlan({ plan, close }) {
  const [name, setName] = useState(plan.name)
  return <>
    <h3>{t('Rename plan')}</h3>
    <TextField value={name} maxLength={40} onChange={e => setName(e.target.value)} aria-label={t('Name')} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={!name.trim()} onClick={() => { update(s => { s.mealPlans = withPlan(s.mealPlans, { ...plan, name }, plan.id) }); close() }}>{t('Save')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" style={{ color: 'var(--red)' }} icon="trash" onClick={() => {
      update(s => {
        s.mealPlans = withoutPlan(s.mealPlans, plan.id)
        if (s.nutrition?.plan === plan.id) s.nutrition = { ...s.nutrition, plan: plansOf(s)[0]?.id || null }
      })
      toast(t('Plan deleted')); close()
    }}>{t('Delete plan')}</Button>
    <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

// ── the month: which plan applies on each day, one-off changes, logged days ──
function Month({ close }) {
  const S = useStore(s => s.S)
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const ws = weekStartOf(S)
  const plans = plansOf(S)
  const def = defaultPlanId(S)
  const color = id => ['var(--blue)', 'var(--orange)', 'var(--purple)', 'var(--teal)', 'var(--pink)', 'var(--yellow)'][Math.max(0, plans.findIndex(p => p.id === id)) % 6]
  const offset = weekDayOffset(new Date(y, mo, 1).getDay(), ws)
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const pick = iso => openSheet(c => <>
    <h3>{fmtDate(iso, true)}</h3>
    <div className="sect-b">
      {[...plans.map(p => ({ value: p.id, label: p.name + (p.id === def ? ' · ' + t('default') : '') })), { value: 'none', label: t('No plan this day') }].map(o =>
        <button key={o.value} className="lrow tap" onClick={() => { update(s => { s.mealDays = withMealDay(s.mealDays, iso, o.value === def ? null : o.value) }); c() }}>
          <span className="lrow-m"><span className="lrow-t">{o.label}</span></span>
          {(planOn(S, iso)?.id ?? 'none') === o.value && <Icon name="check" className="lrow-k" />}
        </button>)}
    </div>
  </>)
  const cells = []
  for (let i = 0; i < offset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = isoOf(new Date(y, mo, d, 12))
    const p = planOn(S, iso)
    const logged = entriesOn(S, iso).length > 0
    cells.push(<button key={d} className={'cal-d' + (iso === todayISO() ? ' today' : '')} data-month-day={iso} onClick={() => pick(iso)}>
      <span>{d}</span>
      <span className="mp-chip" style={{ background: p ? color(p.id) : 'transparent', opacity: p?.oneOff ? 1 : 0.55 }} />
      <i className={logged ? 'done' : ''} />
    </button>)
  }
  return <>
    <div className="row between">
      <button className="iconbtn" aria-label={t('Previous month')} onClick={() => setCur(new Date(y, mo - 1, 1))}><Icon name="chevronLeft" /></button>
      <h3 style={{ margin: 0 }}>{cur.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
      <button className="iconbtn" aria-label={t('Next month')} onClick={() => setCur(new Date(y, mo + 1, 1))}><Icon name="chevronRight" /></button>
    </div>
    <div className="cal-grid">{weekOrder(ws).map(d => <div key={d} className="cal-h">{t(DAYS[d])}</div>)}{cells}</div>
    <div className="cal-legend">
      {plans.map(p => <span key={p.id}><i style={{ background: color(p.id) }} />{p.name}</span>)}
      <span><i style={{ background: 'var(--acc)' }} />{t('Logged')}</span>
    </div>
    <div className="small dim" style={{ textAlign: 'center', marginTop: 10 }}>{t('Tap a day to use another plan just for that date. A brighter bar is a one-off change.')}</div>
    <div style={{ height: 12 }} /><Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}

// ── the next 7 days as a shopping list ──
function Grocery({ close, lookup, foods }) {
  const S = useStore(s => s.S)
  const from = todayISO()
  const list = useMemo(() => groceryList(S, { from, food: lookup, recipes: foods?.recipes, ingredients: foods?.ingredients }), [S.mealPlans, S.mealDays, S.nutrition, lookup, foods])
  const ticks = ticksOf(S, from)
  const copy = async () => {
    const text = listText(list, { title: t('Groceries, {0}', fmtDate(from) + ' – ' + fmtDate(addDays(from, 6))), sectionName: s => SECTION[s](), tr: t, ticks })
    try { await navigator.clipboard.writeText(text); toast(t('List copied')) } catch { toast(t('Copying is blocked here. Long-press the list to select it.')) }
  }
  return <div data-grocery>
    <h3>{t('Grocery list')}</h3>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('The next 7 days of your plan, added up. Dishes are listed as what they are made of.')}</div>
    {list.length ? list.map(s => <div key={s.section} className="card" data-grocery-section={s.section}>
      <h2 style={{ marginBottom: 6 }}>{SECTION[s.section]()}</h2>
      {s.items.map(it => <div className="gr-row" key={it.key}>
        <Check checked={!!ticks[it.key]} label={it.name} onChange={on => update(st => { st.groceryTicks = withTick(st.groceryTicks, from, it.key, on) })} />
        <span className={'grow' + (ticks[it.key] ? ' gr-done' : '')}>{it.name}</span>
        <span className="small dim">{amountText(it, t)}</span>
      </div>)}
    </div>) : <div className="empty small">{t('Nothing planned for the next 7 days yet.')}</div>}
    <div className="small dim" style={{ margin: '0 2px 10px' }}>{t('Tea, coffee and spices are left off. Cooked staples are listed as the dry amount to buy.')}</div>
    {list.length > 0 && <><Button icon="copy" onClick={copy}>{t('Copy as text')}</Button><div style={{ height: 8 }} /></>}
    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </div>
}

export default function MealPlan() {
  const S = useStore(s => s.S)
  const { foods, lookup } = useFoodsLookup(S)
  const plans = plansOf(S)
  const def = defaultPlanId(S)
  const [sel, setSel] = useState(null)
  const plan = plans.find(p => p.id === sel) || plans.find(p => p.id === def) || plans[0]
  const tg = computeTargets(S)
  const hide = !!S.nutrition?.hideCalories
  const ws = weekStartOf(S)
  const newPlan = () => openSheet(close => <NewPlan close={close} lookup={lookup} />)

  if (!plans.length) return <div className="card" data-meal-plan="empty">
    <div className="row" style={{ gap: 10, marginBottom: 8 }}>
      <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="calendar" /></span>
      <div className="ttl">{t('Plan your week of meals')}</div>
    </div>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Decide once a week, then logging is one tap. Start from a ready-made week scaled to your target, from what you ate last week, or blank.')}</div>
    <Button variant="primary" icon="plus" onClick={newPlan} disabled={!foods}>{foods ? t('New meal plan') : t('Loading foods…')}</Button>
  </div>

  return <div data-meal-plan={plan.id}>
    <div className="card">
      <div className="row between" style={{ gap: 8 }}>
        <div className="sect-b" style={{ flex: 1, minWidth: 0 }}>
          <SelectRow title={t('Plan')} sheetTitle={t('Meal plans')} value={plan.id} onChange={setSel} options={plans.map(p => ({ value: p.id, label: p.name }))} />
        </div>
        <button className="iconbtn" aria-label={t('Rename plan')} onClick={() => openSheet(close => <RenamePlan plan={plan} close={close} />)}><Icon name="pencil" /></button>
        <button className="iconbtn" aria-label={t('New meal plan')} onClick={newPlan}><Icon name="plus" /></button>
      </div>
      <div className="mp-opts">
        {plan.id === def ? <span className="small" data-plan-default><Icon name="checkCircle" style={{ color: 'var(--green)' }} /> {t('Default plan')}</span>
          : <Button size="sm" variant="tinted" onClick={() => update(s => { s.nutrition = { ...s.nutrition, plan: plan.id } })}>{t('Use by default')}</Button>}
        <Segmented className="seg-inline" value={plan.mode} onChange={mode => update(s => { s.mealPlans = withPlan(s.mealPlans, { ...plan, mode }, plan.id) })}
          options={[{ value: 'week', label: t('Each weekday') }, { value: 'same', label: t('Same every day') }]} />
      </div>
    </div>

    <div className="list" data-plan-days>
      {dayKeys(plan, ws).map(k => {
        const meals = mealsOfPlanDay(S, plan, k)
        const tot = plannedTotals(meals, lookup)
        const line = meals.map(m => m.map(it => it.n).filter(Boolean).slice(0, 2).join(', ')).filter(Boolean).join(' · ')
        return <div className="item tappable" key={k} data-plan-day={k} onClick={() => dayEditorSheet(plan.id, k)}>
          <div className="mp-day">{k === 'all' ? '∗' : t(DAYS[Number(k)])}</div>
          <div className="grow">
            <div className="tt">{meals.some(m => m.length) ? <Totals tot={tot} tg={tg} hide={hide} /> : <span className="small dim">{t('Nothing planned')}</span>}</div>
            <div className="ss nt-name">{line}</div>
          </div>
          <Icon name="chevronRight" className="chev" />
        </div>
      })}
    </div>
    {tg.ok && !hide && <div className="small dim" style={{ margin: '6px 2px 12px' }}>{t('Every day is read against your target of {0} kcal and {1} g protein.', fmtNum(tg.kcal), fmtNum(tg.protein))}</div>}

    <div className="row" style={{ gap: 8 }}>
      <Button icon="list" onClick={() => openSheet(close => <Grocery close={close} lookup={lookup} foods={foods} />)} disabled={!foods}>{t('Grocery list')}</Button>
      <Button icon="calendar" onClick={() => openSheet(close => <Month close={close} />)}>{t('Month view')}</Button>
    </div>
  </div>
}
