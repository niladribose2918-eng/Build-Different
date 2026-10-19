// Finding a food as people type it: everyday names first, the words people actually use
// (dahi → curd, chawal → rice, aloo → potato), a typo or two forgiven, and what was eaten
// recently and often above the rest.
//
// Every word of the query has to match a word of the food's name or one of its aliases: as the
// start of it ("chick" finds chicken), or, for words of four letters and more, with one slip
// (two from seven letters on) — a wrong, missing, extra or swapped letter.

/** Lower case, accents off, anything that is not a letter or digit a space. */
export const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim()
const words = s => normalize(s).split(' ').filter(Boolean)

/** Edit distance with swapped neighbours counted as one slip; gives up past `max`. */
export function slips(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      if (v < best) best = v
    }
    if (best > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

const allowed = w => (w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0)

// How well one query word matches one food word: 3 the same, 2 its start, 1 with a slip, 0 not.
function wordMatch(q, w) {
  if (q === w) return 3
  if (w.startsWith(q)) return 2
  const max = allowed(q)
  if (!max) return 0
  // a word cut short while typing ("chiken bre") compares against the same length of the food word
  if (slips(q, w, max) <= max || (w.length > q.length && slips(q, w.slice(0, q.length), max) <= max)) return 1
  return 0
}

const indexCache = new WeakMap()
function indexOf(foods) {
  let idx = indexCache.get(foods)
  if (!idx) {
    idx = foods.map(food => ({
      food,
      name: normalize(food.name),
      nameWords: words(food.name),
      aliases: (food.aliases || []).map(normalize),
      aliasWords: (food.aliases || []).flatMap(words),
    }))
    indexCache.set(foods, idx)
  }
  return idx
}

/**
 * The foods matching `query`, best first.
 *   recent  Map of food key → how much it was eaten lately (lib/food-log.js recentFoods), which
 *           lifts those foods above the others
 */
export function searchFoods(foods, query, { recent = new Map(), limit = 60 } = {}) {
  const q = normalize(query)
  const qWords = q.split(' ').filter(Boolean)
  if (!qWords.length) return []
  const out = []
  for (const it of indexOf(foods)) {
    let score = 0
    let ok = true
    for (const qw of qWords) {
      let best = 0
      for (const w of it.nameWords) { const m = wordMatch(qw, w); if (m > best) best = m; if (best === 3) break }
      let alias = 0
      if (best < 3) for (const w of it.aliasWords) { const m = wordMatch(qw, w); if (m > alias) alias = m; if (alias === 3) break }
      const m = Math.max(best, alias)
      if (!m) { ok = false; break }
      score += m === 3 ? 10 : m === 2 ? 7 : 2
    }
    if (!ok) continue
    if (it.name === q || it.aliases.includes(q)) score += 40
    else if (it.name.startsWith(q) || it.aliases.some(a => a.startsWith(q))) score += 20
    // the first word of the name is what the food is ("Chicken, breast" vs "Soup, chicken")
    if (it.nameWords[0] && wordMatch(qWords[0], it.nameWords[0]) >= 2) score += 8
    if (it.food.everyday) score += 25
    else if (it.food.dish) score += 22
    score += Math.min(30, (recent.get(it.food.key) || 0) * 6)
    score -= it.nameWords.length * 0.8
    out.push({ food: it.food, score })
  }
  out.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length)
  return out.slice(0, limit).map(x => x.food)
}
