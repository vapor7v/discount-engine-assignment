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
        stackable: { type: 'boolean' },
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

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

async function callProvider(apiKey, baseUrl, model, responseFormat) {
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: '' },
      ],
      response_format: responseFormat,
      temperature: 0,
    }),
  })
  return r
}

// placeholder replaced below
export async function handleRequest(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { status: 'error', message: 'Method not allowed' })
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
    })
    const text = await r.text()
    let json
    try { json = JSON.parse(text) } catch { json = null }
    return { ok: r.ok, status: r.status, json, text }
  }

  let result = await attempt({ type: 'json_schema', json_schema: { name: 'discount_rule', strict: true, schema: SCHEMA } })

  if (!result.ok) {
    // fallback to json_object if structured outputs unsupported
    result = await attempt({ type: 'json_object' })
  }

  if (!result.ok) {
    const msg = result.json && result.json.error && result.json.error.message
      ? result.json.error.message
      : `LLM request failed (${result.status})`
    send(res, 502, { status: 'error', message: msg })
    return
  }

  const content = result.json && result.json.choices && result.json.choices[0] && result.json.choices[0].message
    ? result.json.choices[0].message.content
    : null

  if (!content) {
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

  // Handle refusal
  if (parsed && parsed.refusal) {
    send(res, 200, { status: 'error', message: 'LLM refused to parse the request.' })
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

  const rawRule = parsed.status === 'ready' ? parsed.rule : parsed
  const v = validateLLMRule(rawRule)
  send(res, 200, v)
}

export default handleRequest
