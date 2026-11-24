import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseNaturalLanguageRule } from '../src/engine/nlParser.js'

describe('nlParser', () => {
  let fetchMock
  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('successful rule parsing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', rule: { scope: 'brand', appliesTo: 'X', type: 'percentage', value: 20, stackable: true } }),
    })
    const r = await parseNaturalLanguageRule('20% off X')
    expect(r.status).toBe('ready')
    expect(r.rule.value).toBe(20)
  })

  it('clarification response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'needs_clarification', missing: ['value'], message: 'missing' }),
    })
    const r = await parseNaturalLanguageRule('discount for big orders')
    expect(r.status).toBe('needs_clarification')
    expect(r.missing).toContain('value')
  })

  it('API error', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ status: 'error', message: 'not configured' }),
    })
    const r = await parseNaturalLanguageRule('test')
    expect(r.status).toBe('error')
  })

  it('network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const r = await parseNaturalLanguageRule('test')
    expect(r.status).toBe('error')
    expect(r.message).toMatch(/network/i)
  })

  it('invalid JSON response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('bad json') },
    })
    const r = await parseNaturalLanguageRule('test')
    expect(r.status).toBe('error')
  })

  it('invalid structured rule', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', rule: { scope: 'brand', appliesTo: 'X', type: 'percentage', value: 200, stackable: true } }),
    })
    const r = await parseNaturalLanguageRule('test')
    expect(r.status).toBe('error')
  })

  it('empty description', async () => {
    const r = await parseNaturalLanguageRule('')
    expect(r.status).toBe('error')
  })
})
