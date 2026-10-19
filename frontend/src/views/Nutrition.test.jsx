// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, freshState, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Nutrition from './Nutrition.jsx'
import NutritionCard from '../components/NutritionCard.jsx'
import { buildDemoState } from '../lib/demoSeed.js'
import { loadFoods } from '../lib/foods.js'
import { todayISO } from '../lib/format.js'
import { dayTotals, entriesOn } from '../lib/food-log.js'

const navSpy = vi.fn()
const route = vi.hoisted(() => ({ state: null }))
vi.mock('react-router-dom', () => ({ useNavigate: () => navSpy, useLocation: () => ({ state: route.state }) }))
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
// The sheet on top, rendered the way the app's sheet host renders it.
function topSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})
const settle = async () => { await act(async () => { await loadFoods(); await new Promise(r => setTimeout(r, 0)) }) }
const blank = () => JSON.parse(JSON.stringify(DEF))

beforeEach(() => {
  navSpy.mockClear()
  route.state = null
  localStorage.clear()
  useUI.setState({ sheets: [] })
  useStore.setState({ S: buildDemoState(), user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Nutrition screen', () => {
  it('shows the day against the targets, meal by meal', async () => {
    const host = mount(<Nutrition />)
    await settle()
    expect(host.querySelector('[data-macro-summary]').textContent).toMatch(/kcal (left|over)/)
    expect(host.querySelectorAll('[data-meal]').length).toBe(4)
    expect(host.textContent).toContain('Day complete')
    expect(host.textContent).toContain('USDA')
  })

  it('steps back a day and not past today', async () => {
    const host = mount(<Nutrition />)
    await settle()
    const next = host.querySelector('[aria-label="Next day"]')
    expect(next.disabled).toBe(true)
    act(() => host.querySelector('[aria-label="Previous day"]').click())
    expect(host.querySelector('[aria-label="Next day"]').disabled).toBe(false)
    // yesterday was logged in the demo, so its meals list foods
    expect(host.querySelectorAll('[data-entry]').length).toBeGreaterThan(3)
  })

  it('logs a food found by its everyday name', async () => {
    const before = dayTotals(useStore.getState().S, todayISO()).k
    const host = mount(<Nutrition />)
    await settle()
    act(() => host.querySelector('[data-meal="0"] [aria-label="Add food"]').click())
    const sheet = topSheet()
    await settle()
    type(sheet.querySelector('input'), 'dahi')
    const first = sheet.querySelector('[data-food]')
    expect(first.dataset.food).toBe('u:01116')
    act(() => first.click())
    expect(sheet.querySelector('[data-food-amount="u:01116"]')).toBeTruthy()
    act(() => button(sheet, 'Add').click())
    const S = useStore.getState().S
    const added = entriesOn(S, todayISO()).find(e => e.f === 'u:01116' && e.m === 0)
    expect(added).toMatchObject({ s: 'katori', x: 1, g: 150, k: 92 })
    expect(dayTotals(S, todayISO()).k).toBe(before + 92)
  })

  it('quick-adds calories, working them out from the macros when left empty', async () => {
    const host = mount(<Nutrition />)
    await settle()
    act(() => host.querySelector('[data-meal="3"] [aria-label="Add food"]').click())
    const sheet = topSheet()
    act(() => button(sheet, 'Quick add').click())
    const fields = sheet.querySelectorAll('[data-quick-add] input')
    type(fields[0], 'Protein bar')
    type(fields[2], '20')
    type(fields[3], '25')
    type(fields[4], '8')
    act(() => button(sheet, 'Add').click())
    const e = entriesOn(useStore.getState().S, todayISO()).find(x => x.n === 'Protein bar')
    expect(e).toMatchObject({ f: 'q', m: 3, k: 252, p: 20, c: 25, fa: 8 })
  })

  it('marks a day complete', async () => {
    const host = mount(<Nutrition />)
    await settle()
    const sw = [...host.querySelectorAll('[role="switch"], .switch, input[type="checkbox"]')].at(-1)
    act(() => sw.click())
    expect(useStore.getState().S.foodDays[todayISO()]).toMatchObject({ done: true })
  })

  it('offers setup before anything else on a profile that never set it up', () => {
    useStore.setState({ S: blank() })
    const host = mount(<Nutrition />)
    expect(host.querySelector('[data-nutrition-intro]')).toBeTruthy()
    act(() => button(host, 'Set my targets').click())
    expect(useUI.getState().sheets.length).toBe(1)
  })
})

describe('Nutrition setup', () => {
  it('saves targets once the body is known, and shows the maths', () => {
    const S = blank()
    S.bodyweight = [{ d: '2026-10-18', w: 78.3 }]
    useStore.setState({ S })
    const host = mount(<Nutrition />)
    act(() => button(host, 'Set my targets').click())
    const sheet = topSheet()
    expect(button(sheet, 'Start tracking').disabled).toBe(true)
    type(sheet.querySelector('[aria-label="Height"]'), '178')
    type(sheet.querySelector('[aria-label="Birth year"]'), '1994')
    act(() => button(sheet, 'Male').click())
    expect(sheet.querySelector('[data-target-maths]').textContent).toContain('Mifflin-St Jeor')
    act(() => button(sheet, 'Start tracking').click())
    expect(useStore.getState().S.nutrition).toMatchObject({ sex: 'male', heightCm: 178, birthYear: 1994 })
  })
})

describe('Home card', () => {
  it('shows today\'s numbers once set up', () => {
    const host = mount(<NutritionCard />)
    expect(host.querySelector('[data-nutrition-card]')).toBeTruthy()
    expect(host.querySelector('[data-macro-summary]')).toBeTruthy()
  })

  it('stays away from a profile saved before it existed, and offers setup on a new one', () => {
    useStore.setState({ S: blank() })
    expect(mount(<NutritionCard />).querySelector('[data-nutrition-card]')).toBeNull()
    useStore.setState({ S: freshState() })
    const host = mount(<NutritionCard />)
    expect(host.querySelector('[data-nutrition-card="offer"]')).toBeTruthy()
    act(() => button(host, 'Not now').click())
    expect(useStore.getState().S.showNutritionCard).toBe(false)
  })

  it('hides calories when asked, leading with protein', () => {
    const S = buildDemoState()
    S.nutrition.hideCalories = true
    useStore.setState({ S })
    const host = mount(<NutritionCard />)
    expect(host.textContent).toContain('g protein')
    expect(host.textContent).not.toMatch(/kcal/)
  })
})

describe('Nutrition → Week', () => {
  it('opens on Week from the Home note, with the check-in, the last 7 days and nothing applied yet', () => {
    route.state = { tab: 'week' }
    const host = mount(<Nutrition />)
    const ci = host.querySelector('[data-checkin]')
    expect(['suggest', 'on-track']).toContain(ci.dataset.checkin)
    expect(ci.textContent).toContain('Your maintenance, about')
    expect(host.querySelector('[data-week-days]').textContent).toContain('Protein days')
    expect(host.querySelectorAll('.wk-bar').length).toBe(7)
    expect(host.querySelector('[data-checkin-history]')).toBeNull()
  })

  it('records an answer, shows it in the history and waits a week for the next', () => {
    route.state = { tab: 'week' }
    const host = mount(<Nutrition />)
    const ci = host.querySelector('[data-checkin]')
    act(() => (button(ci, 'Done') || button(ci, 'Keep current')).click())
    expect(Object.keys(useStore.getState().S.nutritionCheckins)).toHaveLength(1)
    expect(host.querySelector('[data-checkin="later"]').textContent).toContain('7 days')
    expect(host.querySelector('[data-checkin-history]').textContent).toContain('Kept')
  })

  it('applies a suggestion only on a tap, and the target follows it', () => {
    // a log that eats well under the formula while the weight holds: maintenance reads lower
    const S = buildDemoState()
    for (const e of Object.values(S.foodLog)) if (e.k) e.k = Math.round(e.k * 0.8)
    useStore.setState({ S: { ...S, unit: 'kg' } })
    route.state = { tab: 'week' }
    const host = mount(<Nutrition />)
    const ci = host.querySelector('[data-checkin="suggest"]')
    expect(ci.textContent).toMatch(/Suggested target: [\d,]+ kcal, now [\d,]+/)
    act(() => button(ci, 'Apply').click())
    const after = useStore.getState().S
    expect(after.nutrition.maintenance.kcal).toBeGreaterThan(0)
    expect(Object.values(after.nutritionCheckins)[0].applied).toBe(true)
  })

  it('puts a one-line note on the Home card when the check-in is ready', () => {
    const host = mount(<NutritionCard />)
    const note = host.querySelector('[data-checkin-note]')
    expect(note.textContent).toContain('Your weekly check-in is ready')
    act(() => note.click())
    expect(navSpy).toHaveBeenCalledWith('/nutrition', { state: { tab: 'week' } })
  })
})
