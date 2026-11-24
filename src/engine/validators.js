export function validateDiscountRule(rule) {
  const errors = []
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { ok: false, errors: ['Rule must be an object'] }
  }
  if (!rule.ruleId || typeof rule.ruleId !== 'string') errors.push('ruleId is required')
  if (!['platform', 'brand', 'cart'].includes(rule.scope)) errors.push('scope must be platform, brand, or cart')
  if (rule.scope !== 'cart') {
    if (typeof rule.appliesTo !== 'string' || !rule.appliesTo.trim()) errors.push('appliesTo is required')
  }
  if (!['percentage', 'flat'].includes(rule.type)) errors.push('type must be percentage or flat')
  if (typeof rule.value !== 'number' || !isFinite(rule.value) || rule.value <= 0) errors.push('value must be a positive number')
  if (rule.type === 'percentage' && rule.value > 100) errors.push('percentage value cannot exceed 100')
  if (typeof rule.stackable !== 'boolean') errors.push('stackable must be a boolean')
  if (rule.scope === 'cart') {
    if (typeof rule.minCartValue !== 'number' || !isFinite(rule.minCartValue) || rule.minCartValue < 0) {
      errors.push('minCartValue must be a non-negative number')
    }
  }
  return { ok: errors.length === 0, errors }
}

export function validateCartItem(item) {
  const errors = []
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { ok: false, errors: ['Item must be an object'] }
  }
  if (!item.itemId || typeof item.itemId !== 'string') errors.push('itemId is required')
  if (!item.product || typeof item.product !== 'string') errors.push('product is required')
  if (!item.brand || typeof item.brand !== 'string') errors.push('brand is required')
  if (!item.platform || typeof item.platform !== 'string') errors.push('platform is required')
  if (typeof item.basePrice !== 'number' || !isFinite(item.basePrice) || item.basePrice <= 0) {
    errors.push('basePrice must be a positive number')
  }
  return { ok: errors.length === 0, errors }
}

export function validateLLMRule(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'error', message: 'LLM response is not a JSON object' }
  }

  const missing = []
  if (!raw.scope) missing.push('scope')
  if (raw.scope !== 'cart' && (raw.appliesTo === undefined || raw.appliesTo === null || raw.appliesTo === '')) {
    missing.push('appliesTo')
  }
  if (!raw.type) missing.push('type')
  if (raw.value === undefined || raw.value === null || raw.value === '') missing.push('value')
  if (raw.stackable === undefined || raw.stackable === null) missing.push('stackable')
  if (raw.scope === 'cart' && (raw.minCartValue === undefined || raw.minCartValue === null || raw.minCartValue === '')) {
    missing.push('minCartValue')
  }

  if (missing.length > 0) {
    return {
      status: 'needs_clarification',
      missing,
      message: `Missing required fields: ${missing.join(', ')}. Please specify the discount percentage or amount and, for cart rules, the minimum cart value.`,
    }
  }

  const errors = []
  if (!['platform', 'brand', 'cart'].includes(raw.scope)) errors.push('invalid scope')
  if (!['percentage', 'flat'].includes(raw.type)) errors.push('invalid type')
  const value = Number(raw.value)
  if (!isFinite(value) || value <= 0) errors.push('value must be a positive number')
  if (raw.type === 'percentage' && value > 100) errors.push('percentage value cannot exceed 100')
  if (typeof raw.stackable !== 'boolean') errors.push('stackable must be a boolean')

  let minCartValue
  if (raw.scope === 'cart') {
    minCartValue = Number(raw.minCartValue)
    if (!isFinite(minCartValue) || minCartValue < 0) errors.push('minCartValue must be a non-negative number')
  }

  let appliesTo
  if (raw.scope !== 'cart') {
    appliesTo = String(raw.appliesTo).trim()
    if (!appliesTo) errors.push('appliesTo cannot be empty')
  }

  if (errors.length > 0) {
    return { status: 'error', message: errors.join('; ') }
  }

  const rule = {
    scope: raw.scope,
    type: raw.type,
    value,
    stackable: Boolean(raw.stackable),
  }
  if (appliesTo) rule.appliesTo = appliesTo
  if (raw.scope === 'cart') rule.minCartValue = minCartValue

  const v = validateDiscountRule({ ...rule, ruleId: 'TMP' })
  if (!v.ok) {
    return { status: 'error', message: v.errors.join('; ') }
  }

  return { status: 'ready', rule }
}
