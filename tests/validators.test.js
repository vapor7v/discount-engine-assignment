import { describe, it, expect } from 'vitest'
import { validateDiscountRule, validateCartItem, validateLLMRule } from '../src/engine/validators.js'

describe('validateDiscountRule', () => {
  it('valid rule', () => {
    const r = validateDiscountRule({ ruleId: 'R1', scope: 'brand', appliesTo: 'X', type: 'percentage', value: 10, stackable: false })
    expect(r.ok).toBe(true)
  })
  it('invalid scope', () => {
    const r = validateDiscountRule({ ruleId: 'R1', scope: 'foo', appliesTo: 'X', type: 'percentage', value: 10, stackable: false })
    expect(r.ok).toBe(false)
  })
  it('negative value', () => {
    const r = validateDiscountRule({ ruleId: 'R1', scope: 'brand', appliesTo: 'X', type: 'flat', value: -5, stackable: false })
    expect(r.ok).toBe(false)
  })
  it('cart requires minCartValue', () => {
    const r = validateDiscountRule({ ruleId: 'R1', scope: 'cart', type: 'percentage', value: 10, stackable: false })
    expect(r.ok).toBe(false)
  })
})

describe('validateCartItem', () => {
  it('valid item', () => {
    const r = validateCartItem({ itemId: 'I1', product: 'P', brand: 'B', platform: 'Pl', basePrice: 10 })
    expect(r.ok).toBe(true)
  })
  it('invalid price', () => {
    const r = validateCartItem({ itemId: 'I1', product: 'P', brand: 'B', platform: 'Pl', basePrice: 0 })
    expect(r.ok).toBe(false)
  })
})

describe('validateLLMRule', () => {
  it('valid brand percentage', () => {
    const r = validateLLMRule({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true })
    expect(r.status).toBe('ready')
    expect(r.rule.value).toBe(20)
    expect(r.rule.stackable).toBe(true)
  })
  it('valid platform flat', () => {
    const r = validateLLMRule({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false })
    expect(r.status).toBe('ready')
  })
  it('valid cart rule', () => {
    const r = validateLLMRule({ scope: 'cart', type: 'percentage', value: 10, minCartValue: 5000, stackable: false })
    expect(r.status).toBe('ready')
    expect(r.rule.minCartValue).toBe(5000)
  })
  it('ambiguous input missing fields', () => {
    const r = validateLLMRule({ scope: 'cart' })
    expect(r.status).toBe('needs_clarification')
    expect(r.missing).toContain('type')
  })
  it('invalid JSON (null)', () => {
    const r = validateLLMRule(null)
    expect(r.status).toBe('error')
  })
  it('missing fields', () => {
    const r = validateLLMRule({ scope: 'brand', appliesTo: 'X' })
    expect(r.status).toBe('needs_clarification')
  })
  it('unsupported scope', () => {
    const r = validateLLMRule({ scope: 'foo', appliesTo: 'X', type: 'percentage', value: 10, stackable: false })
    expect(r.status).toBe('error')
  })
  it('negative value', () => {
    const r = validateLLMRule({ scope: 'brand', appliesTo: 'X', type: 'flat', value: -5, stackable: false })
    expect(r.status).toBe('error')
  })
  it('nonsensical threshold', () => {
    const r = validateLLMRule({ scope: 'cart', type: 'percentage', value: 10, minCartValue: -1, stackable: false })
    expect(r.status).toBe('error')
  })
  it('defaults stackable? missing -> clarification', () => {
    const r = validateLLMRule({ scope: 'brand', appliesTo: 'X', type: 'percentage', value: 10 })
    expect(r.status).toBe('needs_clarification')
    expect(r.missing).toContain('stackable')
  })
})
