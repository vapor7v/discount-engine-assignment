import { validateLLMRule } from './validators.js'

export async function parseNaturalLanguageRule(description) {
  if (!description || typeof description !== 'string' || !description.trim()) {
    return { status: 'error', message: 'Description is required.' }
  }

  let response
  try {
    response = await fetch('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.trim() }),
    })
  } catch (e) {
    return { status: 'error', message: `Network error: ${e.message}` }
  }

  let json
  try {
    json = await response.json()
  } catch {
    return { status: 'error', message: 'Invalid response from server.' }
  }

  if (!response.ok && json.status !== 'needs_clarification') {
    return { status: 'error', message: json.message || `Request failed (${response.status})` }
  }

  if (json.status === 'ready') {
    const v = validateLLMRule(json.rule)
    if (v.status !== 'ready') return v
    return { status: 'ready', rule: v.rule }
  }

  if (json.status === 'needs_clarification') {
    return {
      status: 'needs_clarification',
      missing: json.missing || [],
      message: json.message || 'Please provide more details.',
    }
  }

  return { status: 'error', message: json.message || 'Unknown error.' }
}
