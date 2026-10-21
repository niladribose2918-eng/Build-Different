import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { finishContext } from '../lib/finish-context.js'
import { finishProtein } from '../lib/nutrition-tips.js'
import { goalsReachedBy, weeklyTarget } from '../lib/goals.js'
import { milestonesEarnedBy } from '../lib/milestones.js'
import { targetStreak } from '../lib/streaks.js'
import { goalTitle } from './Goals.jsx'
import { milestoneTitle, milestoneIcon } from './Milestones.jsx'
import Icon from './Icon.jsx'

// "Where this leaves you" on the finish summary (lib/finish-context.js): the week against the
// plan, the streak, and today against the last time this routine was trained, plus protein so
// far today once Nutrition is on (lib/nutrition-tips.js). A line with nothing to say is left
// out, so a first-ever session shows none.
export default function FinishContext({ st, w }) {
  const { week, streak, vsLast } = finishContext(st, w)
  const rows = []
  if (week) {
    const { done, planned } = week
    const title = !planned ? t('Workouts this week: {0}', done)
      : done === planned ? t('Week done: {0} of {1} planned', done, planned)
      : done < planned ? t('Session {0} of {1} planned this week', done, planned)
      : t('Session {0} this week, {1} planned', done, planned)
    rows.push(<div key="week" className="item fc-row">
      <span className="lrow-i" style={{ background: done >= planned && planned ? 'var(--green)' : 'var(--blue)', color: done >= planned && planned ? '#000' : '#fff' }}><Icon name={done >= planned && planned ? 'checkCircle' : 'calendar'} /></span>
      <div className="grow"><div className="tt">{title}</div>
        {planned > 0 && planned <= 7 && <div className="fc-pips" aria-hidden="true">{Array.from({ length: Math.max(planned, Math.min(done, 7)) }, (_, i) => <i key={i} className={i < done ? 'on' : ''} />)}</div>}</div>
    </div>)
  }
  // The session that brought the week to its target: the target streak it keeps going.
  const target = week ? weeklyTarget(st) : 0
  const ts = target > 0 ? targetStreak(st, target) : null
  if (ts?.thisWeek.hit && ts.thisWeek.done === target) rows.push(<div key="target" className="item fc-row" data-finish-target>
    <span className="lrow-i" style={{ background: 'var(--green)', color: '#000' }}><Icon name="target" /></span>
    <div className="grow"><div className="tt">{t('{0}-week target streak', ts.weeks)}</div>
      <div className="ss">{t('Target of {0} sessions hit this week', target)}</div></div>
  </div>)
  if (streak) rows.push(<div key="streak" className="item fc-row">
    <span className="lrow-i" style={{ background: 'var(--orange)', color: '#000' }}><Icon name="flame" /></span>
    <div className="grow"><div className="tt">{streak.extended ? t('{0}-week streak kept', streak.weeks) : t('{0}-week streak', streak.weeks)}</div></div>
  </div>)
  if (vsLast) {
    const { volume, sets, minutes } = vsLast
    const pct = volume.prev > 0 ? Math.round((volume.diff / volume.prev) * 100) : null
    const parts = [
      pct == null ? null : pct === 0 ? t('Volume the same') : t('Volume {0}', (pct > 0 ? '+' : '−') + Math.abs(pct) + '%'),
      sets.diff === 0 ? t('Sets the same') : t('Sets {0}', (sets.diff > 0 ? '+' : '−') + Math.abs(sets.diff)),
      !minutes.cur || !minutes.prev || !minutes.diff ? null : minutes.diff < 0 ? t('{0} min quicker', -minutes.diff) : t('{0} min longer', minutes.diff),
    ].filter(Boolean)
    rows.push(<div key="last" className="item fc-row">
      <span className="lrow-i" style={{ background: 'var(--blue)', color: '#fff' }}><Icon name="chartLine" /></span>
      <div className="grow"><div className="tt">{t('Against last time, {0}', fmtDate(vsLast.d, true))}</div>
        <div className="ss">{parts.join(' · ')}</div></div>
    </div>)
  }
  // What this workout reached: a lift goal met by a real set, and the milestones it earned.
  for (const g of goalsReachedBy(st, w)) rows.push(<div key={'goal-' + g.id} className="item fc-row" data-finish-goal>
    <span className="lrow-i" style={{ background: 'var(--green)', color: '#000' }}><Icon name="flag" /></span>
    <div className="grow"><div className="tt">{t('Goal reached: {0}', goalTitle(g, st))}</div></div>
  </div>)
  const earned = milestonesEarnedBy(st, w)
  earned.slice(0, 3).forEach(m => rows.push(<div key={'ms-' + m.id} className="item fc-row" data-finish-milestone>
    <span className="lrow-i" style={{ background: 'var(--yellow)', color: '#000' }}><Icon name={milestoneIcon(m)} /></span>
    <div className="grow"><div className="tt">{t('Milestone: {0}', milestoneTitle(m))}</div>
      {m === earned[2] && earned.length > 3 && <div className="ss">{t('And {0} more in Insights', earned.length - 3)}</div>}</div>
  </div>))
  // With Nutrition on: protein so far today, the one number worth knowing straight after training.
  const fp = finishProtein(st)
  if (fp) rows.push(<div key="protein" className="item fc-row" data-finish-protein>
    <span className="lrow-i" style={{ background: 'var(--teal)', color: '#000' }}><Icon name="utensils" /></span>
    <div className="grow"><div className="tt">{t('Protein so far today: {0} of {1} g', fp.p, fp.target)}</div>
      <div className="nt-bar-t" style={{ marginTop: 6 }}><span style={{ width: Math.min(100, fp.p / fp.target * 100) + '%', background: 'var(--acc)' }} /></div></div>
  </div>)
  if (!rows.length) return null
  return <div style={{ textAlign: 'start', marginBottom: 14 }} data-finish-context>
    <h4 className="sec">{t('Where this leaves you')}</h4>
    <div className="list">{rows}</div>
  </div>
}
