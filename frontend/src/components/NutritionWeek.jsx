import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { DAYS, fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { computeTargets } from '../lib/nutrition-targets.js'
import { dayTotals, dayDone, entriesOn } from '../lib/food-log.js'
import { checkinFor, answerCheckin, checkinsOf } from '../lib/adaptive-tdee.js'
import { PROTEIN_HIT } from '../lib/insights.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// Nutrition → Week: the weekly check-in on the day it comes round (lib/adaptive-tdee.js), the
// last seven days against the target, and the check-ins so far. With Hide calories on, the days
// are read in protein and the check-in speaks without calorie numbers.

const DAY = 86400000
const shift = (iso, n) => new Date(Date.parse(iso + 'T12:00:00') + n * DAY).toISOString().slice(0, 10)

function Checkin({ S, ci, hide }) {
  const answer = apply => {
    useStore.getState().update(s => { answerCheckin(s, ci, apply) })
    useUI.getState().toast(apply ? t('Targets updated') : t('Targets kept'))
  }
  const l = ci.learn
  if (!l.ok) {
    const parts = [
      l.need.days ? t('complete days: {0} more', l.need.days) : null,
      l.need.weighIns ? t('weigh-ins: {0} more', l.need.weighIns) : null,
      !l.need.weighIns && l.need.span ? t('weigh-ins spread over {0} more days', l.need.span) : null,
    ].filter(Boolean)
    return <div className="card" data-checkin="waiting">
      <h2 style={{ marginBottom: 6 }}>{t('Weekly check-in')}</h2>
      <div className="muted small">{t('Once there is enough to go on, this learns your real maintenance calories from what you ate and how your trend weight moved.')}</div>
      {parts.length > 0 && <div className="small" style={{ marginTop: 8 }}>{t('Still needed: {0}', parts.join(' · '))}</div>}
      <div className="small dim" style={{ marginTop: 8 }}>{t('Only days marked complete count, so a forgotten snack can’t pull your target down.')}</div>
    </div>
  }
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const change = unit === 'lb' ? l.changeKg * 2.2046226218 : l.changeKg
  const weeks = Math.max(1, Math.round((Date.parse(l.to) - Date.parse(l.from)) / DAY / 7))
  return <div className="card nci-card" data-checkin={ci.onTrack ? 'on-track' : 'suggest'}>
    <div className="row between"><h2 style={{ margin: 0 }}>{t('Weekly check-in')}</h2><span className="small dim">{t('Last {0} weeks', weeks)}</span></div>
    {!hide && <div className="nci-rows">
      <div className="nt-mrow"><span>{t('Average on complete days ({0})', l.completeDays)}</span><b>{fmtNum(l.intake)} {t('kcal')}</b></div>
      <div className="nt-mrow"><span>{t('Trend weight')}</span><b>{change > 0 ? '+' : change < 0 ? '−' : ''}{fmtNum(Math.abs(change))} {unit}</b></div>
      <div className="nt-mrow nt-mtot"><span>{t('Your maintenance, about')}</span><b>{fmtNum(l.maintenance)} {t('kcal')}</b></div>
      {l.trust < 1 && <div className="small dim">{t('Blended with the formula ({0} kcal) until there are three weeks of complete days.', fmtNum(l.formula))}</div>}
    </div>}
    {ci.onTrack ? <>
      <div className="nci-verdict"><Icon name="checkCircle" /> {hide ? t('Your targets are on track. No change needed.') : t('Your target of {0} kcal is on track. No change needed.', fmtNum(ci.current))}</div>
      <Button size="sm" variant="tinted" onClick={() => answer(false)}>{t('Done')}</Button>
    </> : <>
      <div className="nci-verdict">{hide
        ? (ci.change < 0 ? t('Your log and trend suggest eating a little less to keep your pace.') : t('Your log and trend suggest eating a little more to keep your pace.'))
        : t('Suggested target: {0} kcal, now {1} ({2})', fmtNum(ci.suggested), fmtNum(ci.current), (ci.change > 0 ? '+' : '−') + fmtNum(Math.abs(ci.change)))}</div>
      {ci.capped && <div className="small dim" style={{ marginBottom: 8 }}>{t('Moved by the 10% a check-in allows; the next one can move it further.')}</div>}
      <div className="row" style={{ gap: 8 }}>
        <Button size="sm" variant="primary" onClick={() => answer(true)}>{t('Apply')}</Button>
        <Button size="sm" variant="ghost" onClick={() => answer(false)}>{t('Keep current')}</Button>
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>{t('Nothing changes until you tap Apply.')}</div>
    </>}
  </div>
}

function Days({ S, tg, hide }) {
  const today = todayISO()
  const days = Array.from({ length: 7 }, (_, i) => shift(today, i - 7))
  const rows = days.map(d => {
    const tot = dayTotals(S, d)
    return { d, k: tot.k, p: tot.p, logged: entriesOn(S, d).length > 0, done: dayDone(S, d) }
  })
  const logged = rows.filter(r => r.logged)
  const avg = logged.length ? Math.round(logged.reduce((a, r) => a + r.k, 0) / logged.length) : 0
  const proteinDays = rows.filter(r => r.logged && r.p >= tg.protein * PROTEIN_HIT).length
  const target = hide ? tg.protein : tg.kcal
  return <div className="card" data-week-days>
    <div className="row between"><h2 style={{ margin: 0 }}>{t('Last 7 days')}</h2><span className="small dim">{fmtDate(days[0])} – {fmtDate(days[6])}</span></div>
    <div className={'tiles' + (hide ? '' : ' tiles-3')} style={{ marginTop: 10 }}>
      {!hide && <div className="tile"><div className="l">{t('Average')}</div><div className="v" style={{ fontSize: 22 }}>{logged.length ? fmtNum(avg) : '–'}</div><div className="small dim">{t('target {0}', fmtNum(tg.kcal))}</div></div>}
      <div className="tile"><div className="l">{t('Protein days')}</div><div className="v" style={{ fontSize: 22 }}>{proteinDays} / 7</div><div className="small dim">{t('{0} g or more', fmtNum(Math.round(tg.protein * PROTEIN_HIT)))}</div></div>
      <div className="tile"><div className="l">{t('Days logged')}</div><div className="v" style={{ fontSize: 22 }}>{logged.length} / 7</div><div className="small dim">{t('complete: {0}', rows.filter(r => r.done).length)}</div></div>
    </div>
    <DayBars rows={rows} hide={hide} target={target} />
  </div>
}

/** Calories (or protein, with Hide calories) per day as bars against the target line. */
export function DayBars({ rows, hide, target }) {
  const key = hide ? 'p' : 'k'
  const top = Math.max(target * 1.25, ...rows.map(r => r[key])) || 1
  const labels = rows.length <= 7
  return <>
    <div className={'wk-bars' + (labels ? '' : ' wk-bars-dense')} role="img" aria-label={hide ? t('Protein per day') : t('Calories per day')}>
      <span className="wk-target" style={{ bottom: (target / top * 100) + '%' }}><i>{fmtNum(target)}</i></span>
      {rows.map(r => <div key={r.d} className="wk-bar">
        <span className={r.done ? 'on' : r.logged ? 'part' : ''} style={{ height: Math.max(2, r[key] / top * 100) + '%' }} title={`${fmtDate(r.d, true)} · ${fmtNum(r[key])}${hide ? ' g' : ''}`} />
        {labels && <em>{t(DAYS[new Date(r.d + 'T12:00:00').getDay()])}</em>}
      </div>)}
    </div>
    <div className="small dim" style={{ marginTop: 6 }}>{t('Solid bars are days marked complete.')}</div>
  </>
}

function History({ S, hide }) {
  const list = checkinsOf(S)
  if (!list.length) return null
  return <div className="card" data-checkin-history>
    <h2 style={{ marginBottom: 6 }}>{t('Check-ins')}</h2>
    {list.slice(0, 12).map(c => <div key={c.id} className="mrow">
      <span className="nm">{fmtDate(c.d, true)}</span>
      <span className="v">{c.applied
        ? (hide ? t('Targets updated') : t('{0} → {1} kcal', fmtNum(c.from), fmtNum(c.to)))
        : t('Kept')}</span>
      {!hide && <span className="v dim">{t('ate {0} · maint. {1}', fmtNum(c.intake), fmtNum(c.maintenance))}</span>}
    </div>)}
  </div>
}

export default function NutritionWeek() {
  const S = useStore(s => s.S)
  const hide = !!S.nutrition?.hideCalories
  const tg = computeTargets(S)
  const ci = useMemo(() => checkinFor(S), [S])
  return <div data-nutrition-week>
    {ci.due ? <Checkin S={S} ci={ci} hide={hide} />
      : <div className="small dim" style={{ margin: '0 2px 10px' }} data-checkin="later">{t('Next weekly check-in in {0} days.', ci.inDays)}</div>}
    {tg.ok && <Days S={S} tg={tg} hide={hide} />}
    <History S={S} hide={hide} />
  </div>
}
