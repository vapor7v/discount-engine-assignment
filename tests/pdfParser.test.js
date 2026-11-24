import { describe, it, expect } from 'vitest'
import { parseCartPDFLines } from '../src/engine/pdfParser.js'

describe('parseCartPDFLines', () => {
  it('valid pdf lines', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Cushion Cover  Natura Casa  Amazon India  ₹1,299',
      'Bed Sheet Set  Natura Casa  Flipkart  ₹849',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(errors).toHaveLength(0)
    expect(data).toHaveLength(2)
    expect(data[0].product).toBe('Cushion Cover')
    expect(data[0].basePrice).toBe(1299)
  })

  it('empty pdf', () => {
    const { data, errors } = parseCartPDFLines([])
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('malformed row', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'OnlyOneColumn',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('missing required column (invalid price)', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Item  Brand  Platform  abc',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('invalid price', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Item  Brand  Platform  -5',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })
})
