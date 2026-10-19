// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DEF, freshState, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Nutrition from './Nutrition.jsx'
import NutritionCard from '../components/NutritionCard.jsx'
import FinishContext from '../components/FinishContext.jsx'
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

describe('Nutrition tips', () => {
  it('shows today\'s session protein tip, hides it for the day on ×, and none when switched off', async () => {
    // the demo always has a session planned today (a rest day gets the next routine moved onto it)
    const host = mount(<Nutrition />)
    await settle()
    const tip = host.querySelector('[data-tip="training"]')
    expect(tip.textContent).toMatch(/today\. A protein-rich meal before and after helps/)
    act(() => tip.querySelector('[aria-label="Hide for today"]').click())
    expect(host.querySelector('[data-tip="training"]')).toBeNull()
    localStorage.clear()
    const S = useStore.getState().S
    useStore.setState({ S: { ...S, nutrition: { ...S.nutrition, tips: false } } })
    expect(mount(<Nutrition />).querySelector('[data-tip]')).toBeNull()
  })

  it('adds protein so far today to the finish summary', () => {
    // a meal logged today, whatever the hour the test runs at
    const S0 = useStore.getState().S
    const S = { ...S0, foodLog: { ...S0.foodLog, zz: { d: todayISO(), m: 0, f: 'q', k: 400, p: 40, c: 30, fa: 10, _ts: 1 } } }
    const w = S.workouts.at(-1)
    const host = mount(<FinishContext st={S} w={w} />)
    expect(host.querySelector('[data-finish-protein]').textContent).toMatch(/Protein so far today: \d+ of \d+ g/)
  })
})

describe('Meal plan', () => {
  const planTab = async () => {
    route.state = { tab: 'plan' }
    const host = mount(<Nutrition />)
    await settle()
    return host
  }

  it('lists the week of the demo plan with each day against the target', async () => {
    const host = await planTab()
    const days = host.querySelectorAll('[data-plan-day]')
    expect(days.length).toBe(7)
    expect(days[0].textContent).toMatch(/[\d,]+ kcal · P \d+ g/)
    expect(host.querySelector('[data-plan-default]').textContent).toContain('Default plan')
  })

  it('opens a day, adds a food to a meal from the picker, and the plan keeps it', async () => {
    const host = await planTab()
    act(() => host.querySelector('[data-plan-day="1"]').click())
    const editor = topSheet()
    await settle()
    const before = useStore.getState().S.mealPlans['demo-plan'].days['1'][3].length
    const loggedBefore = Object.keys(useStore.getState().S.foodLog).length
    act(() => editor.querySelector('[data-plan-meal="3"] [aria-label="Add food"]').click())
    const picker = topSheet()
    await settle()
    type(picker.querySelector('input'), 'banana')
    act(() => picker.querySelector('[data-food]').click())
    act(() => button(picker, 'Add').click())
    const after = useStore.getState().S.mealPlans['demo-plan'].days['1'][3]
    expect(after.length).toBe(before + 1)
    expect(after.at(-1)).toMatchObject({ f: 'u:09040', s: 'medium', x: 1, n: 'Banana' })
    // nothing was logged: picking for a plan is not logging
    expect(Object.keys(useStore.getState().S.foodLog)).toHaveLength(loggedBefore)
  })

  it('makes a starter week scaled to the target and uses it by default', async () => {
    const S = buildDemoState()
    useStore.setState({ S: { ...S, unit: 'kg', mealPlans: {}, nutrition: { ...S.nutrition, plan: null } } })
    const host = await planTab()
    act(() => button(host, 'New meal plan').click())
    const sheet = topSheet()
    await settle()
    act(() => sheet.querySelector('[data-new-plan="veg"]').click())
    const S2 = useStore.getState().S
    const [id] = Object.keys(S2.mealPlans)
    expect(S2.mealPlans[id].name).toBe('Vegetarian Indian')
    expect(S2.nutrition.plan).toBe(id)
    expect(Object.keys(S2.mealPlans[id].days)).toHaveLength(7)
  })

  it('builds the grocery list for the next 7 days, ticks items and keeps the ticks', async () => {
    const host = await planTab()
    act(() => button(host, 'Grocery list').click())
    const sheet = topSheet()
    await settle()
    expect(sheet.querySelectorAll('[data-grocery-section]').length).toBeGreaterThan(3)
    expect(sheet.textContent).toContain('Atta (whole wheat flour)')
    act(() => sheet.querySelector('[role="checkbox"]').click())
    expect(Object.keys(Object.values(useStore.getState().S.groceryTicks)[0].items)).toHaveLength(1)
  })

  it('switches one date to no plan from the month view', async () => {
    const host = await planTab()
    act(() => button(host, 'Month view').click())
    const month = topSheet()
    act(() => month.querySelector(`[data-month-day="${todayISO()}"]`).click())
    const pick = topSheet()
    act(() => button(pick, 'No plan this day').click())
    expect(useStore.getState().S.mealDays[todayISO()].plan).toBe('none')
  })

  it('logs a planned meal from Today in one tap', async () => {
    // a fresh day: nothing logged yet today
    const S = buildDemoState()
    const foodLog = Object.fromEntries(Object.entries(S.foodLog).filter(([, e]) => e.d !== todayISO()))
    useStore.setState({ S: { ...S, unit: 'kg', foodLog } })
    const host = mount(<Nutrition />)
    await settle()
    const planned = host.querySelector('[data-planned-meal="0"]')
    expect(planned.textContent).toContain('Planned:')
    act(() => button(planned, 'Log as planned').click())
    expect(entriesOn(useStore.getState().S, todayISO()).filter(e => e.m === 0).length).toBeGreaterThan(0)
  })

  it('shows the next planned meal on the Home card', () => {
    const S = buildDemoState()
    const foodLog = Object.fromEntries(Object.entries(S.foodLog).filter(([, e]) => e.d !== todayISO()))
    useStore.setState({ S: { ...S, unit: 'kg', foodLog } })
    const host = mount(<NutritionCard />)
    expect(host.querySelector('[data-next-planned]').textContent).toMatch(/Next: /)
  })
})
