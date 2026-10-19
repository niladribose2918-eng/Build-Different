// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Insights from './Insights.jsx'
import Records from './Records.jsx'
import Stats from './Stats.jsx'
import WeekCard from '../components/WeekCard.jsx'
import { freshState } from '../store/useStore.js'
import { buildDemoState } from '../lib/demoSeed.js'

const navSpy = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navSpy }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []
function render(View) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<View />))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)

beforeEach(() => {
  navSpy.mockClear()
  localStorage.clear()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: buildDemoState(), user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Insights view', () => {
  it('shows the period tiles, the highlights and the lifts that moved for the demo history', () => {
    const host = render(Insights)
    act(() => button(host, 'Last week').click())
    const tiles = host.querySelector('[data-insights-tiles]')
    expect(tiles.textContent).toContain('Workouts')
    expect(tiles.textContent).toContain('Working sets')
    expect(host.querySelectorAll('[data-highlight]').length).toBeGreaterThan(0)
    expect(host.querySelectorAll('[data-highlight]').length).toBeLessThanOrEqual(3)
    expect(host.querySelector('[data-highlight="records"]')).toBeTruthy()
    expect(host.querySelector('[data-lifts-moved]')).toBeTruthy()
  })

  it('explains a highlight when it is tapped', () => {
    const host = render(Insights)
    act(() => button(host, 'Last week').click())
    const row = host.querySelector('[data-highlight="records"]')
    expect(row.textContent).not.toContain('PR badges earned')
    act(() => row.click())
    expect(row.textContent).toContain('PR badges earned on workouts in this period.')
  })

  it('remembers the period picked, on this device', () => {
    const host = render(Insights)
    act(() => button(host, 'Last month').click())
    expect(localStorage.getItem('gym_insights_period')).toBe('lastMonth')
  })

  it('opens the Records board', () => {
    const host = render(Insights)
    act(() => button(host, 'Open').click())
    expect(navSpy).toHaveBeenCalledWith('/records')
  })

  it('says what will appear before the first workout', () => {
    useStore.setState({ S: JSON.parse(JSON.stringify(DEF)) })
    const host = render(Insights)
    expect(host.textContent).toContain('Finish your first workout and your insights will show up here.')
    expect(host.querySelector('[data-insights-tiles]')).toBeNull()
  })
})

describe('Insights → Nutrition', () => {
  it('shows the period\'s food against its targets, with a bar per day', () => {
    const host = render(Insights)
    act(() => button(host, 'Last week').click())
    const card = host.querySelector('[data-nutrition-insights]')
    expect(card.textContent).toContain('Avg calories')
    expect(card.textContent).toMatch(/Protein days\d+ \/ 7/)
    expect(card.querySelectorAll('.wk-bar').length).toBe(7)
  })

  it('stays away without Nutrition', () => {
    useStore.setState({ S: { ...buildDemoState(), nutrition: null } })
    expect(render(Insights).querySelector('[data-nutrition-insights]')).toBeNull()
  })
})

describe('Insights → Body', () => {
  it('shows the trend, the pace and the goal date for the demo weigh-ins', () => {
    const host = render(Insights)
    const card = host.querySelector('[data-weight-trend]')
    expect(card.textContent).toContain('Trend weight')
    expect(['gentle', 'steady']).toContain(card.querySelector('[data-verdict]').dataset.verdict)
    expect(card.querySelector('[data-rate]').textContent).toMatch(/kg a week · [\d.]+% of body weight/)
    expect(card.querySelector('[data-goal]').textContent).toMatch(/Goal 77 kg/)
  })

  it('reads the demo measurements as fat lost with muscle kept', () => {
    const host = render(Insights)
    const card = host.querySelector('[data-body-comp]')
    expect(card.textContent).toContain('Fat mass')
    expect(card.textContent).toContain('Lean mass')
    expect(card.querySelector('[data-reading="fatLoss"]').textContent).toContain('fat loss with muscle kept')
    expect(card.querySelector('[data-whtr]').textContent).toContain('Waist-to-height')
  })

  it('says what to log before there is anything to read', () => {
    useStore.setState({ S: JSON.parse(JSON.stringify(DEF)) })
    const host = render(Insights)
    expect(host.querySelector('[data-weight-trend="waiting"]')).toBeTruthy()
    expect(host.querySelector('[data-body-comp="empty"]')).toBeTruthy()
  })
})

describe('Records view', () => {
  it('lists every trained exercise and narrows by search', () => {
    const host = render(Records)
    const all = host.querySelectorAll('.list .item').length
    expect(all).toBeGreaterThan(10)
    const input = host.querySelector('input')
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(input, 'bench')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const narrowed = host.querySelectorAll('.list .item').length
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(all)
  })

  it('opens an exercise\'s full record, rep table included, in a sheet', () => {
    const host = render(Records)
    const bench = [...host.querySelectorAll('.list .item')].find(el => /bench press/i.test(el.textContent) && !/incline|close|dumbbell/i.test(el.textContent))
    act(() => bench.click())
    expect(useUI.getState().sheets.length).toBe(1)
  })
})

describe('Stats', () => {
  it('links to Insights once there is a workout', () => {
    const host = render(Stats)
    const card = host.querySelector('[data-insights-link]')
    expect(card).toBeTruthy()
    act(() => [...card.querySelectorAll('button')].find(b => b.textContent.includes('Open')).click())
    expect(navSpy).toHaveBeenCalledWith('/insights')
  })
})

describe('This week on Home', () => {
  it('shows the week, last week, the top highlight and the weight trend, and opens Insights', () => {
    useStore.setState({ S: { ...buildDemoState(), unit: 'kg', showWeekCard: true } })
    const host = render(WeekCard)
    const card = host.querySelector('[data-week-card]')
    expect(card.textContent).toContain('This week')
    expect(card.textContent).toMatch(/Last week · workouts: \d+ · PRs: \d+/)
    expect(card.querySelector('[data-week-highlight]')).toBeTruthy()
    expect(card.querySelector('[data-week-weight]').textContent).toMatch(/Trend weight [\d.]+ kg/)
    act(() => card.click())
    expect(navSpy).toHaveBeenCalledWith('/insights')
  })

  it('stays off a profile saved before it existed, and is on for a new one', () => {
    useStore.setState({ S: JSON.parse(JSON.stringify(DEF)) })
    expect(render(WeekCard).querySelector('[data-week-card]')).toBeNull()
    useStore.setState({ S: freshState() })
    expect(render(WeekCard).querySelector('[data-week-card]')).toBeTruthy()
  })

  it('can be added to Home from Insights in one tap', () => {
    useStore.setState({ S: { ...buildDemoState(), showWeekCard: false } })
    const host = render(Insights)
    act(() => button(host.querySelector('[data-add-week-card]'), 'Add to Home').click())
    expect(useStore.getState().S.showWeekCard).toBe(true)
    expect(host.querySelector('[data-add-week-card]')).toBeNull()
  })
})
