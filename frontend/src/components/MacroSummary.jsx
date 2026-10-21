import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'

// Today's numbers against the targets: calories left as the big number, then protein, carbs and
// fat as bars (Nutrition → Today and the Home card). Going over is a plain number in the same
// colours, never red and never a warning; with Hide calories on, protein leads and calories go.

function Bar({ label, value, target, color }) {
  const pct = target > 0 ? Math.min(100, value / target * 100) : 0
  return <div className="nt-bar" data-macro={label}>
    <div className="nt-bar-l"><span>{label}</span><span className="dim">{fmtNum(Math.round(value))} / {fmtNum(target)} g</span></div>
    <div className="nt-bar-t"><span style={{ width: pct + '%', background: color }} /></div>
  </div>
}

export default function MacroSummary({ tg, totals, hideCalories = false, fibre = false }) {
  const left = tg.kcal - totals.k
  return <div className="nt-sum" data-macro-summary>
    {hideCalories
      ? <div className="nt-big"><b>{fmtNum(Math.round(totals.p))}</b> <span className="muted">{t('of {0} g protein', fmtNum(tg.protein))}</span></div>
      : <div className="nt-big">
        <b>{fmtNum(Math.abs(left))}</b> <span className="muted">{left >= 0 ? t('kcal left') : t('kcal over')}</span>
        <div className="small dim">{t('{0} of {1} kcal', fmtNum(totals.k), fmtNum(tg.kcal))}</div>
      </div>}
    {!hideCalories && <Bar label={t('Protein')} value={totals.p} target={tg.protein} color="var(--acc)" />}
    <Bar label={t('Carbs')} value={totals.c} target={tg.carbs} color="var(--blue)" />
    <Bar label={t('Fat')} value={totals.fa} target={tg.fat} color="var(--orange)" />
    {fibre && totals.fb > 0 && <div className="small dim" style={{ marginTop: 6 }}>{t('Fibre: {0} g', fmtNum(totals.fb))}</div>}
  </div>
}
