import Papa from 'papaparse'
import { validateDiscountRule, validateCartItem } from './validators.js'

export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const scope = String(row.scope || '').trim().toLowerCase()
    const missing = []

    if (!row.rule_id) missing.push('rule_id')
    if (!row.scope) missing.push('scope')
    if (!row.type) missing.push('type')
    if (row.value === undefined || row.value === '') missing.push('value')
    if (row.stackable === undefined || row.stackable === '') missing.push('stackable')
    if (scope !== 'cart' && !row.applies_to) missing.push('applies_to')
    if (scope === 'cart' && (row.min_cart_value === undefined || row.min_cart_value === '')) missing.push('min_cart_value')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    if (scope !== 'brand' && scope !== 'platform' && scope !== 'cart') {
      errors.push(`Row ${rowNum}: scope must be "brand", "platform", or "cart", got "${row.scope}"`)
      return
    }

    const type = String(row.type).trim().toLowerCase()
    if (type !== 'percentage' && type !== 'flat') {
      errors.push(`Row ${rowNum}: type must be "percentage" or "flat", got "${row.type}"`)
      return
    }

    const value = parseFloat(row.value)
    if (isNaN(value) || value <= 0) {
      errors.push(`Row ${rowNum}: value must be a positive number, got "${row.value}"`)
      return
    }
    if (type === 'percentage' && value > 100) {
      errors.push(`Row ${rowNum}: percentage value cannot exceed 100, got ${value}`)
      return
    }

    const stackableStr = String(row.stackable).trim().toLowerCase()
    const stackable = stackableStr === 'true' || stackableStr === '1' || stackableStr === 'yes'

    const rule = {
      ruleId: String(row.rule_id).trim(),
      scope,
      appliesTo: scope === 'cart' ? '' : String(row.applies_to).trim(),
      type,
      value,
      stackable,
    }
    if (scope === 'cart') {
      const minCartValue = parseFloat(row.min_cart_value)
      if (isNaN(minCartValue) || minCartValue < 0) {
        errors.push(`Row ${rowNum}: min_cart_value must be a non-negative number, got "${row.min_cart_value}"`)
        return
      }
      rule.minCartValue = minCartValue
      delete rule.appliesTo
    }

    const v = validateDiscountRule(rule)
    if (!v.ok) {
      errors.push(`Row ${rowNum}: ${v.errors.join(', ')}`)
      return
    }

    data.push(rule)
  })

  return { data, errors }
}

export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const missing = []

    if (!row.item_id) missing.push('item_id')
    if (!row.product) missing.push('product')
    if (!row.brand) missing.push('brand')
    if (!row.platform) missing.push('platform')
    if (row.base_price === undefined || row.base_price === '') missing.push('base_price')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    const basePrice = parseFloat(row.base_price)
    if (isNaN(basePrice) || basePrice <= 0) {
      errors.push(`Row ${rowNum}: base_price must be a positive number, got "${row.base_price}"`)
      return
    }

    const item = {
      itemId: String(row.item_id).trim(),
      product: String(row.product).trim(),
      brand: String(row.brand).trim(),
      platform: String(row.platform).trim(),
      basePrice: Math.round(basePrice),
    }

    const v = validateCartItem(item)
    if (!v.ok) {
      errors.push(`Row ${rowNum}: ${v.errors.join(', ')}`)
      return
    }

    data.push(item)
  })

  return { data, errors }
}
