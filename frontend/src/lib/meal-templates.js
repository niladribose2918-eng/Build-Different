// Starter weeks for Meal plan: a vegetarian Indian, a non-vegetarian Indian and a global week,
// each scaled to the profile's daily target and then the profile's own to edit. Built for a
// lifter: a protein food at every meal, dal or curd beside the grains.
//
// A template item is [food key, portion, how many], or [food key, 'g', grams]. Scaling moves only
// the items marked to scale (the grains, dals, curries and main proteins), in steps a kitchen can
// serve: half portions, whole eggs and rotis, 10 g. Drinks, fruit and sides stay as they are.
// Meals: Breakfast, Lunch, Dinner, Snacks, the profile's default four.
import { nutrientsFor } from './food-log.js'

// [key, portion | 'g', amount, scales?]
const S_ = true
const VEG = [
  // Monday … Sunday (0 = Sunday last, so the order reads as a week)
  [[['in:poha', 'plate', 1, S_], ['in:masala-chai', 'cup', 1], ['u:01116', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:toor-dal', 'katori', 1, S_], ['in:mixed-veg', 'katori', 1], ['in:raita', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:paneer-bhurji', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['in:sprouts-salad', 'katori', 1], ['u:16090', 'handful', 1]]],
  [[['in:idli', 'idli', 4, S_], ['in:sambar', 'katori', 1, S_], ['in:filter-coffee', 'cup', 1]],
    [['in:rajma', 'katori', 1.5, S_], ['u:20045', 'katori', 1.5, S_], ['in:kachumber', 'katori', 1], ['u:01116', 'katori', 1]],
    [['in:roti', 'roti', 2, S_], ['in:dal-makhani', 'katori', 1, S_], ['in:bhindi-masala', 'katori', 1]],
    [['u:01256', 'container', 1], ['u:09003', 'medium', 1]]],
  [[['in:aloo-paratha', 'paratha', 2, S_], ['u:01116', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:chole', 'katori', 1, S_], ['in:raita', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:matar-paneer', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['in:dhokla', 'piece', 3], ['in:masala-chai', 'cup', 1]]],
  [[['in:besan-chilla', 'chilla', 2, S_], ['u:01116', 'katori', 1], ['in:masala-chai', 'cup', 1]],
    [['in:roti', 'roti', 3, S_], ['in:palak-paneer', 'katori', 1, S_], ['in:toor-dal', 'katori', 1, S_]],
    [['u:20045', 'katori', 1.5, S_], ['in:sambar', 'katori', 1, S_], ['in:cabbage-sabzi', 'katori', 1], ['u:01116', 'katori', 1]],
    [['u:12061', 'handful', 1], ['u:09139', 'guava', 1]]],
  [[['u:08120', 'half cup', 2, S_], ['u:01077', 'glass', 1], ['u:09040', 'medium', 1]],
    [['in:khichdi', 'bowl', 1, S_], ['u:01116', 'katori', 1], ['in:kachumber', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:moong-dal', 'katori', 1, S_], ['in:paneer-bhurji', 'katori', 0.5, S_], ['in:lauki-sabzi', 'katori', 1]],
    [['in:chana-chaat', 'katori', 1]]],
  [[['in:upma', 'plate', 1, S_], ['in:masala-chai', 'cup', 1], ['u:01256', 'container', 1]],
    [['in:veg-biryani', 'plate', 1, S_], ['in:raita', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:kadhi', 'katori', 1, S_], ['in:aloo-gobi', 'katori', 1]],
    [['in:sweet-lassi', 'glass', 1]]],
  [[['in:moong-chilla', 'chilla', 2, S_], ['u:01116', 'katori', 1]],
    [['in:paneer-paratha', 'paratha', 2, S_], ['in:raita', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:chole', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['in:sprouts-salad', 'katori', 1], ['u:09040', 'medium', 1]]],
]
const NONVEG = [
  [[['u:01129', 'egg', 3, S_], ['u:18075', 'slice', 2, S_], ['in:masala-chai', 'cup', 1]],
    [['in:roti', 'roti', 3, S_], ['in:chicken-curry', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['u:20045', 'katori', 1.5, S_], ['in:fish-curry', 'katori', 1, S_], ['in:cabbage-sabzi', 'katori', 1]],
    [['u:01256', 'container', 1], ['u:09040', 'medium', 1]]],
  [[['in:masala-omelette', '2-egg omelette', 1, S_], ['u:18075', 'slice', 2, S_], ['in:filter-coffee', 'cup', 1]],
    [['in:chicken-biryani', 'plate', 1, S_], ['in:raita', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:toor-dal', 'katori', 1, S_], ['in:egg-bhurji', 'katori', 1, S_]],
    [['u:16090', 'handful', 1], ['u:09003', 'medium', 1]]],
  [[['in:poha', 'plate', 1, S_], ['u:01129', 'egg', 2, S_], ['in:masala-chai', 'cup', 1]],
    [['in:roti', 'roti', 3, S_], ['in:chicken-keema', 'katori', 1, S_], ['in:raita', 'katori', 1]],
    [['u:20045', 'katori', 1.5, S_], ['in:egg-curry', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['in:sprouts-salad', 'katori', 1]]],
  [[['in:idli', 'idli', 4, S_], ['in:sambar', 'katori', 1, S_], ['u:01129', 'egg', 2, S_]],
    [['in:roti', 'roti', 3, S_], ['in:tandoori-chicken', 'serving', 1, S_], ['in:dal-fry', 'katori', 1, S_]],
    [['in:roti', 'roti', 3, S_], ['in:mutton-curry', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['u:01256', 'container', 1], ['u:09139', 'guava', 1]]],
  [[['u:08120', 'half cup', 2, S_], ['u:01077', 'glass', 1], ['u:14066', 'scoop', 1]],
    [['u:20045', 'katori', 1.5, S_], ['in:prawn-curry', 'katori', 1, S_], ['in:cabbage-sabzi', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:chicken-curry', 'katori', 1, S_], ['in:mixed-veg', 'katori', 1]],
    [['u:12061', 'handful', 1], ['u:09040', 'medium', 1]]],
  [[['in:egg-roll', 'roll', 1, S_], ['in:masala-chai', 'cup', 1]],
    [['in:mutton-biryani', 'plate', 1, S_], ['in:raita', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:chicken-tikka', 'serving', 1, S_], ['in:toor-dal', 'katori', 1, S_]],
    [['in:chana-chaat', 'katori', 1]]],
  [[['in:aloo-paratha', 'paratha', 2, S_], ['u:01116', 'katori', 1], ['u:01129', 'egg', 2, S_]],
    [['u:20045', 'katori', 1.5, S_], ['in:fish-curry', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['in:roti', 'roti', 3, S_], ['in:butter-chicken', 'katori', 1, S_], ['in:kachumber', 'katori', 1]],
    [['u:01256', 'container', 1], ['u:09003', 'medium', 1]]],
]
const GLOBAL = [
  [[['u:08120', 'half cup', 2, S_], ['u:01077', 'glass', 1], ['u:09040', 'medium', 1]],
    [['u:05064', 'serving', 1.5, S_], ['u:20045', 'cup', 1, S_], ['u:11091', 'g', 150]],
    [['u:15237', 'fillet', 1, S_], ['u:11508', 'medium', 1, S_], ['u:11052', 'g', 100]],
    [['u:01256', 'container', 1], ['u:09050', 'g', 100]]],
  [[['u:01129', 'egg', 3, S_], ['u:18075', 'slice', 2, S_], ['u:09200', 'medium', 1]],
    [['u:15121', 'can, drained', 1, S_], ['u:18075', 'slice', 2, S_], ['u:11529', 'medium', 1]],
    [['u:23569', 'serving', 1.5, S_], ['u:20121', 'cup', 1.5, S_], ['u:11090', 'g', 100]],
    [['u:09003', 'medium', 1], ['u:16098', 'tbsp', 1]]],
  [[['u:01256', 'container', 1, S_], ['u:08120', 'half cup', 1, S_], ['u:09050', 'g', 75], ['u:19296', 'tsp', 1]],
    [['u:05064', 'serving', 1.5, S_], ['u:18364', 'tortilla', 2, S_], ['u:16015', 'katori', 0.5, S_], ['u:11529', 'medium', 1]],
    [['u:15237', 'fillet', 1, S_], ['u:20137', 'cup', 1, S_], ['u:11091', 'g', 150]],
    [['u:14066', 'scoop', 1], ['u:09040', 'medium', 1]]],
  [[['u:01129', 'egg', 3, S_], ['u:18075', 'slice', 2, S_], ['u:01009', 'slice', 1]],
    [['u:05064', 'serving', 1.5, S_], ['u:20045', 'cup', 1, S_], ['u:11052', 'g', 100]],
    [['u:23569', 'serving', 1.5, S_], ['u:11508', 'medium', 1, S_], ['u:11090', 'g', 100]],
    [['u:01012', 'katori', 1], ['u:09200', 'medium', 1]]],
  [[['u:08120', 'half cup', 2, S_], ['u:01077', 'glass', 1], ['u:16098', 'tbsp', 1]],
    [['u:15121', 'can, drained', 1, S_], ['u:20121', 'cup', 1.5, S_], ['u:11529', 'medium', 1]],
    [['u:05064', 'serving', 1.5, S_], ['u:20137', 'cup', 1, S_], ['u:11091', 'g', 150]],
    [['u:01256', 'container', 1], ['u:12061', 'handful', 1]]],
  [[['u:01129', 'egg', 3, S_], ['u:18364', 'tortilla', 1, S_], ['u:16015', 'katori', 0.5]],
    [['u:23569', 'serving', 1.5, S_], ['u:18075', 'slice', 2, S_], ['u:11529', 'medium', 1]],
    [['u:15237', 'fillet', 1, S_], ['u:20045', 'cup', 1, S_], ['u:11052', 'g', 100]],
    [['u:14066', 'scoop', 1], ['u:09003', 'medium', 1]]],
  [[['u:01256', 'container', 1, S_], ['u:09050', 'g', 100], ['u:08120', 'half cup', 1, S_], ['u:19296', 'tsp', 1]],
    [['u:05064', 'serving', 1.5, S_], ['u:20121', 'cup', 1.5, S_], ['u:11090', 'g', 100]],
    [['u:23569', 'serving', 1, S_], ['u:18364', 'tortilla', 2, S_], ['u:16015', 'katori', 0.5, S_]],
    [['u:01012', 'katori', 1], ['u:09040', 'medium', 1]]],
]
// Their names are the view's to translate (components/MealPlan.jsx).
export const TEMPLATES = { veg: { week: VEG }, nonveg: { week: NONVEG }, global: { week: GLOBAL } }
// Template days run Monday → Sunday; plan days are keyed by getDay() (0 = Sunday).
const WEEKDAY_OF = [1, 2, 3, 4, 5, 6, 0]

// The step an amount moves in: whole eggs, rotis and pieces; half portions otherwise; 10 g.
const WHOLE = new Set(['egg', 'roti', 'idli', 'slice', 'tortilla', 'paratha', 'chilla', 'piece', 'scoop', 'medium', 'roll', 'samosa'])
const stepOf = unit => (unit === 'g' ? 10 : WHOLE.has(unit) ? 1 : 0.5)
const snap = (v, step) => Math.max(step, Math.round(v / step) * step)

function toItem([key, unit, amount], food) {
  const f = food(key)
  if (!f) return null
  if (unit === 'g') return { f: key, g: amount, n: f.name }
  const p = f.portions.find(x => x[0] === unit)
  if (!p) return null
  return { f: key, g: Math.round(p[1] * amount * 10) / 10, s: unit, x: amount, n: f.name }
}

const kcalOf = (items, food) => items.reduce((a, it) => a + (it ? nutrientsFor(food(it.f), it.g).k : 0), 0)

/**
 * One template day as plan meals, scaled towards `target` kcal: [[item…] × 4]. The scaling items
 * move by one factor, snapped to kitchen steps; then, if the day still lands more than 10% off,
 * the largest scaling item takes one more step towards the target.
 */
export function scaleDay(day, target, food) {
  const raw = day.map(meal => meal.map(x => ({ x, item: toItem(x, food) })).filter(r => r.item))
  const all = raw.flat()
  const fixed = kcalOf(all.filter(r => !r.x[3]).map(r => r.item), food)
  const scaling = kcalOf(all.filter(r => r.x[3]).map(r => r.item), food)
  const factor = scaling > 0 ? Math.max(0.5, Math.min(2.5, (target - fixed) / scaling)) : 1
  const meals = raw.map(meal => meal.map(({ x, item }) => {
    if (!x[3]) return item
    const [key, unit, amount] = x
    return toItem([key, unit, snap(amount * factor, stepOf(unit))], food)
  }))
  // one nudge on the biggest scaling item if rounding left the day more than 10% off
  const total = () => kcalOf(meals.flat(), food)
  for (let i = 0; i < 4 && Math.abs(total() - target) > target * 0.1; i++) {
    let best = null
    meals.forEach((meal, m) => meal.forEach((it, j) => {
      const src = raw[m][j].x
      if (!src[3]) return
      const k = nutrientsFor(food(it.f), it.g).k
      if (!best || k > best.k) best = { m, j, k, src, it }
    }))
    if (!best) break
    const [key, unit] = best.src
    const step = stepOf(unit)
    const cur = unit === 'g' ? best.it.g : best.it.x
    const next = total() > target ? Math.max(step, cur - step) : cur + step
    if (next === cur) break
    meals[best.m][best.j] = toItem([key, unit, next], food)
  }
  return meals
}

/** A starter week as a new plan: { name, mode: 'week', days }, every day scaled to `target`. */
export function starterPlan(kind, target, food, name = kind) {
  const tpl = TEMPLATES[kind]
  if (!tpl) return null
  const days = {}
  tpl.week.forEach((day, i) => { days[String(WEEKDAY_OF[i])] = scaleDay(day, target, food) })
  return { name, mode: 'week', days }
}
