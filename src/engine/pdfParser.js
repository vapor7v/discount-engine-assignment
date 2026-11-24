import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { validateCartItem } from './validators.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

async function extractTextLines(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const allLines = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items = content.items
      .filter((it) => it.str && it.str.trim() !== '')
      .map((it) => ({ text: it.str, x: it.transform[4], y: it.transform[5], width: typeof it.width === 'number' ? it.width : it.str.length * 4.5 }))

    const groups = []
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
    for (const it of sorted) {
      const last = groups[groups.length - 1]
      if (!last || Math.abs(it.y - last.y) > 3) {
        groups.push({ y: it.y, items: [it] })
      } else {
        last.items.push(it)
      }
    }

    for (const g of groups) {
      const rowItems = [...g.items].sort((a, b) => a.x - b.x)
      let line = ''
      let prevEnd = null
      for (const it of rowItems) {
        if (prevEnd !== null && it.x - prevEnd > 3) line += '  '
        line += it.text
        prevEnd = it.x + (it.width || it.text.length * 4.5)
      }
      const trimmed = line.trim()
      if (trimmed) allLines.push(trimmed)
    }
  }

  return allLines
}

const isHeaderLine = (l) => /product/i.test(l) && /brand/i.test(l) && /platform/i.test(l) && /price/i.test(l)
const isFooterLine = (l) => /total|page\s*\d|^\s*\d+\s*$/i.test(l)

export function parseCartPDFLines(lines) {
  const data = []
  const errors = []

  if (!lines || lines.length === 0) {
    return { data, errors: ['PDF contains no extractable text (possibly scanned or empty).'] }
  }

  const headerIdx = lines.findIndex(isHeaderLine)
  if (headerIdx === -1) {
    return { data, errors: ['Missing required table header (Product, Brand, Platform, Base Price).'] }
  }

  const dataLines = lines.slice(headerIdx + 1)

  if (dataLines.length === 0) {
    return { data, errors: ['No cart rows found in PDF.'] }
  }

  dataLines.forEach((line, i) => {
    const rowNum = i + 1
    const trimmed = line.trim()
    if (!trimmed || isHeaderLine(trimmed) || isFooterLine(trimmed)) return

    const fields = trimmed.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean)
    if (fields.length < 4) return

    let product, brand, platform, priceStr
    if (fields.length === 4) {
      ;[product, brand, platform, priceStr] = fields
    } else {
      priceStr = fields[fields.length - 1]
      platform = fields[fields.length - 2]
      brand = fields[fields.length - 3]
      product = fields.slice(0, fields.length - 3).join(' ')
    }

    const priceCandidate = String(priceStr).trim()
    const stripped = priceCandidate.replace(/^[₹$€£\s]+|[₹$€£\s]+$/g, '')
    if (!/^[\d,]+(?:\.\d{1,2})?$/.test(stripped)) {
      errors.push(`Row ${rowNum}: invalid base price "${priceStr}"`)
      return
    }
    const noThousands = stripped.replace(/,/g, '')
    const price = parseFloat(noThousands)
    if (isNaN(price) || price <= 0) {
      errors.push(`Row ${rowNum}: invalid base price "${priceStr}"`)
      return
    }

    const item = {
      itemId: `PDF-${rowNum}`,
      product,
      brand,
      platform,
      basePrice: Math.round(price),
    }

    const v = validateCartItem(item)
    if (!v.ok) {
      v.errors.forEach((e) => errors.push(`Row ${rowNum}: ${e}`))
      return
    }

    data.push(item)
  })

  if (errors.length > 0) {
    return { data: [], errors }
  }
  if (data.length === 0) {
    return { data: [], errors: ['No valid cart rows found in PDF.'] }
  }
  return { data, errors }
}

export async function parseCartPDF(file) {
  try {
    const lines = await extractTextLines(file)
    return parseCartPDFLines(lines)
  } catch (e) {
    return { data: [], errors: [`Failed to read PDF: ${e && e.message ? e.message : 'unknown error'}`] }
  }
}
