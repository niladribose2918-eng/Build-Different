import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { loadFoods, iconOf, foodLookup } from '../lib/foods.js'
import { searchFoods } from '../lib/food-search.js'
import {
  foodEntry, quickEntry, withEntry, withoutEntry, recentFoods, mealsOf, nutrientsFor, savedMealsOf, logSavedMeal, QUICK,
} from '../lib/food-log.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { mealLabel } from './NutritionSetup.jsx'
import Icon from './Icon.jsx'
import { Button, NumberField, SearchField, Segmented, SelectRow, TextField } from './ui.jsx'

// Adding food to a meal (Nutrition → +): search the built-in list, pick from what you eat often,
// log a saved meal, or quick-add calories and macros. Picking a food asks how much, in grams or in
// one of its household portions, with the numbers adding up live.

const update = fn => useStore.getState().update(fn)
const toast = m => useUI.getState().toast(m)
const PAGE = 40

export const FoodPic = ({ food }) => <span className="thumb thumb-x nt-pic" aria-hidden="true"><Icon name={iconOf(food)} /></span>

/** What a food reads as in a list: its default portion's calories, or per 100 g. */
function perLine(food, hideCalories) {
  const [label, g] = food.portions[0] || ['100 g', 100]
  const n = nutrientsFor(food, g)
  const what = food.portions[0] ? t('{0} ({1} g)', t(label), fmtNum(g)) : '100 g'
  return hideCalories ? `${what} · ${t('{0} g protein', fmtNum(n.p))}` : `${what} · ${fmtNum(n.k)} ${t('kcal')}`
}

function FoodRow({ food, hideCalories, onPick }) {
  return <div className="item tappable" data-food={food.key} {...tappable(() => onPick(food))}>
    <FoodPic food={food} />
    <div className="grow">
      <div className="tt nt-name">{food.name}</div>
      <div className="ss">{perLine(food, hideCalories)}</div>
    </div>
  </div>
}

// How much of one food: a portion and how many, or grams; the meal; the numbers for that amount.
function FoodAmount({ food, start, meals, meal: meal0, hideCalories, onSave, onBack, onDelete }) {
  const portions = food.portions.slice(0, 3)
  const [unit, setUnit] = useState(() => {
    if (start?.s) { const i = portions.findIndex(p => p[0] === start.s); if (i >= 0) return i }
    return start?.g ? 'g' : portions.length ? 0 : 'g'
  })
  const [count, setCount] = useState(start?.x ?? 1)
  const [grams, setGrams] = useState(start?.g ?? (portions[0]?.[1] || 100))
  const [meal, setMeal] = useState(meal0)
  const g = unit === 'g' ? grams || 0 : (portions[unit][1] * (count || 0))
  const n = nutrientsFor(food, g)
  const ok = g > 0
  const save = () => onSave(unit === 'g'
    ? foodEntry({ food, grams: g, meal })
    : foodEntry({ food, portion: portions[unit], count, meal }))

  return <div className="nt-amount" data-food-amount={food.key}>
    <div className="row" style={{ gap: 12, marginBottom: 10 }}>
      <span className="thumb thumb-x nt-pic-l" aria-hidden="true"><Icon name={iconOf(food)} /></span>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0 }}>{food.name}</h3>
        <div className="small dim">{food.dish ? t('Recipe estimate from USDA ingredients') : t('USDA food data')}</div>
      </div>
    </div>
    {food.dish && <div className="small muted nt-note">{t('Home cooking varies, oil above all, so this is an estimate.')}{food.note ? ' ' + food.note : ''}</div>}

    <Segmented value={unit} onChange={setUnit}
      options={[...portions.map((p, i) => ({ value: i, label: t(p[0]) })), { value: 'g', label: t('grams') }]} />
    <div className="nt-qty">
      {unit === 'g'
        ? <label className="measure-field"><span>{t('Amount')}</span><span className="measure-input"><NumberField value={grams} onChange={setGrams} aria-label={t('Amount')} /><i>g</i></span></label>
        : <label className="measure-field"><span>{t('How many')}</span><span className="measure-input"><NumberField value={count} onChange={setCount} aria-label={t('How many')} /><i>× {fmtNum(portions[unit][1])} g</i></span></label>}
    </div>

    <div className="nt-facts" data-food-facts>
      {!hideCalories && <div><b>{fmtNum(n.k)}</b><span>{t('kcal')}</span></div>}
      <div><b>{fmtNum(n.p)}</b><span>{t('protein')}</span></div>
      <div><b>{fmtNum(n.c)}</b><span>{t('carbs')}</span></div>
      <div><b>{fmtNum(n.fa)}</b><span>{t('fat')}</span></div>
      <div><b>{fmtNum(n.fb)}</b><span>{t('fibre')}</span></div>
    </div>

    <div className="sect-b" style={{ marginBottom: 12 }}>
      <SelectRow title={t('Meal')} value={meal} onChange={setMeal} options={meals.map((m, i) => ({ value: i, label: mealLabel(m) }))} />
    </div>
    <Button variant="primary" onClick={save} disabled={!ok}>{onDelete ? t('Save') : t('Add')}</Button>
    <div style={{ height: 8 }} />
    {onDelete && <><Button variant="ghost" style={{ color: 'var(--red)' }} icon="trash" onClick={onDelete}>{t('Remove')}</Button><div style={{ height: 8 }} /></>}
    <Button variant="ghost" className="dim" onClick={onBack}>{onDelete ? t('Cancel') : t('Back')}</Button>
  </div>
}

// Calories and macros typed in, with an optional name.
function QuickAdd({ start, meals, meal: meal0, onSave, onBack, onDelete }) {
  const [v, setV] = useState(() => ({ name: start?.n || '', kcal: start?.k ?? null, p: start?.p ?? null, c: start?.c ?? null, fa: start?.fa ?? null }))
  const [meal, setMeal] = useState(meal0)
  const field = (k, label, unit) => <label className="measure-field" key={k}><span>{label}</span>
    <span className="measure-input"><NumberField nullable value={v[k]} onChange={x => setV(o => ({ ...o, [k]: x }))} aria-label={label} /><i>{unit}</i></span></label>
  return <div className="nt-quick" data-quick-add>
    <TextField value={v.name} maxLength={60} placeholder={t('Name (optional)')} onChange={e => setV(o => ({ ...o, name: e.target.value }))} />
    <div className="measure-form" style={{ marginTop: 10 }}>
      {field('kcal', t('Calories'), t('kcal'))}
      {field('p', t('Protein'), 'g')}
      {field('c', t('Carbs'), 'g')}
      {field('fa', t('Fat'), 'g')}
    </div>
    <div className="sect-b" style={{ margin: '12px 0' }}>
      <SelectRow title={t('Meal')} value={meal} onChange={setMeal} options={meals.map((m, i) => ({ value: i, label: mealLabel(m) }))} />
    </div>
    <Button variant="primary" disabled={!(v.kcal > 0 || v.p > 0 || v.c > 0 || v.fa > 0)}
      onClick={() => {
        // calories left empty are worked out from the macros, 4/4/9
        const kcal = v.kcal > 0 ? v.kcal : (v.p || 0) * 4 + (v.c || 0) * 4 + (v.fa || 0) * 9
        onSave(quickEntry({ kcal, p: v.p, c: v.c, fa: v.fa, name: v.name, meal }))
      }}>{onDelete ? t('Save') : t('Add')}</Button>
    <div style={{ height: 8 }} />
    {onDelete && <><Button variant="ghost" style={{ color: 'var(--red)' }} icon="trash" onClick={onDelete}>{t('Remove')}</Button><div style={{ height: 8 }} /></>}
    {onBack && <Button variant="ghost" className="dim" onClick={onBack}>{t('Cancel')}</Button>}
  </div>
}

function useFoods() {
  const [foods, setFoods] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    loadFoods().then(f => { if (live) setFoods(f) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  return { foods, failed }
}

function AddFood({ d, meal: meal0, close, onPick, title }) {
  const S = useStore(s => s.S)
  const meals = mealsOf(S)
  const hide = !!S.nutrition?.hideCalories
  const { foods, failed } = useFoods()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('recent')
  const [picked, setPicked] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const recent = useMemo(() => recentFoods(S, { today: todayISO() }), [S.foodLog])
  const all = useMemo(() => (foods ? foods.list : []), [foods])
  const lookup = useMemo(() => foodLookup(foods), [foods])
  const results = useMemo(() => (foods && q.trim() ? searchFoods(all, q, { recent, limit: 200 }) : []), [foods, all, q, recent])
  const browse = useMemo(() => {
    if (!foods) return []
    const mine = [...recent.keys()].map(lookup).filter(Boolean)
    return mine.length ? mine : foods.list.filter(f => f.everyday || f.dish)
  }, [foods, recent, lookup])
  const saved = savedMealsOf(S)
  const where = title || t('Add to {0}', mealLabel(meals[meal0] || meals[0]))

  // Picking for a meal plan hands the entries back instead of logging them.
  const add = entry => {
    if (onPick) { onPick([entry]); close(); return }
    update(s => { s.foodLog = withEntry(s.foodLog, { ...entry, d }) })
    toast(t('Added to {0}', mealLabel(meals[entry.m] || meals[0])))
    close()
  }

  if (picked) return <FoodAmount food={picked} meals={meals} meal={meal0} hideCalories={hide} onSave={add} onBack={() => setPicked(null)} />

  const list = q.trim() ? results : browse
  return <div className="nt-add">
    <h3>{where}</h3>
    <SearchField value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE) }} onClear={() => setQ('')} placeholder={t('Search foods and dishes')} aria-label={t('Search foods and dishes')} />
    {!q.trim() && <Segmented className="nt-tabs" value={tab} onChange={setTab}
      options={[{ value: 'recent', label: recent.size ? t('Recent') : t('Common') }, { value: 'saved', label: t('Saved meals') }, { value: 'quick', label: t('Quick add') }]} />}

    {q.trim() || tab === 'recent' ? <>
      {failed ? <div className="empty small">{t('The food list could not load. Check your connection and try again, or use Quick add.')}</div>
        : !foods ? <div className="empty small">{t('Loading foods…')}</div>
        : list.length ? <div className="list">{list.slice(0, limit).map(f => <FoodRow key={f.key} food={f} hideCalories={hide} onPick={setPicked} />)}
          {list.length > limit && <Button variant="ghost" onClick={() => setLimit(l => l + PAGE)}>{t('Show more')}</Button>}</div>
        : <div className="empty small">{t('Nothing found. Try another word, or use Quick add.')}</div>}
    </> : tab === 'saved' ? (saved.length ? <div className="list">{saved.map(m => {
      const kcal = m.items.reduce((a, x) => a + (x.k || 0), 0)
      return <div className="item" key={m.id} data-saved-meal={m.id}>
        <span className="thumb thumb-x nt-pic" aria-hidden="true"><Icon name="utensils" /></span>
        <button className="grow item-open" onClick={() => {
          if (onPick) { onPick(m.items.map(it => ({ ...it, m: meal0 }))); close(); return }
          update(s => { s.foodLog = logSavedMeal(s.foodLog, m, d, meal0) })
          toast(t('Added to {0}', mealLabel(meals[meal0] || meals[0])))
          close()
        }}><span className="tt">{m.name}</span><span className="ss">{t('Items: {0}', m.items.length)}{hide ? '' : ` · ${fmtNum(kcal)} ${t('kcal')}`}</span></button>
        <button className="iconbtn" aria-label={t('Delete')} onClick={() => update(s => { s.savedMeals = withoutEntry(s.savedMeals, m.id) })}><Icon name="trash" /></button>
      </div>
    })}</div> : <div className="empty small">{t('No saved meals yet. Save one from a meal\'s menu on the Today screen.')}</div>)
    : <QuickAdd meals={meals} meal={meal0} onSave={add} />}
    <div style={{ height: 10 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Close')}</Button>
  </div>
}

/** Add food to a meal of day `d`; with `onPick(entries)`, pick for a meal plan instead of logging. */
export function addFoodSheet({ d = todayISO(), meal = 0, onPick = null, title = '' } = {}) {
  return useUI.getState().openSheet(close => <AddFood d={d} meal={meal} close={close} onPick={onPick} title={title} />)
}


// Changing or removing an entry already logged.
function EditEntry({ id, close }) {
  const S = useStore(s => s.S)
  const e = S.foodLog?.[id]
  const meals = mealsOf(S)
  const { foods, failed } = useFoods()
  if (!e || !e.d) return null
  const save = next => {
    update(s => { s.foodLog = withEntry(s.foodLog, { ...next, d: e.d }, id) })
    close()
  }
  const remove = () => { update(s => { s.foodLog = withoutEntry(s.foodLog, id) }); toast(t('Removed')); close() }
  if (e.f === QUICK) return <><h3>{e.n || t('Quick add')}</h3><QuickAdd start={e} meals={meals} meal={e.m || 0} onSave={save} onBack={close} onDelete={remove} /></>
  if (!foods && !failed) return <div className="empty small">{t('Loading foods…')}</div>
  const food = foodLookup(foods)(e.f)
  // A food no longer in the list keeps its numbers; it can still move meals or go.
  if (!food) return <>
    <h3>{t('Logged food')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('This food is no longer in the built-in list. Its logged numbers stay as they were.')}</div>
    <Button variant="ghost" style={{ color: 'var(--red)' }} icon="trash" onClick={remove}>{t('Remove')}</Button>
    <div style={{ height: 8 }} /><Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
  return <FoodAmount food={food} start={e} meals={meals} meal={e.m || 0} hideCalories={!!S.nutrition?.hideCalories} onSave={save} onBack={close} onDelete={remove} />
}

export function editEntrySheet(id) {
  return useUI.getState().openSheet(close => <EditEntry id={id} close={close} />)
}
