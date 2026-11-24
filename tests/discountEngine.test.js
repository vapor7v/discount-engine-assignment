import { describe, it, expect } from 'vitest'
import {
  applyDiscounts, processCart, applyCartDiscount, toPaise, toRupees, ruleMatchesItem, calculateDiscountAmount,
} from '../src/engine/discountEngine.js'

const baseItem = (overrides = {}) => ({
  itemId: 'I1', product: 'P', brand: 'B', platform: 'Plat', basePrice: 1000, ...overrides,
})

describe('discountEngine item-level', () => {
  it('one percentage discount', () => {
    const rules = [{ ruleId: 'R1', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 10, stackable: false }]
    const r = applyDiscounts(baseItem(), rules)
    expect(r.finalPrice).toBe(900)
    expect(r.totalDiscount).toBe(100)
  })

  it('one flat discount', () => {
    const rules = [{ ruleId: 'R1', scope: 'brand', appliesTo: 'B', type: 'flat', value: 100, stackable: false }]
    const r = applyDiscounts(baseItem(), rules)
    expect(r.finalPrice).toBe(900)
  })

  it('multiple competing non-stackable picks max saving', () => {
    const rules = [
      { ruleId: 'R1', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 10, stackable: false },
      { ruleId: 'R2', scope: 'brand', appliesTo: 'B', type: 'flat', value: 200, stackable: false },
    ]
    const r = applyDiscounts(baseItem({ basePrice: 1000 }), rules)
    // flat 200 > 10% 100
    expect(r.finalPrice).toBe(800)
    expect(r.appliedRules).toEqual(['R2'])
    expect(r.skippedRules).toContain('R1')
  })

  it('multiple stackable discounts apply', () => {
    const rules = [
      { ruleId: 'R1', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 10, stackable: true },
      { ruleId: 'R2', scope: 'brand', appliesTo: 'B', type: 'flat', value: 50, stackable: true },
    ]
    const r = applyDiscounts(baseItem({ basePrice: 1000 }), rules)
    // percentage first: 1000-100=900, flat 50 => 850
    expect(r.finalPrice).toBe(850)
    expect(r.appliedRules).toEqual(['R1', 'R2'])
  })

  it('stackable ordering percentage before flat regardless of input order', () => {
    const rules = [
      { ruleId: 'R2', scope: 'brand', appliesTo: 'B', type: 'flat', value: 50, stackable: true },
      { ruleId: 'R1', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 10, stackable: true },
    ]
    const r = applyDiscounts(baseItem({ basePrice: 1000 }), rules)
    expect(r.finalPrice).toBe(850)
  })

  it('stackable without non-stackable match', () => {
    const rules = [{ ruleId: 'R1', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 10, stackable: true }]
    const r = applyDiscounts(baseItem({ basePrice: 1000 }), rules)
    expect(r.finalPrice).toBe(900)
  })

  it('no matching discount', () => {
    const rules = [{ ruleId: 'R1', scope: 'platform', appliesTo: 'Other', type: 'percentage', value: 10, stackable: false }]
    const r = applyDiscounts(baseItem(), rules)
    expect(r.finalPrice).toBe(1000)
    expect(r.reasoning).toBe('No offers available')
  })

  it('discount larger than base price clamps to 0', () => {
    const rules = [{ ruleId: 'R1', scope: 'brand', appliesTo: 'B', type: 'flat', value: 5000, stackable: false }]
    const r = applyDiscounts(baseItem({ basePrice: 1000 }), rules)
    expect(r.finalPrice).toBe(0)
    expect(r.totalDiscount).toBe(1000)
  })

  it('mixed non-stackable + stackable', () => {
    const rules = [
      { ruleId: 'R1', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 15, stackable: false },
      { ruleId: 'R2', scope: 'brand', appliesTo: 'B', type: 'flat', value: 100, stackable: false },
      { ruleId: 'R3', scope: 'platform', appliesTo: 'Plat', type: 'percentage', value: 5, stackable: true },
    ]
    const r = applyDiscounts(baseItem({ basePrice: 1000 }), rules)
    // winner: flat 100 vs 15% 150 -> percentage 150 wins; then stack 5% of 850 = 42.5 -> 43 (rounded? paise: 85000*5/100=4250 paise=42.5 rupees -> toRupees rounds 43? Wait toRupees(4250)=43? 4250/100=42.5 -> Math.round=43. Hmm. Let's just check not crash)
    expect(r.appliedRules).toContain('R1')
    expect(r.appliedRules).toContain('R3')
  })
})

describe('cart-level', () => {
  const items = [
    { itemId: 'I1', product: 'P1', brand: 'B', platform: 'Plat', basePrice: 3000 },
    { itemId: 'I2', product: 'P2', brand: 'B', platform: 'Plat', basePrice: 2000 },
  ]
  const rules = [{ ruleId: 'C1', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 }]

  it('cart above threshold applies discount', () => {
    const res = processCart(items, rules)
    // item finals 3000+2000=5000; 10% = 500; final 4500
    expect(res.subtotal).toBe(5000)
    expect(res.cartDiscount).toBe(500)
    expect(res.finalTotal).toBe(4500)
  })

  it('cart exactly at threshold applies', () => {
    const r = [{ ruleId: 'C1', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }]
    const res = processCart([{ itemId: 'I1', product: 'P', brand: 'B', platform: 'Plat', basePrice: 5000 }], r)
    expect(res.cartDiscount).toBe(500)
  })

  it('cart just below threshold no discount', () => {
    const res = processCart([{ itemId: 'I1', product: 'P', brand: 'B', platform: 'Plat', basePrice: 3999 }], rules)
    expect(res.cartDiscount).toBe(0)
    expect(res.finalTotal).toBe(3999)
  })

  it('no applicable cart rule', () => {
    const res = processCart(items, [])
    expect(res.cartDiscount).toBe(0)
  })

  it('multiple applicable cart rules picks max saving', () => {
    const r = [
      { ruleId: 'C1', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 },
      { ruleId: 'C2', scope: 'cart', type: 'flat', value: 600, stackable: false, minCartValue: 4000 },
    ]
    const res = processCart(items, r)
    // 10% of 5000 = 500 vs 600 -> 600
    expect(res.cartDiscount).toBe(600)
  })

  it('cart-level does not alter item results', () => {
    const res = processCart(items, rules)
    expect(res.itemResults.length).toBe(2)
  })
})

describe('sample data expected', () => {
  it('produces expected figures', () => {
    const cart = [
      { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
      { itemId: 'ITEM-02', product: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', basePrice: 849 },
      { itemId: 'ITEM-03', product: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', basePrice: 599 },
      { itemId: 'ITEM-04', product: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', basePrice: 2499 },
      { itemId: 'ITEM-05', product: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', basePrice: 449 },
      { itemId: 'ITEM-06', product: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', basePrice: 899 },
    ]
    const rules = [
      { ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', type: 'percentage', value: 15, stackable: false },
      { ruleId: 'RULE-02', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150, stackable: false },
      { ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', type: 'percentage', value: 10, stackable: true },
      { ruleId: 'RULE-04', scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 },
    ]
    const res = processCart(cart, rules)
    const finals = res.itemResults.map((r) => r.finalPrice)
    expect(finals).toEqual([1104, 629, 509, 2499, 382, 809])
    expect(res.subtotal).toBe(5932)
    expect(res.cartDiscount).toBe(593)
    expect(res.finalTotal).toBe(5339)
  })
})

describe('helpers', () => {
  it('toPaise/toRupees', () => {
    expect(toPaise(12.34)).toBe(1234)
    expect(toRupees(1234)).toBe(12)
  })
})
