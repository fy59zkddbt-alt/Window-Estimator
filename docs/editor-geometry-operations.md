# Feature 9 — geometry editor operations

The pure integer-mm arithmetic lives in `domain/geometry/section-widths.ts`.
`application/estimate/editor-geometry-operations.ts` exposes it to future React
callers and applies it immutably to the existing vNext measurement contracts.
All resulting measurements pass the existing `validateGlazingMeasurement`.
No pricing, settings, Calculation v4, or editor layout changes are included.

Distribution uses floor(total / count), then assigns remaining millimetres from
left to right: 1001 / 2 = 501 + 500; 1001 / 3 = 334 + 334 + 333.
Widths and totals must be positive safe integers; there is no extra business
minimum. The total must be at least the count. Fractional, non-finite, unsafe,
and impossible inputs throw the project's usual `Error`, without mutation or
clamping. Direct edits also reject inconsistent input sums and invalid indices.

`updateSectionWidth(total, widths, index, width)` changes only index and index+1.
The last section (including the sole section) cannot be edited directly.
Successful operations preserve the exact integer total. Total-width changes
redistribute every section; they preserve IDs, openings, hardware and mechanism.
`distributeSectionWidths` also supports initial creation from a total and count.

Measurement operations:

- `resizeWindowWidth`, `editWindowSectionWidth`: single/double/triple and block.
- `changeWindowSectionCount`: rectangular type change, using the existing
  single/double/triple count mapping and resetting sections to fixed.
- `resizeBalconyPlaneWidth`, `editBalconySectionWidth`,
  `changeBalconyPlaneSectionCount`: operate on one plane by ID, counts 1–8.
  Count changes reset sections to fixed, matching existing domain semantics.
  Other planes, heights, levels, lower fill and material modes remain untouched.
- `changeBlockSectionCount`: 1–2 sections using the existing window-part sum.
  Existing sections retain their properties by index; an added section is fixed,
  with a collision-free ID. Incompatible door positions are rejected by domain validation.

The block contract has no stored window-part total. `resizeWindowWidth(block,
total)` accepts that total as an operation parameter; subsequent edits derive it
from the section sum. It never includes door width, adds a dimension field, or
changes the door. This supports the requested operations without a schema change.
Two-row balconies use the same canonical widths; existing geometry derives the
lower row, so no duplicate row widths are introduced.

No production callers were switched. Existing helpers in `create-window.ts` and
`create-balcony.ts` and the current screens intentionally retain their historical
fractional-width and independent-edit behavior. Changing those would alter the
existing UX and migration behavior. The Feature 9 integer API is explicitly for
the next editor work and does not tighten persisted measurement validation.
There is no contract blocker requiring a schema change.
