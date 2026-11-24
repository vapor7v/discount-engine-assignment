import { useState } from 'react'
import { parseNaturalLanguageRule } from '../engine/nlParser.js'

export default function NaturalLanguageRule({ onAddRule }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notConfigured, setNotConfigured] = useState(false)

  async function handleParse() {
    setError('')
    setResult(null)
    setNotConfigured(false)
    if (!input.trim()) {
      setError('Please enter a discount description.')
      return
    }
    setLoading(true)
    try {
      const r = await parseNaturalLanguageRule(input)
      if (r.status === 'error') {
        if (/not configured/i.test(r.message || '')) {
          setNotConfigured(true)
        } else {
          setError(r.message)
        }
        return
      }
      setResult(r)
    } catch (e) {
      setError(e && e.message ? e.message : 'Unexpected error.')
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    if (result && result.status === 'ready') {
      onAddRule(result.rule)
      setResult(null)
      setInput('')
    }
  }

  function handleDiscard() {
    setResult(null)
  }

  const rule = result && result.status === 'ready' ? result.rule : null

  return (
    <div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder='e.g. "20% off for Natura Casa brand, stackable with other offers"'
        rows={3}
        style={{
          width: '100%',
          padding: '0.6rem',
          border: '1px solid #CECECE',
          borderRadius: 4,
          fontSize: 13,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          onClick={handleParse}
          disabled={loading}
          style={{
            background: '#131A48', color: '#fff', border: 'none', borderRadius: 4,
            padding: '0.5rem 1.2rem', fontSize: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}
        >
          {loading ? 'Parsing...' : 'Parse Rule'}
        </button>
        {loading && <span style={{ fontSize: 12, color: '#888' }}>Contacting LLM...</span>}
      </div>

      {notConfigured && (
        <div style={{ marginTop: '0.5rem', background: '#f5f5f5', border: '1px solid #CECECE', borderRadius: 4, padding: '0.6rem 0.9rem', fontSize: 12, color: '#131A48' }}>
          Natural-language rules are disabled. Configure <code>LLM_API_KEY</code> on the server to enable this feature.
        </div>
      )}

      {error && (
        <div style={{ marginTop: '0.5rem', background: '#fce8e8', border: '1px solid #e57373', borderRadius: 4, padding: '0.6rem 0.9rem', fontSize: 12, color: '#5a1010' }}>
          {error}
        </div>
      )}

      {result && result.status === 'needs_clarification' && (
        <div style={{ marginTop: '0.5rem', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4, padding: '0.6rem 0.9rem', fontSize: 12, color: '#5a4a00' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Needs clarification</div>
          <div>{result.message}</div>
          {result.missing && result.missing.length > 0 && (
            <div style={{ marginTop: 4 }}>Missing: {result.missing.join(', ')}</div>
          )}
        </div>
      )}

      {rule && (
        <div style={{ marginTop: '0.5rem', background: '#f0faf2', border: '1px solid #a5d6a7', borderRadius: 4, padding: '0.8rem 1rem' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#1e5c2c', marginBottom: 6 }}>Parsed rule (review before adding)</div>
          <div style={{ fontSize: 12, color: '#131A48', lineHeight: 1.6 }}>
            <div><strong>Scope:</strong> {rule.scope}</div>
            {rule.appliesTo && <div><strong>Applies To:</strong> {rule.appliesTo}</div>}
            <div><strong>Discount Type:</strong> {rule.type}</div>
            <div><strong>Discount Value:</strong> {rule.type === 'percentage' ? `${rule.value}%` : `Rs.${rule.value}`}</div>
            <div><strong>Stackable:</strong> {rule.stackable ? 'Yes' : 'No'}</div>
            {rule.scope === 'cart' && (
              <div style={{ fontWeight: 700, color: '#1e5c2c' }}>
                <strong>Minimum Cart Value:</strong> Rs.{rule.minCartValue}
              </div>
            )}
          </div>
          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleConfirm} style={{ background: '#1e5c2c', color: '#fff', border: 'none', borderRadius: 4, padding: '0.4rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
              Confirm & Add
            </button>
            <button onClick={handleDiscard} style={{ background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4, padding: '0.4rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
