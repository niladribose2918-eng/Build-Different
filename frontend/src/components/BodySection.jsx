import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { weightTrend } from '../lib/weight-trend.js'
import { bodyComp, WHTR_LIMIT } from '../lib/body-comp.js'
import { measurementUnit, toMeasurementDisplay } from '../lib/measurements.js'
import { bwSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import LineChart from './LineChart.jsx'
import { Button } from './ui.jsx'

// Insights → Body: the weight trend with its pace and goal date (lib/weight-trend.js), then what
// the change is made of (lib/body-comp.js). Wording is guidance, never a diagnosis, and every
// number is marked as an estimate. The Home weight card and Body measurements stay as they are.

const DAY = 86400000
const CHANGES_SHOWN = 5
const signed = (v, unit = '') => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v)) + (unit ? ' ' + unit : '')

const VERDICT = {
  holding: { label: () => t('holding steady'), color: 'var(--grey)' },
  gentle: { label: () => t('gentle pace'), color: 'var(--blue)' },
  steady: { label: () => t('steady pace'), color: 'var(--green)' },
  fast: { label: () => t('fast pace'), color: 'var(--orange)' },
  away: { label: () => t('away from goal'), color: 'var(--orange)' },
}

function WeightTrendCard({ S }) {
  const tr = useMemo(() => weightTrend(S), [S.bodyweight, S.targetW, S.unit])
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  if (!tr.ok) return <div className="card" data-weight-trend="waiting">
    <h2 style={{ marginBottom: 6 }}>{t('Weight trend')}</h2>
    <div className="muted small">{tr.count
      ? t('Weigh-ins so far: {0}. The trend and your pace show after 4 weigh-ins over at least 10 days.', tr.count)
      : t('Log your weight a few times a week. The trend and your pace show after 4 weigh-ins over at least 10 days.')}</div>
    <div style={{ height: 10 }} /><Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log weight')}</Button>
  </div>

  const v = VERDICT[tr.verdict]
  const g = tr.goal
  const since = Date.parse(tr.latest.d + 'T12:00:00') - 90 * DAY
  const recent = tr.series.filter(p => p.t >= since)
  const raw = recent.map(p => ({ t: p.t, d: p.d, y: Math.round(p.w * 10) / 10 }))
  const smooth = recent.map(p => ({ t: p.t, d: p.d, y: Math.round(p.trend * 10) / 10, note: t('Weighed {0}', fmtNum(p.w) + ' ' + unit) }))
  const losing = tr.direction === 'down'

  return <div className="card" data-weight-trend>
    <div className="row between" style={{ alignItems: 'flex-start', gap: 10 }}>
      <div>
        <div className="muted small">{t('Trend weight')}</div>
        <div className="big" style={{ marginTop: 2 }}>{fmtNum(tr.trend)} <span className="muted" style={{ fontSize: '1rem' }}>{unit}</span></div>
        <div className="small dim">{t('Last weigh-in {0} · {1}', fmtNum(tr.latest.w) + ' ' + unit, fmtDate(tr.latest.d, true))}</div>
      </div>
      <span className="pill-v" style={{ '--pill': v.color }} data-verdict={tr.verdict}>{v.label()}</span>
    </div>
    {tr.direction !== 'flat' && <div className="small bt-rate" data-rate>
      <Icon name={losing ? 'arrowDown' : 'arrowUp'} style={{ fontSize: 12 }} /> {t('{0} a week · {1}% of body weight', fmtNum(Math.abs(tr.perWeek)) + ' ' + unit, fmtNum(Math.abs(tr.pctPerWeek)))}
    </div>}
    {tr.verdict === 'fast' && <div className="small muted" style={{ marginTop: 4 }}>{losing
      ? t('Faster than most coaches recommend for keeping muscle. A little more food, and protein kept high, slows it down.')
      : t('Faster than most coaches recommend for a lean gain: more of it is likely to be fat.')}</div>}

    <div className="chart" style={{ marginTop: 8 }}>
      <LineChart points={smooth} h={130} unit={unit} goal={g?.target ?? null}
        series={[{ points: raw, color: 'var(--label-4)' }, { points: smooth, color: 'var(--acc)' }]} />
    </div>

    {g && <div className="bt-goal" data-goal>
      <div className="row between small"><span>{t('Goal {0}', fmtNum(g.target) + ' ' + unit)}</span>
        <span className="dim">{t('{0} of {1} done', fmtNum(Math.max(0, g.done)), fmtNum(g.toGo) + ' ' + unit)}</span></div>
      <div className="nt-bar-t" style={{ marginTop: 5 }}><span style={{ width: Math.round(g.progress * 100) + '%', background: 'var(--yellow)' }} /></div>
      <div className="small muted" style={{ marginTop: 6 }}>{
        g.reached ? t('Goal reached. Holding here is its own goal now.')
          : tr.stale ? t('Last weigh-in {0} days ago. Log one to update the pace.', tr.daysSince)
          : g.away ? t('The trend is moving away from your goal.')
          : g.date ? t('About {0} weeks at this pace, around {1}', fmtNum(Math.max(1, Math.round(g.weeks))), fmtDate(g.date, false, true))
          : t('At this pace the goal is more than two years away.')}</div>
    </div>}
    <div className="small dim" style={{ marginTop: 8 }}>{t('The trend smooths out day-to-day water swings; the pace is read from the last 3 weeks of weigh-ins.')}</div>
  </div>
}

function readingText(r, masses, wUnit, mUnit, S) {
  const waist = signed(toMeasurementDisplay(Math.abs(r.waist), S.unit) * Math.sign(r.waist), mUnit)
  const weight = signed(r.weight, wUnit)
  const leanKept = masses.ok && masses.lean >= -Math.max(0.5, masses.first.lean * 0.01)
  switch (r.kind) {
    case 'fatLoss': return leanKept ? t('Waist {0} and weight {1}: fat loss with muscle kept.', waist, weight) : t('Waist {0} and weight {1}: fat loss.', waist, weight)
    case 'recomp': return t('Waist {0} while weight held: recomposition, fat down with muscle kept or built.', waist)
    case 'leanGain': return t('Weight {0} with the waist steady: most of that gain is likely lean.', weight)
    case 'gaining': return t('Weight {0} and waist {1}: some of the gain is likely fat.', weight, waist)
    case 'steady': return t('Waist and weight both steady.')
    case 'scale': return t('Weight {0} with the waist steady: often water first; the tape usually follows.', weight)
    default: return t('Waist {0} and weight {1}.', waist, weight)
  }
}

function MassTile({ label, now, change, series, color, unit, held }) {
  return <div className="tile" style={{ padding: 12 }}>
    <div className="l">{label}</div>
    <div className="v" style={{ fontSize: 22 }}>{fmtNum(now)} <span className="muted" style={{ fontSize: 13 }}>{unit}</span></div>
    <div className="small" style={{ color: 'var(--label-2)' }}>{held ? t('held ({0})', signed(change)) : signed(change, unit)}</div>
    <div className="chart" style={{ marginTop: 4 }}><LineChart points={series} h={46} axes={false} unit={unit} color={color} /></div>
  </div>
}

function BodyCompCard({ S }) {
  const nav = useNavigate()
  const c = useMemo(() => bodyComp(S), [S.bodyweight, S.measurements, S.nutrition?.heightCm, S.measurementEnabled, S.customMeasurements])
  const wUnit = S.unit === 'lb' ? 'lb' : 'kg', mUnit = measurementUnit(S.unit)
  const [all, setAll] = useState(false)
  const m = c.masses
  const nothing = !m.count && !c.reading && !c.changes.length
  if (nothing) return <div className="card" data-body-comp="empty">
    <h2 style={{ marginBottom: 6 }}>{t('Body composition')}</h2>
    <div className="muted small">{t('Log your waist and, if you can, body fat in Body measurements. With a weigh-in near each, this shows how much of a change is fat and how much is muscle.')}</div>
    <div style={{ height: 10 }} /><Button size="sm" trailingIcon="chevronRight" onClick={() => nav('/measurements')}>{t('Body measurements')}</Button>
  </div>

  // The biggest changes first; the rest one tap away.
  const changes = [...c.changes].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
  const shownChanges = all ? changes : changes.slice(0, CHANGES_SHOWN)
  const pts = key => m.series.map(x => ({ t: Date.parse(x.d + 'T12:00:00'), d: x.d, y: x[key] }))
  const leanHeld = m.ok && Math.abs(m.lean) < Math.max(0.5, m.first.lean * 0.01)
  return <div className="card" data-body-comp>
    <div className="row between"><h2 style={{ margin: 0 }}>{t('Body composition')}</h2>
      {m.ok && <span className="small dim">{t('Since {0}', fmtDate(m.first.d))}</span>}</div>
    {m.ok ? <div className="tiles" style={{ marginTop: 10, marginBottom: 8 }}>
      <MassTile label={t('Fat mass')} now={m.last.fat} change={m.fat} series={pts('fat')} color="var(--orange)" unit={wUnit} />
      <MassTile label={t('Lean mass')} now={m.last.lean} change={m.lean} series={pts('lean')} color="var(--acc)" unit={wUnit} held={leanHeld} />
    </div> : <div className="muted small" style={{ marginTop: 6 }}>{t('Body-fat check-ins with a weigh-in within 3 days: {0} of 3. Fat and lean mass show from the third.', m.count)}</div>}

    {c.reading && <div className="bc-read" data-reading={c.reading.kind}>
      <Icon name="ruler" /><span>{readingText(c.reading, m, wUnit, mUnit, S)}</span>
    </div>}
    {c.whtr && <div className="small" style={{ marginTop: 8 }} data-whtr>
      {t('Waist-to-height {0}', c.whtr.ratio.toFixed(2))} <span className="dim">· {c.whtr.under ? t('under {0}, the usual guideline', WHTR_LIMIT) : t('above {0}, the usual guideline', WHTR_LIMIT)}</span>
    </div>}

    {c.changes.length > 0 && <>
      <div className="small muted" style={{ margin: '12px 0 4px' }}>{t('Since your first check-in')}</div>
      {shownChanges.map(x => <div className="mrow" key={x.key}>
        <span className="nm">{x.custom ? x.label : t(x.label)}</span>
        <span className="v">{x.percent ? signed(x.diff, '%') : signed(Math.sign(x.diff) * toMeasurementDisplay(Math.abs(x.diff), S.unit), mUnit)}</span>
      </div>)}
      {changes.length > CHANGES_SHOWN && <Button size="sm" variant="ghost" onClick={() => setAll(v => !v)}>{all ? t('Show fewer') : t('Show all {0}', changes.length)}</Button>}
    </>}
    <div className="small dim" style={{ marginTop: 8 }}>{m.ok
      ? t('Estimated from {0} body-fat check-ins. Body-fat readings vary by several points between scales, so watch the trend, not one reading.', m.count)
      : t('Estimates: body-fat readings vary by several points between scales.')}</div>
  </div>
}

export default function BodySection() {
  const S = useStore(s => s.S)
  return <div data-body-section>
    <h4 className="sec">{t('Body')}</h4>
    <WeightTrendCard S={S} />
    <BodyCompCard S={S} />
  </div>
}
