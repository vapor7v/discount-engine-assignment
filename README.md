# Opptra Discount Engine

A shopping cart discount engine with item-level and cart-level discounts, natural-language rule creation via LLM, and PDF cart import.

## Features

- CSV upload for discount rules and cart items
- PDF cart upload (text-based tables)
- Natural language discount rule input (LLM-backed, server-side)
- Item-level discounts: competing non-stackable selection + stackable stacking
- Cart-level discounts with minimum threshold
- Customer-facing pricing explanations
- Responsive dashboard UI

## Tech Stack

- React 18, Vite 5
- papaparse (CSV)
- pdfjs-dist (PDF text extraction)
- Vitest, Testing Library (tests)
- Vercel serverless function for LLM (OpenAI-compatible)

## Local Setup (under 3 steps)

1. `npm install`
2. (Optional) create `.env.local` with `LLM_API_KEY=...` (and optional `LLM_BASE_URL`, `LLM_MODEL`)
3. `npm run dev` → open http://localhost:5173

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run preview` — preview build
- `npm test` — run tests

## Environment Variables

- `LLM_API_KEY` — LLM provider API key (server-side only). Without it, NL feature is disabled gracefully.
- `LLM_BASE_URL` — OpenAI-compatible base URL (default https://api.openai.com/v1)
- `LLM_MODEL` — model name (default gpt-4o-mini)

## Testing

`npm test`

## Deployment

1. Push to GitHub.
2. Import project in Vercel.
3. Set environment variables in Vercel dashboard.
4. Build command: `npm run build`, output: `dist`.

## Architecture

See `src/engine/` for pure business logic. Adapters: `csvParser.js`, `pdfParser.js`, `nlParser.js`. Validation: `validators.js`. Core: `discountEngine.js`. LLM endpoint: `api/parse-rule.js`.

## Discount Logic

- Non-stackable rules: pick largest rupee saving.
- Stackable rules: percentage then flat, applied sequentially.
- Cart-level: applied to subtotal after item discounts, threshold inclusive.
- No match: base price, "No offers available".

## Expected Sample Results

Subtotal ₹5,932; cart discount ₹593; final ₹5,339.

## Demo Checklist

1. Upload sample rules.csv and cart.csv → Calculate → verify item prices.
2. Upload a PDF cart → verify replacement and recalc.
3. Enter NL rule → parse → confirm → verify new rule active and prices updated.
4. Test ambiguous NL input → clarification message.
5. Test cart threshold boundary (exact/below).
6. Check responsive layout on mobile width.

## Live Demo

**Production URL:** https://discount-engine-assignment-three-khaki.vercel.app/

## Demo Walkthrough

**Loom video:** https://www.loom.com/share/5ddc7abd56d44b0d8a1e54d0515df3ea

## Key Implementation Decisions

1. **Discount selection:** For competing non-stackable rules, choose the largest saving. Apply stackable discounts sequentially after the winning rule.

2. **Cart-level discounts:** Evaluate the minimum cart threshold against the subtotal after item-level discounts. The threshold is inclusive (>=).

3. **Input validation:** Keep CSV, natural-language and PDF parsing separate from the core calculation engine. Reject invalid rules and malformed PDF carts rather than silently accepting incomplete data.


- LLM provider is OpenAI-compatible; configured via env.
- PDFs are text-based; scanned PDFs rejected.
- In-memory session state only.
- Rounding: paise internally, display nearest rupee.

### Technical Architecture

For a detailed explanation of the system architecture, discount calculation pipeline, LLM integration, PDF processing and engineering decisions, see [ARCHITECTURE.md](ARCHITECTURE.md).
