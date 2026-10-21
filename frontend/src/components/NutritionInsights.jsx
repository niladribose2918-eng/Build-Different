import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { nutritionStats, PROTEIN_HIT } from '../lib/insights.js'
import { DayBars } from './NutritionWeek.jsx'

// Insights → Nutrition: the period's food against its targets (lib/insights.js nutritionStats),
// beside the training numbers above it. Shown once Nutrition is set up and something was logged
// in the period; with Hide calories on, it reads in protein.
export default function NutritionInsights({ report }) {
  const S = useStore(s => s.S)
  const stats = useMemo(() => nutritionStats(S, report.from, report.to), [S.foodLog, S.foodDays, S.nutrition, S.bodyweight, report.from, report.to])
  if (!stats || !stats.logged) return null
  const hide = !!S.nutrition?.hideCalories
  return <div className="card" data-nutrition-insights>
    <h2 style={{ marginBottom: 8 }}>{t('Nutrition')}</h2>
    <div className={'tiles' + (hide ? '' : ' tiles-3')}>
      {!hide && <div className="tile"><div className="l">{t('Avg calories')}</div><div className="v" style={{ fontSize: 22 }}>{stats.avg != null ? fmtNum(stats.avg) : '–'}</div><div className="small dim">{t('target {0}', fmtNum(stats.target))}</div></div>}
      <div className="tile"><div className="l">{t('Protein days')}</div><div className="v" style={{ fontSize: 22 }}>{stats.proteinDays} / {stats.days}</div><div className="small dim">{t('{0} g or more', fmtNum(Math.round(stats.protein * PROTEIN_HIT)))}</div></div>
      <div className="tile"><div className="l">{t('Days logged')}</div><div className="v" style={{ fontSize: 22 }}>{stats.logged} / {stats.days}</div><div className="small dim">{t('complete: {0}', stats.complete)}</div></div>
    </div>
    <DayBars rows={stats.perDay} hide={hide} target={hide ? stats.protein : stats.target} />
  </div>
}
