// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Insights from './Insights.jsx'
import WeekCard from '../components/WeekCard.jsx'
import FinishContext from '../components/FinishContext.jsx'
import FirstMonth from '../components/FirstMonth.jsx'
import { buildDemoState } from '../lib/demoSeed.js'
import { goalsOf } from '../lib/goals.js'
import { todayISO } from '../lib/format.js'

const navSpy = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navSpy, useLocation: () => ({ state: null }) }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
function topSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const blank = () => JSON.parse(JSON.stringify(DEF))
const S = () => useStore.getState().S

beforeEach(() => {
  navSpy.mockClear()
  localStorage.clear()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: buildDemoState(), user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Goals in Insights', () => {
  it('lists each goal with where it stands, the body-weight goal beside them', () => {
    const card = mount(<Insights />).querySelector('[data-goals]')
    const rows = [...card.querySelectorAll('[data-goal]')]
    expect(rows.map(r => r.dataset.goal)).toEqual(['lift', 'freq', 'measure', 'weight'])
    expect(rows[0].textContent).toMatch(/Barbell Bench Press · 100 kg × 1/i)
    expect(rows[0].textContent).toMatch(/Est\. 1RM [\d.]+ of 100 kg/)
    expect(rows[1].textContent).toMatch(/This week \d of 3 · hit \d+ of the last \d+ weeks/)
    expect(rows[2].textContent).toMatch(/Waist · 80 cm/)
    expect(rows[3].textContent).toMatch(/Body weight · 77 kg/)
  })

  it('adds a measurement goal from the latest check-in', () => {
    const host = mount(<Insights />)
    act(() => button(host.querySelector('[data-goals]'), 'Add a goal').click())
    let sheet = topSheet()
    act(() => button(sheet, 'Measurement').click())
    sheet = document.body.lastChild
    expect(sheet.textContent).toMatch(/Latest: [\d.]+ cm on/)
    const before = goalsOf(S()).length
    type(sheet.querySelector('[aria-label="Target"]'), '81')
    act(() => button(sheet, 'Save goal').click())
    const goals = goalsOf(S())
    expect(goals.length).toBe(before + 1)
    expect(goals.at(-1)).toMatchObject({ kind: 'measure', field: 'waist', target: 81, from: todayISO() })
  })

  it('will not save a lift goal without an exercise, and removes a goal', () => {
    const host = mount(<Insights />)
    act(() => button(host.querySelector('[data-goals]'), 'Add a goal').click())
    expect(button(topSheet(), 'Save goal').disabled).toBe(true)
    act(() => useUI.setState({ sheets: [] }))
    act(() => host.querySelector('[data-goal="freq"]').click())
    const edit = topSheet() // mounted outside act: inside one, its render waits for the act to end
    act(() => button(edit, 'Remove goal').click())
    expect(goalsOf(S()).some(g => g.kind === 'freq')).toBe(false)
  })
})

describe('Milestones and the target streak in Insights', () => {
  it('shows milestones earned with their dates and the next ones with progress', () => {
    const card = mount(<Insights />).querySelector('[data-milestones]')
    expect(card.querySelectorAll('[data-milestone]').length).toBeGreaterThan(0)
    expect(card.querySelector('[data-milestone="workouts:1"]') || button(card, 'Show all ' + card.textContent.match(/Show all (\d+)/)?.[1])).toBeTruthy()
    expect(card.querySelectorAll('[data-next]').length).toBeGreaterThan(0)
    expect(card.textContent).toMatch(/Bench press at 1\.25× body weight/)
  })

  it('goes away with the switch, and drops the strength markers on their own', () => {
    useStore.setState({ S: { ...S(), showStrengthMarkers: false } })
    expect(mount(<Insights />).querySelector('[data-milestones]').textContent).not.toMatch(/body weight/)
    useStore.setState({ S: { ...S(), showMilestones: false } })
    expect(mount(<Insights />).querySelector('[data-milestones]')).toBeNull()
  })

  it('shows the target streak beside the week streak', () => {
    const card = mount(<Insights />).querySelector('[data-consistency]')
    expect(card.textContent).toMatch(/\d+-week target streak/)
    expect(card.textContent).toMatch(/Weeks with 3 or more sessions/)
    expect(card.textContent).toMatch(/Your week streak \(\d+\)/)
  })
})

describe('Home and the finish screen', () => {
  it('puts the nearest goal and a milestone on the This week card', () => {
    const card = mount(<WeekCard />)
    expect(card.querySelector('[data-week-goal]').textContent).toMatch(/Goal: Barbell Bench Press · 100 kg × 1 · \d+%/i)
    expect(card.querySelector('[data-week-milestone]').textContent).toMatch(/(New|Next) milestone: /)
  })

  it('names a goal and the milestones the workout reached', () => {
    const S0 = S()
    const w = { id: 'big-day', d: todayISO(), start: Date.now() - 3600000, end: Date.now(), prs: ['0025'],
      entries: [{ id: '0025', target: { mode: 'reps' }, sets: [{ w: 100, r: 1, done: true }] }] }
    const st = { ...S0, workouts: [...S0.workouts, w] }
    const host = mount(<FinishContext st={st} w={w} />)
    expect(host.querySelector('[data-finish-goal]').textContent).toMatch(/Goal reached: Barbell Bench Press · 100 kg × 1/i)
    expect(host.querySelectorAll('[data-finish-milestone]').length).toBeGreaterThan(0)
  })
})

describe('first-month checklist', () => {
  it('walks a new lifter through six steps, and goes when dismissed', () => {
    const fresh = { ...blank(), routines: [{ id: 'r1', name: 'Full body', ex: [] }] }
    useStore.setState({ S: fresh })
    const host = mount(<FirstMonth />)
    expect(host.querySelectorAll('[data-step]').length).toBe(6)
    act(() => host.querySelector('[data-step="pr"]').click())
    expect(navSpy).toHaveBeenCalledWith('/records')
    act(() => host.querySelector('[aria-label="Dismiss"]').click())
    expect(S().hints.firstMonthDone).toBe(true)
    expect(host.querySelector('[data-first-month]')).toBeNull()
  })

  it('never shows for a profile with months of training', () => {
    expect(mount(<FirstMonth />).querySelector('[data-first-month]')).toBeNull()
  })
})
