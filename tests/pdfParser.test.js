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

  it('product names with spaces', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Premium Cotton Bed Sheet Set  Natura Casa  Amazon India  ₹1,299.50',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(errors).toHaveLength(0)
    expect(data[0].product).toBe('Premium Cotton Bed Sheet Set')
    expect(data[0].basePrice).toBe(1300) // rounded
  })

  it('currency symbols and commas', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Item  Brand  Platform  $1,234.56',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(errors).toHaveLength(0)
    expect(data[0].basePrice).toBe(1235)
  })

  it('empty pdf', () => {
    const { data, errors } = parseCartPDFLines([])
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('missing header', () => {
    const lines = ['Some metadata', 'Item  Brand  Platform  100']
    const { data, errors } = parseCartPDFLines(lines)
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

  it('invalid price (letters)', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Item  Brand  Platform  1299abc',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('invalid price negative', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Item  Brand  Platform  -5',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('repeated headers and metadata', () => {
    const lines = [
      'Document title',
      'Product  Brand  Platform  Base Price',
      'Item1  Brand  Platform  100',
      'Product  Brand  Platform  Base Price',
      'Item2  Brand  Platform  200',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(errors).toHaveLength(0)
    expect(data).toHaveLength(2)
  })

  it('all-or-nothing on malformed row', () => {
    const lines = [
      'Product  Brand  Platform  Base Price',
      'Item1  Brand  Platform  100',
      'Item2  Brand  Platform  bad',
    ]
    const { data, errors } = parseCartPDFLines(lines)
    expect(data).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
  })
})
