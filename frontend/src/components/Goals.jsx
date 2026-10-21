import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXIDX, exOr } from '../lib/exercises.js'
import { exerciseNameText, fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  goalsView, goalsOf, withGoal, withoutGoal, liftWeight, toGoalKg, liftStatus, weeklyTarget, liftGoalOk, LIFT_REPS_MAX,
} from '../lib/goals.js'
import { enabledMeasurementFields, measurementLabel, measurementValue, toMeasurementDisplay, fromMeasurementDisplay, measurementUnit } from '../lib/measurements.js'
import { best1RM } from '../lib/onerm.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { exercisePicker, goalSheet as weightGoalSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import { Button, NumberField, Section, Segmented, SelectRow, Stepper } from './ui.jsx'

// Goals (Insights → Goals, lib/goals.js): the list with a bar for each, the editor sheet, and the
// one-line wording the Home "This week" card and the finish screen reuse. The body-weight goal is
// listed here as it is and still opens its own sheet from Home's Body weight card.

const exName = id => exerciseNameText(EXIDX[id] || exOr(id))
const unitOf = S => (S.unit === 'lb' ? 'lb' : 'kg')
// Weights at the precision a bar can be loaded to, so 225 lb kept in kg never reads 224.9.
const plate = (w, unit) => (unit === 'lb' ? Math.round(w * 2) / 2 : Math.round(w * 4) / 4)
/** The first loadable weight above `w`: the next 2.5 kg, or 5 lb. */
export const nextStep = (w, unit) => { const step = unit === 'lb' ? 5 : 2.5; return (Math.floor(w / step + 1e-9) + 1) * step }
const ICON = { lift: ['dumbbell', 'var(--blue)', '#fff'], freq: ['calendar', 'var(--green)', '#000'], measure: ['ruler', 'var(--indigo)', '#fff'], weight: ['scale', 'var(--yellow)', '#000'] }

/** A measurement's name as shown: the built-in ones translated, your own as you typed it. */
export const fieldName = (field, S) => (field.startsWith('other:') ? measurementLabel(field, S.customMeasurements || []) : t(measurementLabel(field)))
const fieldUnit = (field, S) => (field === 'bodyFat' ? '%' : measurementUnit(S.unit))
const fieldShown = (v, field, S) => (field === 'bodyFat' ? v : toMeasurementDisplay(v, S.unit))
const fieldValue = (v, field, S) => fmtNum(fieldShown(v, field, S)) + (field === 'bodyFat' ? '%' : ' ' + fieldUnit(field, S))

/** What a goal is, in a few words: "Barbell bench press · 100 kg × 1". */
export function goalTitle(g, S) {
  const unit = unitOf(S)
  if (g.kind === 'lift') return `${exName(g.ex)} · ${fmtNum(plate(liftWeight(g, unit), unit))} ${unit} × ${g.r}`
  if (g.kind === 'freq') return t('Sessions a week: {0}', g.n)
  if (g.kind === 'measure') return `${fieldName(g.field, S)} · ${fieldValue(g.target, g.field, S)}`
  return `${t('Body weight')} · ${fmtNum(g.target)} ${unit}`
}

/** Where a goal stands, in one line. */
export function goalDetail(g, S) {
  const st = g.status
  const unit = unitOf(S)
  if (g.kind === 'lift') {
    if (st.done) return t('Reached {0} with {1}', fmtDate(st.done.d), `${fmtNum(st.done.w)} ${unit} × ${st.done.r}`)
    if (st.ready) return t('Est. 1RM {0} · ready to test', fmtNum(st.e1rm) + ' ' + unit)
    if (st.e1rm != null) return st.date
      ? t('Est. 1RM {0} of {1} · on pace for about {2}', fmtNum(st.e1rm), fmtNum(st.targetE1rm) + ' ' + unit, fmtDate(st.date))
      : t('Est. 1RM {0} of {1}', fmtNum(st.e1rm), fmtNum(st.targetE1rm) + ' ' + unit)
    return st.lastTrained ? t('No sets in the last 90 days') : t('No sets logged yet')
  }
  if (g.kind === 'freq') return st.of
    ? t('This week {0} of {1} · hit {2} of the last {3} weeks', st.thisWeek, st.n, st.hit, st.of)
    : t('This week {0} of {1}', st.thisWeek, st.n)
  if (g.kind === 'measure') {
    if (st.done) return t('Reached {0} at {1}', fmtDate(st.done.d), fieldValue(st.done.v, g.field, S))
    if (st.cur == null) return t('No check-in yet')
    const gone = Math.max(0, (g.start - st.cur) * (st.lower ? 1 : -1))
    const span = Math.abs(g.start - g.target)
    const amount = g.field === 'bodyFat' ? x => fmtNum(x) : x => fmtNum(toMeasurementDisplay(x, S.unit))
    const line = t('Now {0} · {1} of {2} done', fieldValue(st.cur, g.field, S), amount(gone), amount(span) + ' ' + fieldUnit(g.field, S))
    return st.date ? line + ' · ' + t('on pace for about {0}', fmtDate(st.date)) : line
  }
  // the body-weight goal, as weightTrend reads it
  if (g.goal?.reached) return t('Reached')
  if (g.goal?.date) return t('Trend {0} · around {1}', fmtNum(g.trend) + ' ' + unit, fmtDate(g.goal.date))
  return g.trend != null ? t('Trend {0}', fmtNum(g.trend) + ' ' + unit) : t('Your goal from the Body weight card')
}

// How full a goal's bar is: sessions a week fill with this week.
const barOf = g => (g.kind === 'freq' ? Math.min(1, g.status.thisWeek / g.status.n) : g.kind === 'weight' ? (g.goal?.progress ?? 0) : g.status.pct)

function GoalRow({ g, S, onOpen }) {
  const [icon, bg, ink] = ICON[g.kind]
  const done = g.status?.done
  return <div className="gl-row" data-goal={g.kind} {...tappable(onOpen)}>
    <span className="lrow-i" style={{ background: done ? 'var(--green)' : bg, color: done ? '#000' : ink }}><Icon name={done ? 'checkCircle' : icon} /></span>
    <div className="grow" style={{ minWidth: 0 }}>
      <div className="gl-t">{goalTitle(g, S)}</div>
      <div className="small muted">{goalDetail(g, S)}</div>
      {!done && <div className="nt-bar-t" style={{ marginTop: 6 }}><span style={{ width: Math.round(barOf(g) * 100) + '%', background: g.status?.ready ? 'var(--green)' : 'var(--acc)' }} /></div>}
    </div>
  </div>
}

/** Insights' Goals card. */
export function GoalsCard() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const view = useMemo(() => goalsView(S, { today }), [S, today])
  const [showDone, setShowDone] = useState(false)
  const empty = !view.active.length && !view.weight && !view.achieved.length
  return <div className="card" data-goals id="goals">
    <div className="row between" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Goals')}</h2>
      {!view.full && <Button size="sm" variant="tinted" icon="plus" onClick={() => goalEditSheet()}>{t('Add a goal')}</Button>}
    </div>
    {empty && <div className="muted small">{t('Aim for a lift, how often you train, or a measurement. Progress comes from what you log.')}</div>}
    <div className="gl-list">
      {view.active.map(g => <GoalRow key={g.id} g={g} S={S} onOpen={() => goalEditSheet(g)} />)}
      {view.weight && <GoalRow g={{ kind: 'weight', ...view.weight }} S={S} onOpen={weightGoalSheet} />}
    </div>
    {view.full && <div className="small dim" style={{ marginTop: 8 }}>{t('Six goals running. Finish or remove one to add another.')}</div>}
    {view.achieved.length > 0 && <>
      <button className="gl-more small" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}>
        {t('Achieved: {0}', view.achieved.length)} <Icon name={showDone ? 'chevronUp' : 'chevronDown'} />
      </button>
      {showDone && <div className="gl-list">{view.achieved.map(g => <GoalRow key={g.id} g={g} S={S} onOpen={() => goalEditSheet(g)} />)}</div>}
    </>}
  </div>
}

function GoalEdit({ close, goal, start: startKind }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const unit = unitOf(S)
  const today = todayISO()
  const freq = goalsOf(S).find(g => g.kind === 'freq')
  const fields = enabledMeasurementFields(S)
  const [kind, setKind] = useState(goal?.kind || startKind || 'lift')
  const [ex, setEx] = useState(goal?.kind === 'lift' ? goal.ex : null)
  const [w, setW] = useState(goal?.kind === 'lift' ? plate(liftWeight(goal, unit), unit) : null)
  const [r, setR] = useState(goal?.kind === 'lift' ? goal.r : 1)
  const [n, setN] = useState(goal?.kind === 'freq' ? goal.n : freq?.n || weeklyTarget(S, today) || 3)
  const [field, setField] = useState(goal?.kind === 'measure' ? goal.field : fields.find(f => f.key === 'waist')?.key || fields[0]?.key || 'waist')
  const [target, setTarget] = useState(goal?.kind === 'measure' ? fieldShown(goal.target, goal.field, S) : null)
  // One sessions-a-week goal at a time: picking it again edits the one you have.
  const editing = goal || (kind === 'freq' ? freq : null)

  const pickEx = () => {
    const picker = exercisePicker(x => {
      if (!liftGoalOk(x)) { toast(t('An assisted exercise has no weight to aim for. Pick a loaded one.')); return }
      setEx(x.id)
      // Start one loading step above today's best estimate: a goal you already hold is no goal.
      if (w == null) { const b = best1RM(S, x.id); if (b) setW(nextStep(b.est, unit)) }
      picker.close()
    }, { title: t('Pick an exercise') })
  }
  const latest = kind === 'measure' ? (S.measurements || []).filter(e => measurementValue(e, field) != null).sort((a, b) => (a.d < b.d ? -1 : 1)).at(-1) : null
  const start = latest ? measurementValue(latest, field) : null
  const draft = kind === 'lift' ? (ex && w > 0 ? { kind, ex, kg: toGoalKg(w, unit), r, from: goal?.from || today } : null)
    : kind === 'freq' ? { kind, n, from: editing?.from || today }
    : start != null && target > 0 ? { kind, field, start: goal?.kind === 'measure' && goal.field === field ? goal.start : start,
      target: field === 'bodyFat' ? target : fromMeasurementDisplay(target, S.unit), from: goal?.from || today } : null
  // A target you already lifted, before the goal existed: it counts from the day it is set.
  const already = draft?.kind === 'lift' && !goal ? liftStatus(S, { ...draft, from: '0000-01-01' }, { today }).done : null
  const best = kind === 'lift' && ex ? best1RM(S, ex) : null
  const valid = !!draft && !(draft.kind === 'measure' && draft.target === draft.start)

  const save = () => {
    if (!valid) return
    update(s => { s.goals = withGoal(s.goals, draft, editing?.id) })
    toast(t('Goal saved'))
    close()
  }
  const remove = () => {
    update(s => { s.goals = withoutGoal(s.goals, editing.id) })
    toast(t('Goal removed'))
    close()
  }

  return <div className="gl-edit">
    <h3>{goal ? t('Edit goal') : t('New goal')}</h3>
    {!goal && <Segmented value={kind} onChange={setKind}
      options={[{ value: 'lift', label: t('Lift') }, { value: 'freq', label: t('Sessions') }, { value: 'measure', label: t('Measurement') }]} />}
    <div style={{ height: 10 }} />

    {kind === 'lift' && <Section footer={t('The bar fills with your best estimated 1RM. The goal is reached by a set that meets it.')}>
      <div className="lrow tappable" {...tappable(pickEx)}>
        <span className="lrow-m"><span className="lrow-t">{t('Exercise')}</span>
          {best && <span className="lrow-s">{t('Best est. 1RM: {0}', fmtNum(best.est) + ' ' + unit)}</span>}</span>
        <span className="lrow-v">{ex ? exName(ex) : t('Pick')}</span><Icon name="chevronRight" className="chev" />
      </div>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Weight')}</span></span>
        <Stepper value={w ?? 0} step={unit === 'lb' ? 5 : 2.5} min={0} max={unit === 'lb' ? 2000 : 900} unit={unit} onChange={setW} ariaLabel="weight" />
      </div>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Reps')}</span></span>
        <Stepper value={r} step={1} min={1} max={LIFT_REPS_MAX} decimal={false} onChange={setR} ariaLabel="reps" />
      </div>
      {already && <div className="lrow"><span className="lrow-m"><span className="lrow-s">{t('You already lifted this on {0}. It counts from today, so go heavier or test it again.', fmtDate(already.d))}</span></span></div>}
    </Section>}

    {kind === 'freq' && <Section footer={t('Weeks you hit it count toward your target streak. A week with a day note for every missed session does not break it.')}>
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Sessions a week')}</span></span>
        <Stepper value={n} step={1} min={1} max={7} decimal={false} onChange={setN} ariaLabel="sessions" />
      </div>
    </Section>}

    {kind === 'measure' && <Section footer={start == null
      ? t('Log a check-in with this measurement first. The goal starts from your latest one.')
      : t('Latest: {0} on {1}. Lower or higher is worked out from it.', fieldValue(start, field, S), fmtDate(latest.d))}>
      <SelectRow title={t('Measurement')} sheetTitle={t('Measurement')} value={field} onChange={v => { setField(v); setTarget(null) }}
        options={fields.map(f => ({ value: f.key, label: f.custom ? f.label : t(f.label) }))} />
      <div className="lrow">
        <span className="lrow-m"><span className="lrow-t">{t('Target')}</span></span>
        <span className="measure-input nt-num"><NumberField nullable value={target} aria-label={t('Target')} onChange={setTarget} /><i>{fieldUnit(field, S)}</i></span>
      </div>
    </Section>}

    <Button variant="primary" disabled={!valid} onClick={save}>{t('Save goal')}</Button>
    {editing && <><div style={{ height: 8 }} /><Button variant="danger" onClick={remove}>{t('Remove goal')}</Button></>}
  </div>
}

/** The goal editor: a new goal (of kind `start`, else a lift), or `goal` ({ id, ...goal }) to change or remove. */
export const goalEditSheet = (goal, start) => useUI.getState().openSheet(close => <GoalEdit close={close} goal={goal} start={start} />)
