# Feature 11 — Main Mobile Flow + Summary

Production navigation uses the existing `App` state: calculation home → type selection → canonical Feature 10 editor → home, and home ↔ summary. Four entry actions open Window, Balcony, Balcony Block (the Window editor with a creation-only type), and Finish. Save keeps the existing ID on edit; cancel discards only the editor draft. Removal has an inline confirmation and uses `deleteMeasurement` without cascading. Existing copy/order behavior remains.

New calculations use Feature 8 `createCalculation` with the loaded active Settings v2 and `ActiveCalculationRepository.save`. The existing owner-scoped repository owns persistence and active-ID semantics. No schema, transition, migration, owner, or storage adapter changes are introduced.

Client name, phone and object address are the three optional metadata fields exposed. Save is explicit through `updateCalculationDetails`; existing identity/name/creation time, measurements, configuration, order works and discounts are preserved, and `updatedAt` advances. There are no canonical measurement-date/measurer fields in v4, so none are invented. Saving initial metadata folds the form to keep the total and add action near the top.

`estimateCalculation` is the Feature 5 authority for the current calculation. `MeasurementCard`, `WorkLines`, `CalculationTotal` and `CalculationSummary` render its results directly. These components introduce no pricing DTO, persistence, formula, conversion, or alternative aggregation. Cards display names, dimensions, shape/material/profile and canonical measurement total. Summary renders glazing product and installation separately, finish as “Отделка под ключ”, measurement works separately from order works, subtotal, discount, fixed override, commercial rounding adjustment, and final total. Money formatting preserves safe integer kopecks.

Order works select active catalog entries from `settingsSnapshot.additionalWorks` through `createAdditionalWorkSnapshot`, or use the existing custom-work contract. Quantity/unit editing is enabled for order works only; positive decimal quantities are supported. Draft line previews call `updateOrderAdditionalWorks` and Feature 5 without persistence. Explicit Save applies the list; incomplete/overflowing inputs cannot save. No money multiplication is performed in React.

The existing discount application operations and `DiscountEditor` are reused. For v4 both current totals and previews come from Feature 5. Fixed prices use exact minor-unit input parsing, retain confirmation/invalidation semantics, and are never commercially rounded again. Manual finish prices remain separate from the order override.

Feature 5 unresolved propagation is authoritative. A finish requiring clarification or manual confirmation has no card price; its Summary entry identifies it, and the final Calculation total is withheld. Persisting/editing remains available. Resolving/removing the finish restores totals as permitted by any remaining fixed-price confirmation. Empty calculations show an add action without a misleading zero final total.

All measurement configuration, cards, summary, work catalog/prices, rounding and discounts use the stored calculation snapshots. Global Settings mutations affect newly created calculations only. Proposal remains disabled for every v4 calculation with the existing explanation. Legacy Proposal/PDF generators are unchanged. No v4 → v3 conversion or later document feature is introduced.

The shell is a single column at 375px, with 48px controls, wrapping cards, compact client context, primary add/summary actions above the list, explicit return actions, and focus/scroll reset when navigating. Repository failures retain persisted data and editable drafts with Russian feedback.

Verification:

- `tests/main-mobile-flow-summary.test.tsx`: 44 targeted application/render/storage cases for creation, metadata, owner scope, each measurement kind, deletion independence/order, cards, work quantities, canonical totals, discount/fixed/manual/unresolved, empty state, snapshots and exact safe-integer money input.
- `tests/browser/main-mobile-flow-summary.{html,tsx,cjs}`: production App with the real active Dexie repository and an injected owner; realistic 375px scenario, all four editor kinds, create/edit/cancel/remove/bridge, order works, invalid input, repository failure/retry, reload/active identity/owner, snapshot mutation and updated creation, summary/discount/fixed/manual/unresolved, touch/overflow and console/runtime checks.
- Existing Feature 3/4/5/8/9/10 and storage/migration tests remain unchanged. Existing 10A/10B browser harnesses run against the integrated shell.

Run the browser harness against `pnpm dev --host 127.0.0.1` with `node tests/browser/main-mobile-flow-summary.cjs`. `PLAYWRIGHT_MODULE` can point to the bundled Playwright runtime; optional `FLOW_SCREENSHOT_DIR` writes home, summary and unresolved Summary captures. The test uses a unique database per run and does not touch user calculations.
