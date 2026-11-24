import { describe, it, expect } from 'vitest'
import { parseRulesCSV, parseCartCSV } from '../src/engine/csvParser.js'

describe('parseRulesCSV', () => {
  it('parses valid csv', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable\nR1,platform,Amazon,percentage,15,false'
    const { data, errors } = parseRulesCSV(csv)
    expect(errors).toHaveLength(0)
    expect(data).toHaveLength(1)
    expect(data[0].ruleId).toBe('R1')
  })
  it('missing fields', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable\n,platform,Amazon,percentage,15,false'
    const { errors } = parseRulesCSV(csv)
    expect(errors.length).toBeGreaterThan(0)
  })
  it('invalid scope', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable\nR1,foo,Amazon,percentage,15,false'
    const { errors } = parseRulesCSV(csv)
    expect(errors.length).toBeGreaterThan(0)
  })
  it('cart rule with min_cart_value', () => {
    const csv = 'rule_id,scope,applies_to,type,value,stackable,min_cart_value\nR4,cart,,percentage,10,false,4000'
    const { data, errors } = parseRulesCSV(csv)
    expect(errors).toHaveLength(0)
    expect(data[0].scope).toBe('cart')
    expect(data[0].minCartValue).toBe(4000)
  })
})

describe('parseCartCSV', () => {
  it('parses valid csv', () => {
    const csv = 'item_id,product,brand,platform,base_price\nI1,P,B,Plat,100'
    const { data, errors } = parseCartCSV(csv)
    expect(errors).toHaveLength(0)
    expect(data[0].basePrice).toBe(100)
  })
  it('invalid price', () => {
    const csv = 'item_id,product,brand,platform,base_price\nI1,P,B,Plat,0'
    const { errors } = parseCartCSV(csv)
    expect(errors.length).toBeGreaterThan(0)
  })
  it('missing column', () => {
    const csv = 'item_id,product,brand,platform,base_price\nI1,P,B,Plat,'
    const { errors } = parseCartCSV(csv)
    expect(errors.length).toBeGreaterThan(0)
  })
})
