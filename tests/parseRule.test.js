import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleRequest } from '../api/parse-rule.js'

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.end = (d) => { res.body = d }
  return res
}

function mockReq(method, body) {
  return { method, body }
}

describe('parse-rule API', () => {
  const originalEnv = { ...process.env }
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_BASE_URL = 'https://example.com/v1'
    process.env.LLM_MODEL = 'test-model'
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('POST only', async () => {
    const res = mockRes()
    await handleRequest(mockReq('GET', {}), res)
    expect(res.statusCode).toBe(405)
  })

  it('missing description', async () => {
    const res = mockRes()
    await handleRequest(mockReq('POST', {}), res)
    expect(res.statusCode).toBe(400)
  })

  it('empty description', async () => {
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: '   ' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('missing API key', async () => {
    delete process.env.LLM_API_KEY
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    expect(res.statusCode).toBe(503)
  })

  it('valid structured output', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ status: 'ready', rule: { scope: 'brand', appliesTo: 'X', type: 'percentage', value: 20, stackable: null, minCartValue: null }, missing: [], message: '' }) } }],
      }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: '20% off X' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ready')
    expect(body.rule.stackable).toBe(false)
  })

  it('needs clarification', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ status: 'needs_clarification', rule: null, missing: ['value'], message: 'missing' }) } }],
      }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'discount for big orders' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('needs_clarification')
  })

  it('unsupported structured outputs triggers fallback', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'response_format json_schema not supported' } }),
        json: async () => ({ error: { message: 'response_format json_schema not supported' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ status: 'ready', rule: { scope: 'brand', appliesTo: 'X', type: 'percentage', value: 10, stackable: false, minCartValue: null }, missing: [], message: '' }) } }],
        }),
      })
    // handleRequest calls r.json? It uses r.text and parses. Provide json method too.
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: '10% off X' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ready')
  })

  it('authentication failure does not fallback', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'invalid api key' } }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    expect(res.statusCode).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rate limiting does not fallback', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'rate limit' } }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    expect(res.statusCode).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('provider unavailable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'server error' } }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    expect(res.statusCode).toBe(502)
  })

  it('malformed response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not json',
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('error')
  })

  it('empty response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: '' } }] }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('error')
  })

  it('refusal', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { refusal: 'cannot help', content: null } }] }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('error')
    expect(body.message).toMatch(/refus/i)
  })

  it('invalid status rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ status: 'foo', rule: null, missing: [], message: '' }) } }] }),
    })
    const res = mockRes()
    await handleRequest(mockReq('POST', { description: 'test' }), res)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('error')
  })
})
