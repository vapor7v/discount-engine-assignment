const SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ready', 'needs_clarification'] },
    rule: {
      type: ['object', 'null'],
      properties: {
        scope: { type: 'string', enum: ['platform', 'brand', 'cart'] },
        appliesTo: { type: ['string', 'null'] },
        type: { type: 'string', enum: ['percentage', 'flat'] },
        value: { type: 'number' },
        stackable: { type: ['boolean', 'null'] },
        minCartValue: { type: ['number', 'null'] },
      },
      required: ['scope', 'appliesTo', 'type', 'value', 'stackable', 'minCartValue'],
      additionalProperties: false,
    },
    missing: { type: 'array', items: { type: 'string' } },
    message: { type: 'string' },
  },
  required: ['status', 'rule', 'missing', 'message'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You are a discount rule parser for a shopping cart engine.
Convert the user's natural-language discount description into a structured rule.

Fields:
- scope: "platform", "brand", or "cart".
- appliesTo: the brand or platform name (required for platform/brand; null for cart).
- type: "percentage" or "flat".
- value: positive number (percentage as integer, flat amount in rupees).
- stackable: boolean. Default to false if not specified.
- minCartValue: number for cart scope (minimum cart subtotal in rupees); null otherwise.

Rules:
- Do not invent missing percentages, amounts, or thresholds.
- If the description is ambiguous or missing required information, return status "needs_clarification" with a "missing" array listing the missing fields and a helpful "message". Do not guess.
- For cart rules, a minimum cart value is required.
- Return only JSON matching the schema.`

const MAX_DESCRIPTION_LENGTH = 500
const REQUEST_TIMEOUT_MS = 20000

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export async function handleRequest(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { status: 'error', message: 'Method not allowed. Use POST.' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}

  const description = body.description
  if (!description || typeof description !== 'string' || !description.trim()) {
    send(res, 400, { status: 'error', message: 'Description is required.' })
    return
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    send(res, 400, { status: 'error', message: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` })
    return
  }

  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    send(res, 503, { status: 'error', message: 'LLM is not configured. Set LLM_API_KEY to enable natural-language rules.' })
    return
  }

  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: description.trim() },
  ]

  async function attempt(responseFormat) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: responseFormat,
          temperature: 0,
        }),
        signal: controller.signal,
      })
      const text = await r.text()
      let json
      try { json = JSON.parse(text) } catch { json = null }
      return { ok: r.ok, status: r.status, json, text }
    } finally {
      clearTimeout(timer)
    }
  }

  // First try strict structured outputs.
  let result = await attempt({ type: 'json_schema', json_schema: { name: 'discount_rule', strict: true, schema: SCHEMA } })

  // Fall back to JSON mode ONLY when provider indicates response format unsupported.
  const unsupportedFormat =
    !result.ok &&
    result.status === 400 &&
    /response_format|json_schema|structured/i.test(
      (result.json && result.json.error && result.json.error.message) || result.text || ''
    )

  if (unsupportedFormat) {
    result = await attempt({ type: 'json_object' })
  }

  if (!result.ok) {
    const msg = result.json && result.json.error && result.json.error.message
      ? result.json.error.message
      : `LLM request failed (${result.status})`
    // Map common statuses
    if (result.status === 401) {
      send(res, 401, { status: 'error', message: 'Authentication failed: invalid LLM API key.' })
      return
    }
    if (result.status === 429) {
      send(res, 429, { status: 'error', message: 'Rate limit exceeded. Try again later.' })
      return
    }
    if (result.status >= 500) {
      send(res, 502, { status: 'error', message: 'LLM provider unavailable.' })
      return
    }
    send(res, 502, { status: 'error', message: msg })
    return
  }

  const choice = result.json && result.json.choices && result.json.choices[0]
  const message = choice ? choice.message : null

  // Refusal handling: check provider's refusal field on the message.
  if (message && message.refusal) {
    send(res, 200, { status: 'error', message: `LLM refused: ${message.refusal}` })
    return
  }

  const content = message ? message.content : null
  if (!content || typeof content !== 'string') {
    send(res, 502, { status: 'error', message: 'Empty response from LLM.' })
    return
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    send(res, 502, { status: 'error', message: 'LLM returned malformed JSON.' })
    return
  }

  // Validate status field
  const allowedStatuses = ['ready', 'needs_clarification', 'error']
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    send(res, 502, { status: 'error', message: 'LLM response is not a JSON object.' })
    return
  }
  if (!allowedStatuses.includes(parsed.status)) {
    send(res, 502, { status: 'error', message: 'LLM returned an unsupported status.' })
    return
  }

  const { validateLLMRule } = await import('../src/engine/validators.js')

  if (parsed.status === 'needs_clarification') {
    send(res, 200, {
      status: 'needs_clarification',
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      message: typeof parsed.message === 'string' ? parsed.message : 'Please provide more details.',
    })
    return
  }

  if (parsed.status === 'error') {
    send(res, 200, {
      status: 'error',
      message: typeof parsed.message === 'string' ? parsed.message : 'LLM reported an error.',
    })
    return
  }

  // ready
  const rawRule = parsed.rule !== undefined ? parsed.rule : parsed
  const v = validateLLMRule(rawRule)
  // normalize missing stackable default handled in validator
  send(res, 200, v)
}

export default handleRequest
