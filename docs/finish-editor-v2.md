# Feature 10B — Finish Editor v2

Production `FinishScreen` edits the canonical vNext `WindowFinishMeasurement` directly. The application helper `finish-editor-v2` creates incomplete drafts, changes supported work composition, validates the save boundary, delegates width selection to Feature 4, and accepts exact manual final prices. No editor price model or pricing formulas were added.

Six canonical compositions are available: interior slopes, slopes + sill, sill only; exterior slopes, slopes + drip, drip only. Interior and exterior are mutually exclusive. Empty optional room/name inputs become «Без помещения» / «Отделка окна», following Feature 10A. Selected hidden materials and explicit width overrides survive editing; new materials come only from active snapshot entries.

Width, height and actual depth start empty. Text buffers accept decimal millimetres (including a comma) and suppress live price/save until committed. Invalid or incomplete values never cross the canonical save boundary. Depth is shared by all elements, as defined by the existing contract; independent sill/drip depths are not introduced.

Width selection calls `selectFinishWidthVariant`, including inclusive actual-depth limits, deterministic ties and explicit overrides. Allowances come from the configuration snapshot, affect quantity only, and are displayed under collapsed additional parameters. The measurement contract has no editable allowances. Purchase costs, reserve and markup controls are not part of the editor.

Preview uses `estimateDraft` → Feature 5 totals → `estimateFinishVNext` → Feature 4. The editor displays the canonical client finish price and separate additional works. It performs no commercial rounding. Unresolved finish has no trustworthy total, remains saveable, and offers a material change or manual price. A missing configured material is a validation error, distinct from an existing material with no fitting width. The starter catalog has no exterior products: the editor explains this and never invents a product or price.

Manual prices must be positive safe integer minor-unit amounts. The existing exact RUB parser rejects fractional kopecks; no cost basis is fabricated. The existing revision rule is shared with a draft-safe boundary so incomplete geometry also invalidates manual confirmation. Geometry, depth, side, work composition, selections and additional works require reconfirmation. Metadata does not. Reverting a size does not clear `needsConfirmation`; confirmation or a new manual price must be explicit. Unconfirmed manual prices can be saved with unresolved totals, per the existing contract. Rendering preserves exact kopecks even at the safe-integer limit.

The saved Balcony Block card has «Добавить отделку». The application derives width from the sum of window sections plus door width, and height from door height. Depth stays empty. The editor receives a fresh ID and a finish snapshot from the active Calculation. Save adds a separate measurement; cancel makes no repository write. The source block and its configuration remain independent. No source-link field exists in the contract, so none was invented.

Existing finish edits use their per-measurement snapshot; new measurements use the active Calculation's settings snapshot and rounding step. Mutable global Settings do not supply prices or options. Save uses the existing App / active Calculation repository path. Drafts, buffers and bridge seeds are never persisted. Additional works retain the existing component and Feature 5 rounding; insulation/sealing remain outside Feature 4.

The editor has one column, visible primary dimensions, decimal keypads, 48px controls, collapsed secondary parameters/works, and Russian material/price feedback. Main flow and Summary were not redesigned; App changes only carry the finish seed and expose the bridge action. Pricing, Settings, transition, Proposal and PDF implementations are unchanged.

## Verification

- `pnpm test tests/finish-editor-v2.test.tsx --maxWorkers=2`
- `node tests/browser/finish-editor-v2.cjs` against `pnpm dev --host 127.0.0.1`; optional `PLAYWRIGHT_MODULE`, `FINISH_URL`, `FINISH_SCREENSHOT_DIR`.
- Browser fixture mounts the production App with in-memory repository ports and valid, deliberately different mutable Settings. It checks six compositions, selection boundaries/ties/allowances, exact manual price/reconfirmation, unresolved persistence, edit/cancel, additional works, and separate finish creation from one/two-window blocks at 375px.
- Regressions: finishing pricing, Calculation totals, Feature 8 transition, Feature 10A editors/browser tests, geometry/measurement tests, full suite, typecheck, build and whitespace check.
