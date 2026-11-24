/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All money is computed in integer paise internally.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:      string
 *   scope:       "platform" | "brand" | "cart"
 *   appliesTo:   string (required for platform/brand)
 *   type:        "percentage" | "flat"
 *   value:       number
 *   stackable:   boolean
 *   minCartValue:number (cart scope)
 * }
 */

export function toPaise(rupees) {
  return Math.round(Number(rupees) * 100)
}

export function toRupees(paise) {
  return Math.round(Number(paise) / 100)
}

export function ruleMatchesItem(item, rule) {
  const normalise = (s) => String(s).trim().toLowerCase()
  if (rule.scope === 'brand') return normalise(item.brand) === normalise(rule.appliesTo)
  if (rule.scope === 'platform') return normalise(item.platform) === normalise(rule.appliesTo)
  return false
}

export function calculateDiscountAmount(pricePaise, rule) {
  if (rule.type === 'percentage') {
    return Math.round(pricePaise * rule.value / 100)
  }
  if (rule.type === 'flat') {
    return toPaise(rule.value)
  }
  return 0
}

function ruleToReasoning(rule) {
  const scopeLabel = rule.scope === 'brand' ? 'Brand' : rule.scope === 'platform' ? 'Platform' : 'Cart'
  if (rule.type === 'percentage') return `${scopeLabel} offer: ${rule.value}% off`
  if (rule.type === 'flat') return `${scopeLabel} offer: Rs.${rule.value} off`
  return `${scopeLabel} offer applied`
}

export function applyDiscounts(item, rules) {
  const matchingRules = (rules || []).filter((r) => ruleMatchesItem(item, r))

  const basePaise = toPaise(item.basePrice)

  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)
    .sort((a, b) => {
      const aPct = a.type === 'percentage' ? 0 : 1
      const bPct = b.type === 'percentage' ? 0 : 1
      return aPct - bPct
    })

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(basePaise, b) - calculateDiscountAmount(basePaise, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let pricePaise = basePaise
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    pricePaise -= calculateDiscountAmount(pricePaise, winner)
    if (pricePaise < 0) pricePaise = 0
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    pricePaise -= calculateDiscountAmount(pricePaise, rule)
    if (pricePaise < 0) pricePaise = 0
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = toRupees(pricePaise)
  const totalDiscount = toRupees(basePaise - pricePaise)

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + ') || 'No offers available',
  }
}

export function applyCartDiscount(subtotalRupees, cartRules) {
  const subtotalPaise = toPaise(subtotalRupees)
  const eligible = (cartRules || []).filter((r) => {
    if (r.minCartValue === undefined || r.minCartValue === null) return true
    return subtotalRupees >= r.minCartValue
  })

  const nonStackable = eligible.filter((r) => !r.stackable)
  const stackable = eligible.filter((r) => r.stackable)
    .sort((a, b) => {
      const aPct = a.type === 'percentage' ? 0 : 1
      const bPct = b.type === 'percentage' ? 0 : 1
      return aPct - bPct
    })

  let winner = null
  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(subtotalPaise, b) - calculateDiscountAmount(subtotalPaise, a)
    )
    winner = sorted[0]
  }

  let pricePaise = subtotalPaise
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    pricePaise -= calculateDiscountAmount(pricePaise, winner)
    if (pricePaise < 0) pricePaise = 0
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    pricePaise -= calculateDiscountAmount(pricePaise, rule)
    if (pricePaise < 0) pricePaise = 0
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const discountPaise = subtotalPaise - pricePaise
  const discount = toRupees(discountPaise)

  return {
    discount,
    appliedRules,
    reasoning: reasoningParts.length ? reasoningParts.join(' + ') : 'No cart offer applied',
  }
}

export function processCart(cartItems, rules) {
  const itemRules = (rules || []).filter((r) => r.scope !== 'cart')
  const itemResults = (cartItems || []).map((item) => applyDiscounts(item, itemRules))
  const subtotal = itemResults.reduce((sum, r) => sum + r.finalPrice, 0)

  const cartRules = (rules || []).filter((r) => r.scope === 'cart')
  const { discount, appliedRules, reasoning } = applyCartDiscount(subtotal, cartRules)

  return {
    itemResults,
    subtotal,
    cartDiscount: discount,
    cartAppliedRules: appliedRules,
    cartReasoning: reasoning,
    finalTotal: subtotal - discount,
  }
}

export function cartTotal(results) {
  if (Array.isArray(results)) {
    return results.reduce((sum, r) => sum + r.finalPrice, 0)
  }
  return results ? results.finalTotal : 0
}
