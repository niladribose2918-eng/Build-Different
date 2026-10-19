import { describe, it, expect } from 'vitest'
import { FOODS } from './foods-data.js'
import { toFood } from './foods.js'
import {
  plansOf, planOn, plannedOn, plannedTotals, logPlanned, planFromWeek, withPlan, withoutPlan, withMealDay,
  withPlanMeal, nextPlannedMeal, itemOf, itemsLine, dayKeyOf, mealsOfPlanDay,
} from './meal-plan.js'
import { TEMPLATES, starterPlan, scaleDay } from './meal-templates.js'
import { foodEntry, quickEntry, withEntry, entriesOn, dayTotals } from './food-log.js'

const byKey = new Map(FOODS.map(r => toFood(r)).map(f => [f.key, f]))
const food = k => byKey.get(k)
const MON = '2026-10-19', TUE = '2026-10-20', SUN = '2026-10-25'
const roti = food('in:roti'), dal = food('in:toor-dal'), curd = food('u:01116')
const item = (f, portion, x) => itemOf(foodEntry({ food: f, portion: f.portions.find(p => p[0] === portion), count: x }), f.name)
const profile = (more = {}) => ({ unit: 'kg', nutrition: { plan: 'p1', meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'] }, mealPlans: {}, mealDays: {}, foodLog: {}, ...more })
const weekPlan = {
  name: 'Training week', mode: 'week',
  days: { 1: [[item(curd, 'katori', 1)], [item(roti, 'roti', 3), item(dal, 'katori', 1)], [], []], 2: [[], [item(dal, 'katori', 2)], [], []] },
}

describe('meal plans', () => {
  it('stores food references and amounts only, never nutrient copies', () => {
    const it = item(roti, 'roti', 3)
    expect(it).toEqual({ f: 'in:roti', g: 120, s: 'roti', x: 3, n: 'Roti / chapati' })
    expect(itemOf(quickEntry({ kcal: 300, p: 20, name: 'Bar' }))).toEqual({ f: 'q', n: 'Bar', k: 300, p: 20, c: 0, fa: 0 })
  })

  it('reads the plan for a date: the one-off choice first, then the default', () => {
    const S = profile({ mealPlans: withPlan(withPlan({}, weekPlan, 'p1', 1), { ...weekPlan, name: 'Travel' }, 'p2', 1) })
    expect(plansOf(S).map(p => p.name)).toEqual(['Training week', 'Travel'])
    expect(planOn(S, MON)).toMatchObject({ id: 'p1', oneOff: false })
    S.mealDays = withMealDay(S.mealDays, TUE, 'p2', 2)
    expect(planOn(S, TUE)).toMatchObject({ id: 'p2', oneOff: true })
    S.mealDays = withMealDay(S.mealDays, SUN, 'none', 3)
    expect(planOn(S, SUN)).toBeNull()
    // back to the default
    S.mealDays = withMealDay(S.mealDays, TUE, null, 4)
    expect(planOn(S, TUE).id).toBe('p1')
    // a removed plan applies nowhere
    S.mealPlans = withoutPlan(S.mealPlans, 'p1', 5)
    expect(planOn(S, MON)).toBeNull()
  })

  it('works out a planned day from the food list, against nothing stored in the plan', () => {
    const S = profile({ mealPlans: withPlan({}, weekPlan, 'p1', 1) })
    const meals = plannedOn(S, MON)
    expect(meals.map(m => m.length)).toEqual([1, 2, 0, 0])
    const tot = plannedTotals(meals, food)
    expect(tot.k).toBe(Math.round(curd.kcal * 1.5) + Math.round(roti.kcal * 1.2) + Math.round(dal.kcal * 1.5))
    expect(tot.missing).toBe(0)
  })

  it('is the same every day in "same" mode', () => {
    const same = { name: 'Simple', mode: 'same', days: { all: [[item(curd, 'katori', 1)], [], [], []] } }
    const S = profile({ mealPlans: withPlan({}, same, 'p1', 1) })
    expect(dayKeyOf(same, MON)).toBe('all')
    expect(plannedOn(S, SUN)[0][0].f).toBe('u:01116')
  })

  it('logs a planned meal in one tap, with the numbers copied in at that moment', () => {
    const S = profile({ mealPlans: withPlan({}, weekPlan, 'p1', 1) })
    S.foodLog = logPlanned(S.foodLog, S, MON, 1, food)
    const logged = entriesOn(S, MON)
    expect(logged.map(e => [e.f, e.m, e.s, e.x])).toEqual([['in:roti', 1, 'roti', 3], ['in:toor-dal', 1, 'katori', 1]])
    expect(dayTotals(S, MON).k).toBe(Math.round(roti.kcal * 1.2) + Math.round(dal.kcal * 1.5))
  })

  it('names the next planned meal not yet logged, skipping a breakfast long past', () => {
    const S = profile({ mealPlans: withPlan({}, weekPlan, 'p1', 1) })
    expect(nextPlannedMeal(S, MON, 8)).toMatchObject({ meal: 0, name: 'Breakfast' })
    expect(nextPlannedMeal(S, MON, 12)).toMatchObject({ meal: 1, name: 'Lunch' })
    S.foodLog = logPlanned(S.foodLog, S, MON, 1, food)
    expect(nextPlannedMeal(S, MON, 12)).toBeNull()
    expect(itemsLine(weekPlan.days[1][1])).toBe('Roti / chapati, 3 roti · Toor dal (tadka), 1 katori')
  })

  it('turns last week into a plan from what was eaten each day', () => {
    let foodLog = withEntry({}, foodEntry({ food: roti, portion: roti.portions[0], count: 2, meal: 2, d: MON }), 'a', 1)
    foodLog = withEntry(foodLog, quickEntry({ kcal: 250, p: 20, name: 'Protein bar', meal: 3, d: MON }), 'b', 2)
    const S = profile({ foodLog })
    const plan = planFromWeek(S, MON, k => food(k)?.name)
    expect(plan.mode).toBe('week')
    expect(plan.days['1'][2]).toEqual([{ f: 'in:roti', g: 80, s: 'roti', x: 2, n: 'Roti / chapati' }])
    expect(plan.days['1'][3][0]).toMatchObject({ f: 'q', n: 'Protein bar', k: 250 })
    expect(Object.keys(plan.days)).toHaveLength(7)
  })

  it('edits one meal of one day, and folds extra meals into the last when the profile has fewer', () => {
    const p = withPlanMeal(weekPlan, '3', 0, [item(curd, 'katori', 1)], 4)
    expect(p.days['3'][0][0].f).toBe('u:01116')
    expect(p.days['1']).toBe(weekPlan.days['1'])
    const three = profile({ nutrition: { meals: ['Morning', 'Noon', 'Evening'] } })
    const folded = mealsOfPlanDay(three, { days: { 1: [[], [], [item(roti, 'roti', 1)], [item(curd, 'katori', 1)]] } }, '1')
    expect(folded.map(m => m.length)).toEqual([0, 0, 2])
  })
})

describe('starter weeks', () => {
  it('use only foods and portions the list has', () => {
    for (const [kind, tpl] of Object.entries(TEMPLATES)) {
      expect(tpl.week, kind).toHaveLength(7)
      for (const day of tpl.week) for (const meal of day) for (const [key, unit] of meal) {
        const f = food(key)
        expect(f, `${kind}: ${key}`).toBeTruthy()
        if (unit !== 'g') expect(f.portions.some(p => p[0] === unit), `${kind}: ${key} ${unit}`).toBe(true)
      }
    }
  })

  it('land every day within 10% of the target, from a light to a big appetite', () => {
    for (const kind of Object.keys(TEMPLATES)) for (const target of [1700, 2300, 3000]) {
      const plan = starterPlan(kind, target, food)
      for (const [key, meals] of Object.entries(plan.days)) {
        const k = plannedTotals(meals, food).k
        expect(Math.abs(k - target), `${kind} ${target} day ${key}: ${k}`).toBeLessThanOrEqual(target * 0.1)
      }
    }
  })

  it('serve amounts a kitchen can: whole rotis and eggs, half katoris', () => {
    const plan = starterPlan('nonveg', 2600, food)
    for (const it of Object.values(plan.days).flat(2)) {
      if (['roti', 'egg', 'slice', 'idli'].includes(it.s)) expect(Number.isInteger(it.x)).toBe(true)
      if (it.s === 'katori') expect(it.x * 2).toBe(Math.round(it.x * 2))
    }
  })

  it('give a lifter real protein: at least 1.2 g per kg at 78 kg on every non-veg and global day', () => {
    for (const kind of ['nonveg', 'global']) {
      const plan = starterPlan(kind, 2300, food)
      for (const meals of Object.values(plan.days)) expect(plannedTotals(meals, food).p).toBeGreaterThanOrEqual(94)
    }
  })

  it('scales a single day on its own', () => {
    const day = scaleDay(TEMPLATES.veg.week[0], 2000, food)
    expect(day).toHaveLength(4)
    expect(day.flat().every(it => it.n)).toBe(true)
  })
})

describe('the demo plan', () => {
  it('names every item the way the food list does, and plans every weekday', async () => {
    const { demoMealPlan } = await import('./demoSeed.js')
    const plan = demoMealPlan()
    expect(Object.keys(plan.days)).toHaveLength(7)
    for (const it of Object.values(plan.days).flat(2)) {
      expect(food(it.f)?.name, it.f).toBe(it.n)
      expect(food(it.f).portions.some(p => p[0] === it.s), it.f + ' ' + it.s).toBe(true)
    }
  })
})
