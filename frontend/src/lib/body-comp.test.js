import { describe, it, expect } from 'vitest'
import { bodyComp, compositionSeries, waistReading, measurementChanges, waistToHeight, weightNear } from './body-comp.js'
import { weighIns } from './weight-trend.js'
import { buildDemoState } from './demoSeed.js'

const m = (d, values) => ({ d, t: Date.parse(d + 'T08:00:00'), ...values })
const profile = (bodyweight, measurements, more = {}) => ({ unit: 'kg', bodyweight, measurements, measurementEnabled: null, customMeasurements: [], ...more })

describe('body composition', () => {
  it('pairs each body-fat check-in with the weigh-in nearest it, within three days', () => {
    const list = weighIns({ bodyweight: [{ d: '2026-09-01', w: 80 }, { d: '2026-09-04', w: 79 }, { d: '2026-09-20', w: 78 }] })
    expect(weightNear(list, '2026-09-03')).toBe(79)
    expect(weightNear(list, '2026-09-12')).toBeNull()
  })

  it('splits weight into fat and lean mass, and needs three check-ins before it says anything', () => {
    const bw = [{ d: '2026-08-01', w: 82 }, { d: '2026-08-29', w: 80 }, { d: '2026-09-26', w: 79 }]
    const two = profile(bw, [m('2026-08-01', { bodyFat: 20 }), m('2026-08-30', { bodyFat: 18.5 })])
    expect(bodyComp(two).masses).toMatchObject({ ok: false, count: 2, need: 1, fat: null })
    const three = profile(bw, [...two.measurements, m('2026-09-27', { bodyFat: 17 })])
    const c = bodyComp(three).masses
    expect(c.ok).toBe(true)
    expect(c.first).toMatchObject({ w: 82, fat: 16.4, lean: 65.6 })
    expect(c.last).toMatchObject({ w: 79, fat: 13.4, lean: 65.6 })
    expect(c.fat).toBe(-3)
    expect(c.lean).toBe(0)
  })

  it('leaves out a check-in with no weigh-in near it', () => {
    const S = profile([{ d: '2026-08-01', w: 82 }], [m('2026-08-01', { bodyFat: 20 }), m('2026-09-01', { bodyFat: 19 })])
    expect(compositionSeries(S).map(x => x.d)).toEqual(['2026-08-01'])
  })

  it('reads waist against weight in plain words', () => {
    const bw = (a, b) => [{ d: '2026-08-01', w: a }, { d: '2026-10-01', w: b }]
    const waist = (a, b) => [m('2026-08-01', { waist: a }), m('2026-10-01', { waist: b })]
    expect(waistReading(profile(bw(82, 79), waist(90, 86))).kind).toBe('fatLoss')
    expect(waistReading(profile(bw(80, 80.3), waist(90, 87.5))).kind).toBe('recomp')
    expect(waistReading(profile(bw(75, 77), waist(84, 84.4))).kind).toBe('leanGain')
    expect(waistReading(profile(bw(75, 78), waist(84, 86))).kind).toBe('gaining')
    expect(waistReading(profile(bw(80, 80.2), waist(90, 90.3))).kind).toBe('steady')
    expect(waistReading(profile(bw(82, 79), waist(90, 89.6))).kind).toBe('scale')
    expect(waistReading(profile(bw(82, 79), waist(90, 86)))).toMatchObject({ waist: -4, weight: -3, from: '2026-08-01', to: '2026-10-01' })
    expect(waistReading(profile(bw(82, 79), [m('2026-08-01', { waist: 90 })]))).toBeNull()
  })

  it('lists the change in every measurement since its first reading', () => {
    const S = profile([], [m('2026-08-01', { waist: 90, chest: 100 }), m('2026-09-01', { waist: 88.5 }), m('2026-10-01', { chest: 101.2, bodyFat: 18 })])
    const ch = measurementChanges(S)
    expect(ch.find(x => x.key === 'waist')).toMatchObject({ from: 90, to: 88.5, diff: -1.5, since: '2026-08-01' })
    expect(ch.find(x => x.key === 'chest')).toMatchObject({ diff: 1.2 })
    // one reading is not a change
    expect(ch.find(x => x.key === 'bodyFat')).toBeUndefined()
  })

  it('gives waist-to-height only once Nutrition knows the height', () => {
    const S = profile([], [m('2026-08-01', { waist: 90 }), m('2026-10-01', { waist: 86 })])
    expect(waistToHeight(S)).toBeNull()
    expect(waistToHeight({ ...S, nutrition: { heightCm: 178 } })).toMatchObject({ ratio: 0.48, waist: 86, under: true })
    expect(waistToHeight({ ...S, nutrition: { heightCm: 165 } })).toMatchObject({ ratio: 0.52, under: false })
  })

  it('reads the demo history as fat lost with muscle kept', () => {
    const c = bodyComp(buildDemoState())
    expect(c.masses.ok).toBe(true)
    expect(c.masses.fat).toBeLessThan(0)
    expect(Math.abs(c.masses.lean)).toBeLessThan(1.5)
    expect(c.reading.kind).toBe('fatLoss')
    expect(c.whtr.ratio).toBeGreaterThan(0.4)
  })
})
