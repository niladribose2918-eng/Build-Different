import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { computeTargets } from '../lib/nutrition-targets.js'
import { dayTotals } from '../lib/food-log.js'
import { checkinFor } from '../lib/adaptive-tdee.js'
import { nextPlannedMeal, logPlanned, itemsLine } from '../lib/meal-plan.js'
import { loadFoods, foodLookup } from '../lib/foods.js'
import { mealLabel } from './NutritionSetup.jsx'
import Icon from './Icon.jsx'
import MacroSummary from './MacroSummary.jsx'
import { addFoodSheet } from './AddFood.jsx'
import { nutritionSetupSheet } from './NutritionSetup.jsx'
import { Button } from './ui.jsx'

// "Today's nutrition" on Home: calories left, the macro bars and a way to log, next to the day's
// training. Until Nutrition is set up it is a one-line offer that "Not now" folds away for good
// (S.showNutritionCard, Settings → Look & Home → On Home brings it back).
export default function NutritionCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  if (!S.showNutritionCard) return null
  if (!S.nutrition) return <div className="card" data-nutrition-card="offer">
    <div className="row" style={{ gap: 10, marginBottom: 6 }}>
      <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="utensils" /></span>
      <div style={{ minWidth: 0 }}>
        <div className="ttl">{t('Track what you eat, too')}</div>
        <div className="muted small">{t('Calories and protein for your goal, with everyday foods and Indian dishes built in.')}</div>
      </div>
    </div>
    <div className="row" style={{ gap: 8, marginTop: 8 }}>
      <Button size="sm" variant="primary" icon="target" onClick={() => { nav('/nutrition'); nutritionSetupSheet({ first: true }) }}>{t('Set up')}</Button>
      <Button size="sm" variant="ghost" className="dim" onClick={() => {
        update(s => { s.showNutritionCard = false })
        useUI.getState().toast(t('Hidden. Settings → Look & Home brings it back.'))
      }}>{t('Not now')}</Button>
    </div>
  </div>
  const tg = computeTargets(S)
  const totals = dayTotals(S, todayISO())
  const ci = checkinFor(S)
  const next = nextPlannedMeal(S)
  // the food list loads only when a planned meal is logged from here, never just to show Home
  const logNext = async () => {
    const foods = await loadFoods().catch(() => null)
    if (!foods) { useUI.getState().toast(t('The food list could not load. Try again.')); return }
    const lookup = foodLookup(foods)
    update(s => { s.foodLog = logPlanned(s.foodLog, s, todayISO(), next.meal, lookup) })
    useUI.getState().toast(t('Logged as planned'))
  }
  return <div className="card" data-nutrition-card>
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t("Today's nutrition")}</h2>
      <button className="iconbtn" aria-label={t('Nutrition')} onClick={() => nav('/nutrition')}><Icon name="chevronRight" /></button>
    </div>
    {tg.ok ? <MacroSummary tg={tg} totals={totals} hideCalories={!!S.nutrition.hideCalories} />
      : <div className="muted small">{t('Your targets need a weigh-in. Log one and they appear here.')}</div>}
    {next && <div className="nt-next" data-next-planned={next.meal}>
      <div className="small"><span className="dim">{t('Next: {0}', mealLabel(next.name))}</span> · {itemsLine(next.items, t)}</div>
      <Button size="sm" variant="tinted" icon="check" onClick={logNext}>{t('Log as planned')}</Button>
    </div>}
    {ci.due && ci.learn.ok && <button className="nci-note" data-checkin-note onClick={() => nav('/nutrition', { state: { tab: 'week' } })}>
      <Icon name="chartLine" /><span>{t('Your weekly check-in is ready')}</span><Icon name="chevronRight" />
    </button>}
    <div className="row" style={{ gap: 8, marginTop: 10 }}>
      <Button size="sm" icon="plus" onClick={() => addFoodSheet({ d: todayISO(), meal: 0 })}>{t('Log food')}</Button>
      <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/nutrition')}>{t('Open')}</Button>
    </div>
  </div>
}
