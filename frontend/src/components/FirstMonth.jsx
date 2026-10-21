import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { firstMonthSteps, showFirstMonth } from '../lib/onboarding.js'
import { effortOf } from '../lib/history.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { bwSheet } from '../sheets.jsx'
import { goalEditSheet } from './Goals.jsx'
import Icon from './Icon.jsx'

// The first-month checklist on Home (lib/onboarding.js). Each step opens the place it is done in;
// the × puts the card away for good.
export default function FirstMonth() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  if (!showFirstMonth(S)) return null
  const steps = firstMonthSteps(S)
  const left = steps.filter(s => !s.done).length
  const STEP = {
    workout: [t('Log your first workout'), () => nav('/workout')],
    goal: [t('Set a goal'), () => goalEditSheet()],
    effort: [t('Rate the effort of one set'), () => nav(effortOf(S) === 'none' ? '/settings/workout' : '/workout')],
    threeInWeek: [t('Train 3 times in one week'), () => nav('/plan')],
    weighTwice: [t('Weigh in twice'), () => bwSheet()],
    pr: [t('Hit your first PR'), () => nav('/records')],
  }
  return <div className="card" data-first-month>
    <div className="row between" style={{ alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0 }}>{t('Your first month')}</h2>
        <div className="muted small" style={{ marginTop: 2 }}>{t('Small wins that make the rest of the app useful. Steps left: {0}', left)}</div>
      </div>
      <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15, flexShrink: 0 }} aria-label={t('Dismiss')}
        onClick={() => update(s => { s.hints = { ...(s.hints || {}), firstMonthDone: true } })}><Icon name="xmark" /></button>
    </div>
    <div style={{ marginTop: 6 }}>{steps.map(s => <div key={s.key} className={'ob-step' + (s.done ? ' done' : ' tappable')} data-step={s.key}
      {...(s.done ? {} : tappable(STEP[s.key][1]))}>
      <Icon name={s.done ? 'checkCircle' : 'dot'} style={{ color: s.done ? 'var(--green)' : 'var(--label-3)', fontSize: 18 }} />
      <span className="ob-t">{STEP[s.key][0]}</span>
      {!s.done ? <Icon name="chevronRight" className="chev" /> : <span />}
    </div>)}</div>
  </div>
}
