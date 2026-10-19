import { useState } from 'react'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { tipsFor } from '../lib/nutrition-tips.js'
import Icon from './Icon.jsx'

// One nutrition tip at a time on Nutrition → Today (lib/nutrition-tips.js). × hides it for the
// day on this device: a viewing convenience, so it lives in this browser, not in the profile.
const KEY = 'gym_tips_dismissed'
const readDismissed = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} } }
const writeDismissed = v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private window: hidden for this visit */ } }

const TEXT = {
  training: d => t('{0} today. A protein-rich meal before and after helps; the day’s total matters most.', d.name),
  fibre: d => t('Fibre has been under {0} g for 3 days. Dal, fruit or vegetables add some easily.', d.floor),
}
const ICON = { training: 'dumbbell', fibre: 'carrot' }

export default function NutritionTip({ S }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const today = todayISO()
  const tip = tipsFor(S, { today, dismissed })[0]
  if (!tip) return null
  const hide = () => {
    // only today's dismissals are worth keeping
    const next = Object.fromEntries(Object.entries({ ...dismissed, [tip.id]: today }).filter(([, d]) => d === today))
    writeDismissed(next)
    setDismissed(next)
  }
  return <div className="card nt-tip" data-tip={tip.id}>
    <span className="lrow-i" style={{ background: 'var(--teal)', color: '#000' }}><Icon name={ICON[tip.id]} /></span>
    <div className="grow small">{TEXT[tip.id](tip.data)}</div>
    <button className="iconbtn" aria-label={t('Hide for today')} onClick={hide}><Icon name="xmark" /></button>
  </div>
}
