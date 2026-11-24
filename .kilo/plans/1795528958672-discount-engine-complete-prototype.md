# Opptra Discount Engine — Final Implementation Plan

## 1. Final Architecture & Data Flow

```
CSV rules/cart  ─┐
PDF cart        ─┼─► adapters (csvParser, pdfParser, nlParser) ─► validators ─► typed models (DiscountRule, CartItem)
NL description  ─┘                                                          │
                                                                             ▼
                                                                  discountEngine (single source of truth)
                                                                  - ruleMatchesItem
                                                                  - calculateDiscountAmount (paise)
                                                                  - applyDiscounts (item-level)
                                                                  - applyCartDiscount (cart-level)
                                                                  - processCart -> { itemResults, subtotal, cartDiscount, cartAppliedRules, cartReasoning, finalTotal }
                                                                             │
                                                                             ▼
                                                                  React UI (presentation only)
```

- Core engine never knows input source.
- LLM and PDF logic isolated in adapters; never touch engine.
- All money computed in integer paise internally; results converted to whole rupees at the boundary.

### Data flow (cart-level)
1. Item-level discounts applied to each item (cart-scoped rules excluded).
2. Subtotal = sum of item final prices (in paise, then displayed rupees).
3. Eligible cart rules (subtotal ≥ minCartValue) selected.
4. Non-stackable winner by max rupee saving; stackables (percentage then flat) applied sequentially.
5. Final total = subtotal − cart discount. All values reconciled.

## 2. Folder / File Structure

```
src/
  engine/
    discountEngine.js     core (paise-based)
    validators.js         DiscountRule, CartItem, LLM response validation
    csvParser.js          CSV adapters
    pdfParser.js          PDF text extraction + table parse (client)
    nlParser.js           client -> /api/parse-rule + validation + state contract
  components/
    CsvUploader.jsx
    PdfUploader.jsx
    NaturalLanguageRule.jsx
    DataTable.jsx
    ErrorBanner.jsx
    CartSummary.jsx
  App.jsx
  main.jsx
api/
  parse-rule.js           shared handler (Vercel + Vite dev adapter)
vite.config.js            + dev middleware plugin
vitest.config.js
tests/
  discountEngine.test.js
  validators.test.js
  csvParser.test.js
  pdfParser.test.js
  nlParser.test.js
  integration.test.jsx (mandatory)
```

## 3. Technology & Library Choices

- React 18 + Vite (existing).
- papaparse (existing) for CSV.
- pdfjs-dist for text-based PDF extraction (client-side, no OCR).
- Vitest + @testing-library/react + jsdom for tests.
- No OpenAI SDK: use `fetch` against an OpenAI-compatible endpoint to keep deps minimal and allow provider swap via env.
- No database, auth, or persistence.

## 4. LLM Provider Choice & Integration

**Choice: OpenAI-compatible API (default `gpt-4o-mini`), configurable via env.**

Reasoning:
- Reliable JSON mode (`response_format: { type: 'json_object' }`) with a schema described in the prompt.
- Widely available, well-documented, low cost for this use case.
- Provider/base URL/model all env-configurable, so it can be swapped to Groq/OpenRouter/etc. without engine changes.
- No vendor lock-in in business logic: only `api/parse-rule.js` knows about HTTP.

Integration:
- Frontend calls `/api/parse-rule` (same origin) with `{ description }`.
- Server handler validates input, calls provider, parses JSON, validates against strict schema, returns a contract:
  - `{ status: 'ready', rule }`
  - `{ status: 'needs_clarification', missing: [...], message }`
  - `{ status: 'error', message }`
- Missing credentials => `{ status: 'error', message: 'LLM not configured...' }` (no crash).
- Ambiguous input ("Give a discount for big orders.") => `needs_clarification` listing missing percentage/amount and minimum cart value.
- Stackability defaults to `false` when not specified.
- Client shows parsed rule for confirm/discard; on confirm generates `ruleId` (`RULE-NL-<timestamp>`), adds to active rules, recalculates.
- Never expose API key (server-side only, env vars `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`).
- Use Structured Outputs (`response_format: { type: 'json_schema', json_schema: { strict: true, schema } }`) when supported; fall back to JSON mode + prompt schema otherwise. Server-side validation always.

## 5. Monetary Accuracy (Paise)

- Convert rupee inputs to integer paise (`Math.round(rupees * 100)`).
- All discount math in paise (integer). Percentages: `Math.round(pricePaise * value / 100)`.
- Round each final item price to nearest whole rupee before summing subtotal.
- Cart discount and final total rounded consistently (nearest rupee).
- Clamp final prices at 0 paise.
- Displayed item prices sum to displayed subtotal; subtotal − cart discount = final total.
- Sample verification: subtotal ₹5,932, cart discount ₹593, final ₹5,339.

## 6. Stackable Ordering

- Sort stackable rules: percentage first, then flat; within each group preserve input order.
- Apply sequentially on the running price.
- Mixed percentage/flat tested; CSV input order must not change result.

## 7. PDF Architecture

- `pdfParser.js`: extract text via pdfjs-dist, identify header columns (Product/Brand/Platform/Base Price), parse rows into validated `CartItem[]`, return `{ data, errors }`.
- Scanned/unreadable PDF => clear error.
- All-or-nothing replacement: malformed/missing required rows => row-specific errors, no replacement; preserve active rules and existing cart.
- State layer (App) replaces cart, preserves rules, triggers recalculation.
- Tested separately and via integration.

## 8. Local Dev & Deployment

- Shared handler `api/parse-rule.js` exports `handleRequest(req, res)`.
- Vercel: file is serverless function automatically.
- Vite dev: plugin registers middleware calling same handler on `/api/parse-rule`.
- Env via `.env.local` (gitignored) for local; Vercel env vars for prod.
- Build: `npm run build` -> `dist/`.

## 9. Implementation Phases

Phase 0 (baseline): Run supplied sample CSVs, record existing behavior.
Phase 1 (done exploration) → Phase 2 engine paise refactor + cart-level + tests → Phase 3 LLM endpoint + UI + tests → Phase 4 PDF parser + UI + tests → Phase 5 UI polish + auto-recalc → Phase 6 docs + build verification.

Each phase: verify existing functionality still works.

## 10. Testing Strategy

Unit:
- Item-level: percentage, flat, competing non-stackable, stackables, stackable-only, none, over-discount clamp, mixed ordering.
- Cart-level: above/exact/below threshold, no rule, multiple rules, stackable cart rules.
- Monetary rounding reconciliation.
- Validators: valid/invalid rules, LLM JSON (missing fields, bad scope/type, negative, ambiguous).
- CSV parsers: missing fields, invalid values.
- PDF parser: valid, empty, malformed row, missing column, invalid price (mock pdfjs).
- NL parser: ready/needs_clarification/error contracts, confirm/discard.

Integration:
- Cart replacement preserves rules + recalc.
- Auto-recalc on rule/cart change.
- Production build (`npm run build`).

## 11. Risks & Edge Cases

- pdfjs worker setup in Vite (use `?url` import).
- LLM JSON parsing failures / refusals handled.
- Threshold exact equality (>=).
- Flat discount larger than price (clamp 0).
- Empty PDF / no table.
- Missing API key (graceful).
- Rounding display vs internal precision (documented).
- CORS not needed (same origin).

## 12. Final Corrections (Approved)

1. **LLM output**: Use `response_format: { type: 'json_schema', json_schema: { strict: true, ... } }` when provider/model supports Structured Outputs. Fall back to JSON mode + prompt schema only when unsupported. Server-side validation always retained.

2. **Provider config**: Use generic env vars `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`. Single OpenAI-compatible integration; no provider abstraction.

3. **Monetary reconciliation**: Compute discounts in paise; round each final item price to nearest whole rupee before summing subtotal; cart discount and final total rounded consistently; displayed item prices sum to displayed subtotal; subtotal − cart discount = final total.

4. **Integration tests**: Mandatory (not optional). Cover cart replacement, active rule preservation, NL confirm/discard, automatic recalculation.

5. **PDF failure handling**: All-or-nothing cart replacement. Malformed/missing required rows => row-specific errors, no replacement; preserve active rules and existing cart.

6. **Baseline verification**: Before modifying engine, run supplied sample CSVs and record existing behavior; preserve all working functionality throughout.

## 13. Open Questions

- None blocking; LLM key availability handled gracefully.
