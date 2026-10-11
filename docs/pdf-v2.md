# Feature 14: PDF v2

Canonical flow: Calculation v4 → Feature 5 / buildProposalDocumentV2 →
ProposalDocument v2 → shared customer presentation → PDF v2. The renderer accepts
only the detached DTO. No pricing, mutable calculator Settings, v4 → v3 adapter,
storage, or legacy PDF calls. ProposalDocument v2 and legacy PDF files are unchanged.

`src/presentation/proposal-presentation.ts` owns the Feature 13 vocabulary,
configuration allowlist, seller, works quantity and summary semantics.
`customer-money.ts` retains exact DTO digits and hides only zero kopecks.
`glazing-drawing.ts` owns the existing frame/sash/glass contours, opening symbols
and dimension annotations. Old UI entry points re-export the shared modules;
Client View, PNG and PDF use them without importing each other.

The composition root lazy-loads `infrastructure/pdf-v2/render-proposal-pdf-v2.ts`
through `application/documents/proposal-pdf-v2.ts`. Existing jsPDF is reused;
no production dependency was added. All text, dimension marks, contours and
opening symbols are PDF vectors; neither pages nor schemes are screenshots.

A4 portrait is 210 × 297 mm with 16 mm content margins (178 × 265 mm content).
The restrained footer is at y=289 mm. Body text is 10.5 pt, configuration 9.5 pt,
captions 8.5 pt, item headings 14 pt, document title 20 pt, final total 22 pt.
Colors and hierarchy follow Feature 13; the page is white for print.

Font: embedded OFL Noto Sans derivative, Zamerok Sans. The legacy font subset
does not include U+2212, so the v2 derivative adds a mathematical minus using
the existing en dash outline, centered on the plus axis with its advance.
The upstream font and its license are retained. Reproduce with dev-only
fontTools: `python tests/tools/build-pdf-v2-font.py`. No system font/network lookup
is needed at generation time. The existing regular outlines use a restrained
0.08 mm text stroke for heading/total emphasis. Glyphs and exact negative PDF
text extraction are tested. This does not add a font editor or font setting.

Pagination uses embedded font metrics and fixed mm values, independent of
viewport/DPR. The next item starts on the current page whenever it fits. Small
items move intact only when necessary. Balconies can use remaining space for
title and a whole plane group, even when the entire item would fit on a fresh
page. They split only between plane groups or before the configuration/price
block; title and first scheme stay together, as do configuration and price rows.
More than four sections in any plane selects
full-width plane rows. Otherwise slots follow physical plane widths, giving
the facade more space. Minimal continuation context replaces duplicated item
data. Finish cards and summary remain together; a short closing card can move
with the summary. Extremely long names/work lists wrap and flow as text.
Schemes are never cut. The planner does not impose a page count. Font sizes,
scheme dimensions and margins are unchanged; tighter row leading, 1 mm internal
spacers and 4 mm card gaps remove unused vertical space. The global dimensions
note is omitted; dimensions remain on the schemes.

Window and balcony block show title → dimensioned scheme → essential selected
configuration → product, installation, applicable works and total. Balcony
retains straight/L/U and PVC/aluminium semantics, plane headings, two rows,
sandwich fill and sliding arrows. Finish shows compact selected materials and
one turnkey price (unless real additional works justify a total). Works use DTO
quantity/unit/amount, never unit costs or catalog IDs. Summary shows subtotal
and discount only when there is a discount, then the dominant final amount.
Unresolved finish shows the canonical clarification message and no fabricated
final total. Rounding adjustment and internal cost/area metrics are hidden.

Both estimate and Client View expose `Скачать PDF`. The estimate builds a v2
snapshot with independent DocumentSettings seller information; renderer never
loads Settings. Client View passes its existing DTO. Progress is `Формируем PDF…`;
a ref and disabled control prevent duplicate generation. A concise failure
preserves the view and allows retry. A React unmount prevents a delayed download.
The download is `zamerok-offer.pdf`; temporary anchor/URL are released in finally,
and the blob is not persisted. PDF title uses the canonical object title and
Creator is ЗамерОк; jsPDF supplies its Producer metadata.

Validation:

- `pnpm test --maxWorkers=2 tests/proposal-pdf-v2.test.ts` (real jsPDF bytes,
  font/vector/content/architecture/money/layout checks).
- `node tests/browser/pdf-v2.cjs` against `pnpm dev` using bundled Playwright:
  six document scenarios, native download, duplicate/progress/failure/retry,
  snapshot/settings boundary, navigation cancellation and resource cleanup.
- Existing ProposalDocument v2, legacy PDF, Feature 13 presentation, PNG export,
  Client View, mobile flow and architecture tests remain required.
- `tests/tools/verify-pdf-v2.py` verifies real PDF text, exact money, vectors,
  page counts and physical glyph/rectangle bounds using local pypdf/pdfplumber.
- Full suite, typecheck, build and `git diff --check` before review.

Local review files live under `review-artifacts/feature-14/`, explicitly ignored
by Git and never to be committed. The browser harness creates window.pdf,
pvc-u.pdf, aluminium.pdf, full.pdf, exact.pdf, unresolved.pdf and download.pdf.
Poppler can render them, e.g.:
`pdftoppm -r 120 -png review-artifacts/feature-14/full.pdf review-artifacts/feature-14/full-page`.
The representative full proposal uses two A4 pages; the standalone window,
PVC U balcony and aluminium balcony each use one. Page counts reflect content.

Browser QA uses desktop Edge with phone viewport emulation; physical mobile
Safari/Android PDF viewers are not covered. Downloads follow the browser's
normal local-file behavior. The embedded font retains the existing Latin,
Greek and Cyrillic repertoire; no new CJK font fallback is introduced.
