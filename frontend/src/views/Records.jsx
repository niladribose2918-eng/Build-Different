import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX, exOr, matchExercise } from '../lib/exercises.js'
import { fmtSec } from '../lib/history.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { speedLabel, speedUnitOf, toSpeed } from '../lib/speed.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { recordsFor, recentPrs, prCount, sortRecords } from '../lib/records.js'
import { exerciseHistorySheet } from '../sheets.jsx'
import { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button, SearchField, Segmented } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'

// The Records board (Insights → Records): every personal record in one place, read back from
// the log by lib/records.js with the same helpers the PR badges use. A row opens the full
// record — rep table included — in a sheet, the way a workout row opens its detail.
const PAGE = 40

const nameOf = r => (EXIDX[r.id] ? exerciseNameFor(EXIDX[r.id]) : r.name || exerciseNameFor(exOr(r.id)))
const exOf = r => EXIDX[r.id] || exOr(r.id)

// The one line a row shows: the record that matters most for how the exercise is logged.
function headline(r, unit, speedUnit) {
  if (r.heaviest) return `${fmtNum(r.heaviest.w)} ${unit} × ${r.heaviest.r}`
  if (r.mostReps) return r.mostReps.r + ' ' + t('reps')
  if (r.longestHold) return fmtSec(r.longestHold.sec)
  if (r.topSpeed) return `${fmtNum(toSpeed(r.topSpeed.speed, speedUnit))} ${speedLabel(speedUnit)}`
  return ''
}

function RecordDetail({ r }) {
  const S = useStore(s => s.S)
  const unit = S.unit
  const speedUnit = speedUnitOf(S)
  const ex = exOf(r)
  return <>
    <h3 className={exerciseNameClass(ex)} style={{ marginBottom: 2 }}>{nameOf(r)}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{tn('{0} session', '{0} sessions', r.sessions)}{r.last ? ' · ' + t('last {0}', fmtDate(r.last, true)) : ''}</div>
    <div className="tiles">
      {r.heaviest && <div className="tile"><div className="l"><Icon name="trophy" />{t('Heaviest set')}</div>
        <div className="v" style={{ fontSize: 20 }}>{fmtNum(r.heaviest.w)} <span className="muted" style={{ fontSize: 13 }}>{unit} × {r.heaviest.r}</span></div>
        <div className="small dim">{fmtDate(r.heaviest.d, true)}</div></div>}
      {r.e1rm && <div className="tile"><div className="l"><Icon name="chartLine" />{t('Best est. 1RM')}</div>
        <div className="v" style={{ fontSize: 20 }}>{fmtNum(r.e1rm.est)} <span className="muted" style={{ fontSize: 13 }}>{unit}</span></div>
        <div className="small dim">{r.relative ? t('{0}× body weight', fmtNum(r.relative)) : fmtDate(r.e1rm.d, true)}</div></div>}
      {r.mostReps && <div className="tile"><div className="l"><Icon name="trophy" />{t('Most reps in a set')}</div>
        <div className="v" style={{ fontSize: 20 }}>{r.mostReps.r}</div><div className="small dim">{fmtDate(r.mostReps.d, true)}</div></div>}
      {r.longestHold && <div className="tile"><div className="l"><Icon name="stopwatch" />{t('Longest hold')}</div>
        <div className="v" style={{ fontSize: 20 }}>{fmtSec(r.longestHold.sec)}</div><div className="small dim">{fmtDate(r.longestHold.d, true)}</div></div>}
      {r.topSpeed && <div className="tile"><div className="l"><Icon name="figureRun" />{t('Top speed')}</div>
        <div className="v" style={{ fontSize: 20 }}>{fmtNum(toSpeed(r.topSpeed.speed, speedUnit))} <span className="muted" style={{ fontSize: 13 }}>{speedLabel(speedUnit)}</span></div>
        <div className="small dim">{fmtDate(r.topSpeed.d, true)}</div></div>}
    </div>
    {r.repTable && r.repTable.some(x => x.w != null) && <>
      <h4 className="sec" style={{ marginTop: 4 }}>{t('Rep records')}</h4>
      <div className="rep-table" role="table" aria-label={t('Rep records')}>
        {r.repTable.map(x => <div key={x.n} role="row" className={'rep-cell' + (x.done ? ' done' : '') + (x.est ? ' est' : '')}
          aria-label={`${x.n} ${t('reps')}: ` + (x.w == null ? '–' : `${fmtNum(x.w)} ${unit}${x.est ? ' (' + t('estimated') + ')' : ''}`)}>
          <span className="n">{x.n}</span><span className="w">{x.w == null ? '–' : fmtNum(x.w)}</span>
        </div>)}
      </div>
      <div className="small dim" style={{ marginTop: 6 }}>{t('Outlined: a set you did at exactly that many reps. Faded: estimated from your best 1RM, not a tested lift.')}</div>
    </>}
    {r.lastPr && <div className="small row" style={{ gap: 5, marginTop: 12 }}><Icon name="trophy" style={{ color: 'var(--yellow)', fontSize: 14 }} />{t('Last PR: {0}', fmtDate(r.lastPr, true))}</div>}
    <div style={{ height: 14 }} />
    <Button icon="history" onClick={() => exerciseHistorySheet(r.id)}>{t('Exercise history')}</Button>
  </>
}

export const recordDetailSheet = r => useUI.getState().openSheet(close => <RecordDetail r={r} close={close} />)

export default function Records() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('recent')
  const [shown, setShown] = useState(PAGE)
  const unit = S.unit
  const speedUnit = speedUnitOf(S)
  const all = useMemo(() => recordsFor(S), [S.workouts, S.bodyweight, S.dbLoad, S.oneRmFormula, S.customEx])
  const recent = useMemo(() => recentPrs(S), [S.workouts, S.dbLoad])
  const total = useMemo(() => prCount(S), [S.workouts])
  const byId = useMemo(() => new Map(all.map(r => [r.id, r])), [all])
  const query = q.trim()
  const list = useMemo(() => {
    const hits = query ? all.filter(r => matchExercise(EXIDX[r.id] || { n: nameOf(r) }, query)) : all
    return sortRecords(hits, sort)
  }, [all, query, sort])

  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/insights')} aria-label={t('Insights')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1>{t('Records')}</h1>
        <div className="sub">{t('PRs logged: {0}', total)}</div></div></div>

    {!all.length ? <div className="empty"><div className="ico"><Icon name="trophy" /></div>{t('Finish a workout and your records will show up here.')}</div> : <>
      <div style={{ marginBottom: 10 }}><SearchField value={q} placeholder={t('Search exercises…')} aria-label={t('Search exercises…')}
        onChange={e => { setQ(e.target.value); setShown(PAGE) }} onClear={() => { setQ(''); setShown(PAGE) }} /></div>
      <Segmented className="seg-range" value={sort} onChange={v => { setSort(v); setShown(PAGE) }}
        options={[{ value: 'recent', label: t('Recent') }, { value: 'trained', label: t('Most trained') }]} />

      {!query && recent.length > 0 && <>
        <h4 className="sec">{t('Recent records')}</h4>
        <div className="list" style={{ marginBottom: 18 }}>{recent.slice(0, 5).map((p, i) => {
          const r = byId.get(p.id) || { id: p.id }
          return <div key={p.id + p.d + i} className="item" {...tappable(() => recordDetailSheet(r))}>
            <Thumb ex={exOf(r)} />
            <div className="grow"><div className={'tt ' + exerciseNameClass(exOf(r))}>{nameOf(r)}</div>
              <div className="ss">{fmtNum(p.w)} {unit} × {p.r} · {fmtDate(p.d, true)}</div></div>
            <span className="pr"><Icon name="trophy" />PR</span>
          </div>
        })}</div>
      </>}

      <h4 className="sec">{query ? tn('{0} exercise', '{0} exercises', list.length) : t('All exercises')}</h4>
      {list.length ? <div className="list">{list.slice(0, shown).map(r => <div key={r.id} className="item" {...tappable(() => recordDetailSheet(r))}>
        <Thumb ex={exOf(r)} />
        <div className="grow"><div className={'tt ' + exerciseNameClass(exOf(r))}>{nameOf(r)}</div>
          <div className="ss">{[headline(r, unit, speedUnit), r.e1rm ? t('Est. 1RM') + ' ' + fmtNum(r.e1rm.est) + ' ' + unit : null, r.relative ? t('{0}× body weight', fmtNum(r.relative)) : null].filter(Boolean).join(' · ')}</div></div>
        <Icon name="chevronRight" className="chev" />
      </div>)}</div> : <div className="empty small">{t('No match')}</div>}
      {list.length > shown && <><div style={{ height: 10 }} /><Button onClick={() => setShown(n => n + PAGE)}>{t('Show more')}</Button></>}
    </>}
  </>
}
