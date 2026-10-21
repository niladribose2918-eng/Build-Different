import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { fmtDate, fmtNum, fmtPlate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { milestonesView } from '../lib/milestones.js'
import { streakWeeks } from '../lib/history.js'
import { weeklyTarget } from '../lib/goals.js'
import { targetStreak } from '../lib/streaks.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import { goalEditSheet } from './Goals.jsx'

// Milestones and the target streak in Insights (lib/milestones.js, lib/streaks.js), and the words
// the Home "This week" card and the finish screen use for them. Quiet on purpose: no points, no
// levels, nothing lost for a missed week.

const LIFT_NAME = { bench: () => t('Bench press'), squat: () => t('Squat'), deadlift: () => t('Deadlift'), press: () => t('Overhead press') }
const ICON = {
  workouts: 'dumbbell', streak: 'flame', volume: 'barbell', records: 'trophy', consistency: 'checkCircle', weighIns: 'scale',
  measure: 'ruler', weightGoal: 'target', strength: 'medal', foodDays: 'utensils', proteinDays: 'egg',
}
export const milestoneIcon = m => ICON[m.group] || 'medal'

/** A milestone's name: "50 workouts", "Bench press at 1× body weight". */
export function milestoneTitle(m) {
  switch (m.group) {
    case 'workouts': return m.n === 1 ? t('First workout') : t('{0} workouts', fmtNum(m.n))
    case 'streak': return t('{0}-week streak', m.n)
    case 'volume': return m.unit === 'lb' ? t('{0} lb lifted', fmtNum(m.n)) : t('{0} t lifted', fmtNum(m.n / 1000))
    case 'records': return m.n === 1 ? t('First PR') : t('{0} PRs', fmtNum(m.n))
    case 'consistency': return m.n === 1 ? t('First week on target') : t('{0} weeks on target in a row', m.n)
    case 'weighIns': return m.n === 1 ? t('First weigh-in') : t('{0} weigh-ins', m.n)
    case 'measure': return t('First measurement check-in')
    case 'weightGoal': return t('Weight goal reached')
    case 'strength': return t('{0} at {1}× body weight', LIFT_NAME[m.lift](), fmtPlate(m.n))
    case 'foodDays': return m.n === 1 ? t('First day of food logged') : t('{0} days of food logged', m.n)
    case 'proteinDays': return t('Protein target hit on {0} days', m.n)
    default: return ''
  }
}

/** How far along a milestone still ahead is: "35 / 50", "1.21× / 1.25×". */
export function milestoneProgress(m) {
  if (m.group === 'strength') return `${fmtPlate(m.cur)}× / ${fmtPlate(m.of)}×`
  if (m.group === 'volume') return m.unit === 'lb' ? `${fmtNum(Math.round(m.cur))} / ${fmtNum(m.of)} lb` : `${fmtNum(Math.round(m.cur / 100) / 10)} / ${fmtNum(m.of / 1000)} t`
  if (m.group === 'weightGoal') return Math.round(m.cur * 100) + '%'
  return `${fmtNum(m.cur)} / ${fmtNum(m.of)}`
}

const SHOWN = 6

/** Insights' Milestones card. */
export function MilestonesCard() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const v = useMemo(() => milestonesView(S, { today }), [S, today])
  const [all, setAll] = useState(false)
  if (S.showMilestones === false) return null
  if (!v.earned.length && !v.next.length) return null
  const recent = new Set(v.recent.map(m => m.id))
  const earned = all ? v.earned : v.earned.slice(0, SHOWN)
  return <div className="card" data-milestones>
    <h2 style={{ marginBottom: 8 }}>{t('Milestones')}</h2>
    {earned.length > 0 && <div className="ms-grid">
      {earned.map(m => <div key={m.id} className="ms-tile" data-milestone={m.id}>
        <span className="lrow-i" style={{ background: 'var(--yellow)', color: '#000' }}><Icon name={milestoneIcon(m)} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="ms-t">{milestoneTitle(m)}</div>
          <div className="small muted ms-d"><Icon name="check" />{fmtDate(m.earned)}{recent.has(m.id) && <span className="tag acc ms-new">{t('New')}</span>}</div>
        </div>
      </div>)}
    </div>}
    {v.earned.length > SHOWN && <button className="gl-more small" onClick={() => setAll(x => !x)} aria-expanded={all}>
      {all ? t('Show fewer') : t('Show all {0}', v.earned.length)} <Icon name={all ? 'chevronUp' : 'chevronDown'} />
    </button>}
    {v.next.length > 0 && <>
      <h4 className="sec" style={{ marginTop: earned.length ? 12 : 0 }}>{t('Next up')}</h4>
      <div className="gl-list">{v.next.map(m => <div key={m.id} className="gl-row" data-next={m.id}>
        <span className="lrow-i" style={{ background: 'var(--surface-3)' }}><Icon name={milestoneIcon(m)} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row between" style={{ gap: 8 }}><span className="gl-t">{milestoneTitle(m)}</span><span className="small muted" style={{ flexShrink: 0 }}>{milestoneProgress(m)}</span></div>
          <div className="nt-bar-t" style={{ marginTop: 6 }}><span style={{ width: Math.round(m.pct * 100) + '%', background: 'var(--acc)' }} /></div>
        </div>
      </div>)}</div>
    </>}
    <div className="small dim" style={{ marginTop: 8 }}>{S.showStrengthMarkers !== false
      ? t('Worked out from your log. Strength markers use your best estimated 1RM from sets of 10 reps or fewer, against your body weight that day. They are classic gym markers, not a ranking.')
      : t('Worked out from your log.')}</div>
  </div>
}

/** Insights' Consistency card: the target streak beside the week streak Home shows. */
export function ConsistencyCard() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const data = useMemo(() => {
    const target = weeklyTarget(S, today)
    return { target, st: targetStreak(S, target, { today }), week: S.workouts.length ? streakWeeks(S) : 0 }
  }, [S, today])
  if (!S.workouts.length) return null
  const { target, st, week } = data
  return <div className="card" data-consistency>
    <h2 style={{ marginBottom: 6 }}>{t('Consistency')}</h2>
    {st ? <>
      <div className="row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
        <Icon name="target" style={{ color: 'var(--green)' }} />{t('{0}-week target streak', st.weeks)}
      </div>
      <div className="small muted" style={{ marginTop: 2 }}>{t('Weeks with {0} or more sessions · this week {1} of {0}', target, st.thisWeek.done)}</div>
      {target <= 14 && <div className="fc-pips" style={{ marginTop: 8 }} aria-hidden="true">
        {Array.from({ length: Math.max(target, Math.min(st.thisWeek.done, 14)) }, (_, i) => <i key={i} className={i < st.thisWeek.done ? 'on' : ''} />)}
      </div>}
      <div className="small muted" style={{ marginTop: 6 }}>{t('Longest: {0} weeks', st.best)}{st.excused ? ' · ' + t('excused weeks inside it: {0}', st.excused) : ''}</div>
    </> : <>
      <div className="small muted">{t('Plan your training days, or set a sessions-a-week goal, to start a target streak.')}</div>
      <div style={{ marginTop: 8 }}><Button size="sm" variant="tinted" icon="target" onClick={() => goalEditSheet(null, 'freq')}>{t('Set a goal')}</Button></div>
    </>}
    <div className="small dim" style={{ marginTop: 8 }}>{t('Your week streak ({0}) counts any week with a workout. The target streak counts the weeks you hit your target; a week where every missed session has a day note neither breaks it nor adds to it.', week)}</div>
  </div>
}
