import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtNum, todayISO, weekStartOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { weekTally } from '../lib/queue.js'
import { effectiveRoutineIds } from '../lib/history.js'
import { periodReport } from '../lib/insights.js'
import { highlightsFor } from '../lib/highlights.js'
import { weightTrend } from '../lib/weight-trend.js'
import { nearestGoal, weeklyTarget } from '../lib/goals.js'
import { targetStreak } from '../lib/streaks.js'
import { milestonesView } from '../lib/milestones.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { wordsOf, TONE } from '../views/Insights.jsx'
import Icon from './Icon.jsx'
import { goalTitle } from './Goals.jsx'
import { milestoneTitle, milestoneProgress } from './Milestones.jsx'

// "This week" on Home: the week's sessions as pips, today's session, last week in one line, the
// top highlight and the weight trend, a tap away from Insights. It reads the current and the last
// week only, never the whole history, so Home stays quick. Settings → Look & Home switches it
// (S.showWeekCard: on for new profiles, off for profiles saved before it existed).
// How far a goal is, in a word or two, for the card's one line.
function goalShort(g) {
  if (g.kind === 'weight') return Math.round((g.goal?.progress ?? 0) * 100) + '%'
  if (g.kind === 'freq') return t('{0} of {1} this week', g.status.thisWeek, g.status.n)
  if (g.status.ready) return t('ready to test')
  return Math.round(g.status.pct * 100) + '%'
}

export default function WeekCard() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  const ws = weekStartOf(S)
  const data = useMemo(() => {
    if (!S.showWeekCard) return null
    const tally = weekTally(S, today)
    const todayIds = effectiveRoutineIds(S, today)
    const todayName = todayIds.map(id => S.routines.find(r => r.id === id)?.name).filter(Boolean).join(' + ')
    const doneToday = S.workouts.some(w => w.d === today)
    const week = periodReport(S, 'week', today, ws)
    const last = periodReport(S, 'lastWeek', today, ws)
    // This week's top finding, or last week's while this one is young.
    const top = highlightsFor(S, week, { max: 1 })[0] || highlightsFor(S, last, { max: 1 })[0] || null
    const tr = weightTrend(S, { today })
    // Block 3's lines: the target streak, the goal nearest done, and a milestone just earned or next.
    const streak = targetStreak(S, weeklyTarget(S, today), { today })
    const goal = nearestGoal(S, { today })
    const ms = S.showMilestones === false ? null : milestonesView(S, { today, max: 1 })
    const milestone = ms?.recent[0] ? { fresh: true, m: ms.recent[0] } : ms?.next[0] ? { fresh: false, m: ms.next[0] } : null
    return { tally, todayName, doneToday, last: last.cur, top, tr, streak, goal, milestone }
  }, [S, today, ws])
  if (!data) return null
  const { tally, todayName, doneToday, last, top, tr, streak, goal, milestone } = data
  const pips = Math.max(tally.planned, tally.done)
  const w = top && wordsOf(top, S)
  const tone = top && (TONE[top.id] || TONE.records)
  const unit = S.unit === 'lb' ? 'lb' : 'kg'

  return <div className="card tappable" data-week-card {...tappable(() => nav('/insights'))}>
    <div className="row between">
      <h2 style={{ margin: 0 }}>{t('This week')}</h2>
      <div className="row" style={{ gap: 8 }}>
        <span className="small dim">{tally.planned ? t('{0} of {1}', tally.done, tally.planned) : t('Workouts this week: {0}', tally.done)}</span>
        <Icon name="chevronRight" className="chev" />
      </div>
    </div>
    {pips > 0 && pips <= 14 && <div className="fc-pips" style={{ marginTop: 8 }} aria-hidden="true">
      {Array.from({ length: pips }, (_, i) => <i key={i} className={i < tally.done ? 'on' : ''} />)}
    </div>}
    <div className="wk-lines">
      {todayName && <div className="small"><Icon name={doneToday ? 'checkCircle' : 'calendar'} /> {doneToday ? t('Today: {0}, done', todayName) : t('Today: {0}', todayName)}</div>}
      <div className="small muted"><Icon name="history" /> {t('Last week · workouts: {0} · PRs: {1}', last.workouts, last.prs)}</div>
      {w && <div className="small" data-week-highlight={top.id}><span className="wk-dot" style={{ background: tone.bg }} /> {w.title}</div>}
      {tr.ok && <div className="small muted" data-week-weight><Icon name="scale" /> {tr.direction === 'flat'
        ? t('Trend weight {0}, holding steady', fmtNum(tr.trend) + ' ' + unit)
        : t('Trend weight {0}, {1} a week', fmtNum(tr.trend) + ' ' + unit, (tr.perWeek < 0 ? '−' : '+') + fmtNum(Math.abs(tr.perWeek)))}</div>}
      {streak?.weeks > 0 && <div className="small muted" data-week-streak><Icon name="target" /> {t('{0}-week target streak', streak.weeks)}</div>}
      {goal && <div className="small muted" data-week-goal><Icon name="flag" /> {t('Goal: {0}', goalTitle(goal, S))} · {goalShort(goal)}</div>}
      {milestone && <div className="small muted" data-week-milestone><Icon name="medal" /> {milestone.fresh
        ? t('New milestone: {0}', milestoneTitle(milestone.m))
        : t('Next milestone: {0} · {1}', milestoneTitle(milestone.m), milestoneProgress(milestone.m))}</div>}
    </div>
  </div>
}
