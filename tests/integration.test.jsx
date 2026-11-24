import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'

function uploadFile(input, content, name, type = 'text/csv') {
  const file = new File([content], name, { type })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('integration', () => {
  it('loads sample csvs and calculates', async () => {
    render(<App />)
    const rulesInput = screen.getAllByRole('button').length // placeholder
    // find file inputs
    const inputs = document.querySelectorAll('input[type="file"]')
    // rules csv
    const rulesCsv = 'rule_id,scope,applies_to,type,value,stackable,min_cart_value\nRULE-01,platform,Amazon India,percentage,15,false,\nRULE-04,cart,,percentage,10,false,4000'
    const cartCsv = 'item_id,product,brand,platform,base_price\nI1,P,B,Amazon India,1000'
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv, 'cart.csv')
    await waitFor(() => {
      expect(screen.getByText(/Cart subtotal/)).toBeTruthy()
    })
  })

  it('cart replacement preserves rules', async () => {
    render(<App />)
    const inputs = document.querySelectorAll('input[type="file"]')
    const rulesCsv = 'rule_id,scope,applies_to,type,value,stackable,min_cart_value\nRULE-01,platform,Amazon India,percentage,15,false,'
    const cartCsv1 = 'item_id,product,brand,platform,base_price\nI1,P,B,Amazon India,1000'
    const cartCsv2 = 'item_id,product,brand,platform,base_price\nI2,P2,B,Amazon India,2000'
    uploadFile(inputs[0], rulesCsv, 'rules.csv')
    uploadFile(inputs[1], cartCsv1, 'cart.csv')
    uploadFile(inputs[1], cartCsv2, 'cart.csv')
    await waitFor(() => {
      expect(screen.getByText(/Final payable/)).toBeTruthy()
    })
  })
})
