import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX, exOr } from '../lib/exercises.js'
import { exerciseNameText, fmtDateRange, fmtDur, fmtNum, fmtVol, todayISO, weekStartOf, DAYN } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { periodReport, liftsMoved, defaultPeriod, PERIODS } from '../lib/insights.js'
import { highlightsFor } from '../lib/highlights.js'
import { recentPrs, prCount } from '../lib/records.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import BodySection from '../components/BodySection.jsx'

// Insights (Stats → Insights): a week or a month of training against the one before, the few
// findings worth knowing about it, and the way into the Records board. Everything is worked out
// on the device from the log (lib/insights.js, lib/highlights.js); nothing here is stored.

// The period last picked, remembered on this device only: a viewing preference, not profile data.
const PERIOD_KEY = 'gym_insights_period'
const readPeriod = () => { try { return localStorage.getItem(PERIOD_KEY) } catch { return null } }
const writePeriod = v => { try { localStorage.setItem(PERIOD_KEY, v) } catch { /* private window: the pick lasts this visit */ } }

// Capitalised as text, not by the name's CSS class: the class would title-case the whole sentence
// a name sits in ("Bench Press Up 8% In 4 Weeks").
const exName = id => exerciseNameText(EXIDX[id] || exOr(id))

// A change against the period before, in the trend colours the finish summary already uses.
function Delta({ d, kind = 'count', unit }) {
  if (!d.cur && !d.prev) return <span className="small dim">–</span>
  if (d.diff === 0) return <span className="small dim">{t('same')}</span>
  const up = d.diff > 0
  const style = { color: up ? 'var(--green)' : 'var(--orange)', fontWeight: 600 }
  const arrow = up ? '▲ ' : '▼ '
  if (kind === 'pct') return <span className="small" style={style}>{arrow}{d.pct == null ? fmtVol(Math.abs(d.diff), unit) : Math.abs(d.pct) + '%'}</span>
  if (kind === 'time') return <span className="small" style={style}>{arrow}{fmtDur(Math.abs(d.diff))}</span>
  return <span className="small" style={style}>{arrow}{fmtNum(Math.abs(d.diff))}</span>
}

const TONE = {
  records: { icon: 'trophy', bg: 'var(--yellow)', ink: '#000' },
  liftUp: { icon: 'chartLine', bg: 'var(--blue)', ink: '#fff' },
  consistency: { icon: 'checkCircle', bg: 'var(--green)', ink: '#000' },
  plateau: { icon: 'minus', bg: 'var(--orange)', ink: '#000' },
  neglected: { icon: 'warning', bg: 'var(--orange)', ink: '#000' },
  volumeSpike: { icon: 'bolt', bg: 'var(--orange)', ink: '#000' },
  missedDay: { icon: 'calendar', bg: 'var(--indigo)', ink: '#fff' },
}

// How each highlight reads: title, the line under it, and how it was worked out.
function wordsOf(h, S) {
  const d = h.data
  switch (h.id) {
    case 'records': return {
      title: t('New records: {0}', d.n),
      detail: t('Period before: {0}', d.prev),
      why: t('PR badges earned on workouts in this period.'),
    }
    case 'liftUp': return {
      title: t('{0} up {1}% in 4 weeks', exName(d.id), fmtNum(d.pct)),
      detail: t('Est. 1RM {0} → {1}', fmtNum(d.from), fmtNum(d.to) + ' ' + S.unit),
      why: t('Your best set each session, as an estimated 1RM with your 1RM formula, first and last of the last 4 weeks.'),
    }
    case 'consistency': return {
      title: t('Every planned session done'),
      detail: t('Weeks in a row: {0} · planned per week: {1}', d.weeks, d.planned),
      why: t('Weeks with at least as many workouts as your plan has training days.'),
    }
    case 'plateau': return {
      title: t('{0} is holding at {1}', exName(d.id), `${fmtNum(d.w)} ${S.unit} × ${d.r}`),
      detail: t('Sessions without a new best: {0}. A new rep range or a lighter week often restarts progress.', d.sessions),
      why: t('Your best estimated 1RM has not gone up for this many sessions, over at least 3 weeks.'),
    }
    case 'neglected': return {
      title: t('{0}: no work in 14 days', t(MUSCLE_NAME[d.muscle] || d.muscle)),
      detail: t('Your plan has {0} sets a week for it.', fmtNum(d.planned)),
      why: t('Sets per muscle from your plan, against the sets you completed in the last 14 days.'),
    }
    case 'volumeSpike': return {
      title: t('Volume up {0}% this week', d.pct),
      detail: t('Working sets: {0}, against about {1} a week before. Expect more soreness; keep the effort moderate for a few sessions.', d.cur, d.base),
      why: t('Working sets in the last 7 days against the average of the 4 weeks before.'),
    }
    case 'missedDay': return {
      title: t('{0}: your most-missed training day', t(DAYN[d.weekday])),
      detail: t('Missed {0} of {1} in the last 8 weeks. Moving that session might make it easier to keep.', d.missed, d.planned),
      why: t('Planned days with no workout and no day note, over the last 8 weeks.'),
    }
    default: return null
  }
}

function Highlight({ h, S }) {
  const [open, setOpen] = useState(false)
  const w = wordsOf(h, S)
  if (!w) return null
  const tone = TONE[h.id] || TONE.records
  return <div className="hl-row" data-highlight={h.id} {...tappable(() => setOpen(v => !v))} aria-expanded={open}>
    <span className="lrow-i" style={{ background: tone.bg, color: tone.ink }}><Icon name={tone.icon} /></span>
    <div style={{ minWidth: 0 }}>
      <div className="hl-t">{w.title}</div>
      <div className="small muted">{w.detail}</div>
      {open && <div className="small dim" style={{ marginTop: 4 }}>{w.why}</div>}
    </div>
  </div>
}

export default function Insights() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const ws = weekStartOf(S)
  const today = todayISO()
  const [kind, setKind] = useState(() => defaultPeriod(readPeriod(), today, ws))
  const pick = v => { setKind(v); writePeriod(v) }
  const report = useMemo(() => periodReport(S, kind, today, ws), [S.workouts, kind, today, ws])
  const highlights = useMemo(() => highlightsFor(S, report), [S, report])
  const moved = useMemo(() => liftsMoved(S, report.from, report.to), [S.workouts, S.dbLoad, S.oneRmFormula, report.from, report.to])
  const records = useMemo(() => ({ total: prCount(S), recent: recentPrs(S).length }), [S.workouts])
  const d = report.delta
  const caption = report.partial
    ? (kind === 'week' ? t('So far, against the same days last week') : t('So far, against the same days last month'))
    : (kind === 'lastWeek' ? t('Against the week before') : t('Against the month before'))

  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Insights')}</h1><div className="sub">{t('How your training is going')}</div></div></div>

    <Segmented className="seg-range" value={kind} onChange={pick}
      options={PERIODS.map(p => ({ value: p, label: { week: t('This week'), lastWeek: t('Last week'), month: t('This month'), lastMonth: t('Last month') }[p] }))} />
    <div className="small dim" style={{ margin: '-2px 2px 10px' }}>{fmtDateRange(report.from, report.to, true)} · {caption}</div>

    {!S.workouts.length ? <div className="empty"><div className="ico"><Icon name="chartLine" /></div>{t('Finish your first workout and your insights will show up here.')}</div> : <>
      <div className="tiles" data-insights-tiles>
        <div className="tile"><div className="l"><Icon name="dumbbell" />{t('Workouts')}</div><div className="v">{report.cur.workouts}</div><Delta d={d.workouts} /></div>
        <div className="tile"><div className="l"><Icon name="checkCircle" />{t('Working sets')}</div><div className="v">{report.cur.sets}</div><Delta d={d.sets} /></div>
        <div className="tile"><div className="l"><Icon name="chartLine" />{t('Volume')}</div><div className="v" style={{ fontSize: 22 }}>{fmtVol(report.cur.volume, S.unit)}</div><Delta d={d.volume} kind="pct" unit={S.unit} /></div>
        <div className="tile"><div className="l"><Icon name="trophy" />{t('PRs')}</div><div className="v">{report.cur.prs}</div><Delta d={d.prs} /></div>
      </div>
      <div className="small muted row" style={{ gap: 6, margin: '-4px 2px 14px' }}>
        <Icon name="stopwatch" style={{ fontSize: 13 }} />{t('Training time')} {report.cur.ms ? fmtDur(report.cur.ms) : '–'} <Delta d={d.ms} kind="time" />
      </div>

      {highlights.length > 0 && <div className="card" data-highlights>
        <h2 style={{ marginBottom: 6 }}>{t('Highlights')}</h2>
        <div className="hl-list">{highlights.map(h => <Highlight key={h.id} h={h} S={S} />)}</div>
        <div className="small dim" style={{ marginTop: 8 }}>{t('Tap a highlight to see how it was worked out.')}</div>
      </div>}

      {moved.length > 0 && <div className="card" data-lifts-moved>
        <h2 style={{ marginBottom: 2 }}>{t('Lifts that moved')}</h2>
        <div className="muted small" style={{ marginBottom: 8 }}>{t('Best estimated 1RM in this period, against the last session before it.')}</div>
        {moved.map(m => <div key={m.id} className="mrow">
          <span className="nm">{exName(m.id)}</span>
          <span className="v" style={{ minWidth: 0 }}>{fmtNum(m.before)} → {fmtNum(m.now)} {S.unit}</span>
          <span className="v" style={{ color: m.pct > 0 ? 'var(--green)' : m.pct < 0 ? 'var(--orange)' : undefined, fontWeight: 600 }}>{m.pct > 0 ? '+' : ''}{fmtNum(m.pct)}%</span>
        </div>)}
      </div>}

      <div className="card row between" style={{ alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{t('Records')}</h2>
          <div className="muted small" style={{ marginTop: 4 }}>{t('PRs logged: {0}', records.total)}{records.recent ? ' · ' + t('Last 30 days: {0}', records.recent) : ''}</div></div>
        <Button size="sm" variant="tinted" trailingIcon="chevronRight" style={{ flexShrink: 0 }} onClick={() => nav('/records')}>{t('Open')}</Button>
      </div>
    </>}

    <BodySection />
  </>
}
