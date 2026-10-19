// The built-in food list, read from the generated rows in foods-data.js (scripts/nutrition/
// build-foods.mjs). The list is about half a megabyte, so it loads only when Nutrition needs it,
// once per session, and is never copied into the profile: a log entry keeps the food's key and
// its own nutrient snapshot (lib/food-log.js).
//
// A food: { key, name, icon, kcal, p, c, f, fib, portions: [[label, grams]], aliases, everyday,
// dish, note }, nutrients per 100 g.

/** The Icon.jsx picture for each food group, until a food has a photo of its own. */
export const FOOD_ICON = {
  dairy: 'milk', egg: 'egg', grain: 'wheat', bread: 'bread', legume: 'bowl', meat: 'drumstick',
  fish: 'fish', veg: 'carrot', fruit: 'apple', nut: 'almond', oil: 'droplet', drink: 'glass',
  sweet: 'candy', snack: 'cookie', spice: 'chili', soup: 'soup', meal: 'cloche',
}
export const QUICK_ICON = 'utensils'

/** One generated row as a food. */
export function toFood(row) {
  const [key, name, icon, kcal, p, c, f, fib, portions, aliases, flags, note] = row
  return { key, name, icon, kcal, p, c, f, fib, portions: portions || [], aliases: aliases || [], everyday: flags === 1, dish: flags === 2, note: note || '' }
}

let cache = null
/** The whole list, loaded on first use: { list, byKey }. */
export function loadFoods() {
  if (!cache) {
    cache = import('./foods-data.js').then(m => {
      const list = m.FOODS.map(toFood)
      return { list, byKey: new Map(list.map(x => [x.key, x])) }
    })
    // A failed load (offline before the chunk was cached) is tried again next time.
    cache.catch(() => { cache = null })
  }
  return cache
}

/** The icon name a food, or a logged entry with no food behind it, shows. */
export const iconOf = food => FOOD_ICON[food?.icon] || QUICK_ICON
