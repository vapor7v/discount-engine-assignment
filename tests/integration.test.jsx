import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'

vi.mock('../src/engine/pdfParser.js', () => ({
  parseCartPDF: vi.fn(),
}))

import { parseCartPDF } from '../src/engine/pdfParser.js'

function uploadFile(input, content, name, type = 'text/csv') {
  const file = new File([content], name, { type })
  fireEvent.change(input, { target: { files: [file] } })
}

const rulesCsv = `rule_id,scope,applies_to,type,value,stackable,min_cart_value
RULE-01,platform,Amazon India,percentage,15,false,
RULE-02,brand,Natura Casa,flat,150,false,
RULE-03,platform,Flipkart,percentage,10,true,
RULE-04,cart,,percentage,10,false,4000`

const cartCsv = `item_id,product,brand,platform,base_price
ITEM-01,Cushion Cover,Natura Casa,Amazon India,1299
ITEM-02,Bed Sheet Set,Natura Casa,Flipkart,849
ITEM-03,Wall Shelf,LivSpace Pro,Amazon India,599
ITEM-04,Ceramic Vase,LivSpace Pro,Noon,2499
ITEM-05,Cutting Board,Nordic Basics,Amazon India,449
ITEM-06,Desk Organiser,Nordic Basics,Flipkart,899`

describe('integration', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
    parseCartPDF.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('CSV workflow shows expected amounts', async () => {
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => {
      expect(screen.getByText(/5,932/)).toBeTruthy()
    })
    expect(screen.getByText(/5,339/)).toBeTruthy()
    expect(screen.getAllByText((c) => c.includes('1,104')).length).toBeGreaterThan(0)
  })

  it('NL confirm increases rule count and recalculates', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', rule: { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 5, stackable: true } }),
    })
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => screen.getByText(/4 rules loaded/))

    const textarea = screen.getByPlaceholderText(/e.g./)
    fireEvent.change(textarea, { target: { value: '5% off Natura Casa stackable' } })
    fireEvent.click(screen.getByText('Parse Rule'))
    await waitFor(() => screen.getByText('Confirm & Add'))
    fireEvent.click(screen.getByText('Confirm & Add'))

    await waitFor(() => {
      expect(screen.getByText(/5 rules loaded/)).toBeTruthy()
    })
    expect(screen.getAllByText('Natura Casa').length).toBeGreaterThan(0)
  })

  it('NL discard does not add rule or change totals', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', rule: { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 7, stackable: true } }),
    })
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => screen.getByText(/4 rules loaded/))

    const beforeCount = screen.getByText(/4 rules loaded/)
    expect(beforeCount).toBeTruthy()

    const textarea = screen.getByPlaceholderText(/e.g./)
    fireEvent.change(textarea, { target: { value: '7% off Natura Casa stackable' } })
    fireEvent.click(screen.getByText('Parse Rule'))
    await waitFor(() => screen.getByText('Discard'))
    fireEvent.click(screen.getByText('Discard'))
    await waitFor(() => {
      expect(screen.queryByText('Confirm & Add')).toBeNull()
    })
    expect(screen.getByText(/4 rules loaded/)).toBeTruthy()
    expect(screen.getByText(/5,932/)).toBeTruthy()
  })

  it('PDF cart replacement', async () => {
    parseCartPDF.mockResolvedValue({
      data: [{ itemId: 'PDF-1', product: 'New Product', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1000 }],
      errors: [],
    })
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => screen.getByText(/Cushion Cover/))

    const pdfInput = document.querySelectorAll('input[type="file"]')[2]
    const pdfFile = new File(['dummy'], 'cart.pdf', { type: 'application/pdf' })
    fireEvent.change(pdfInput, { target: { files: [pdfFile] } })

    await waitFor(() => {
      expect(screen.getByText('New Product')).toBeTruthy()
    })
    expect(screen.queryByText('Cushion Cover')).toBeNull()
    expect(screen.getByText(/rules loaded/)).toBeTruthy()
    // new item discount: 15% platform + 150 flat brand? Actually platform Amazon 15% = 150, brand flat 150 -> non-stackable max 150, final 850
    expect(screen.getAllByText(/850/).length).toBeGreaterThan(0)
  })

  it('invalid PDF does not replace cart', async () => {
    parseCartPDF.mockResolvedValue({ data: [], errors: ['Row 1: invalid base price "abc"'] })
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => screen.getByText(/Cushion Cover/))

    const pdfInput = document.querySelectorAll('input[type="file"]')[2]
    const pdfFile = new File(['dummy'], 'bad.pdf', { type: 'application/pdf' })
    fireEvent.change(pdfInput, { target: { files: [pdfFile] } })

    await waitFor(() => {
      expect(screen.getByText(/invalid base price/)).toBeTruthy()
    })
    expect(screen.getAllByText('Cushion Cover').length).toBeGreaterThan(0)
    expect(screen.getByText(/rules loaded/)).toBeTruthy()
  })

  it('automatic recalculation on cart change', async () => {
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => screen.getByText(/5,932/))

    const newCartCsv = `item_id,product,brand,platform,base_price\nX,Test,Natura Casa,Amazon India,1000`
    uploadFile(inputs[1], newCartCsv, 'cart.csv')
    await waitFor(() => {
      expect(screen.getByText(/1,000|1000/)).toBeTruthy()
    })
    expect(screen.queryByText(/5,932/)).toBeNull()
  })
})
