# Feature 10A — production glazing editors v2

`WindowScreen` and `BalconyScreen` use the shared mobile `GlazingEditor`. The
editable value is the canonical vNext Window/Balcony measurement, including the
existing Window `balconyBlock` branch. There is no alternate saved editor model.
Only numeric text buffers, the selected balcony plane, and temporary rectangular/
block drafts and the hidden second block opening are view state.

## Application boundary

`application/estimate/glazing-editor-v2.ts` handles incomplete canonical values,
profile/hardware/color selection and construction changes. Missing dimensions use
NaN in memory and never pass validation or persistence. `readyMeasurement` checks
integer mm entry, supplies `Без помещения` / the product name for optional labels,
and delegates to canonical domain validation. Actual sizes and the lower tier
height never receive invented defaults. A new block requires explicit door position.

Feature 9's exported `distributeSectionWidths` and `updateSectionWidth` are the
only width algorithms used. They are called through the application layer, with
the existing domain `sectionWidthsTotal`, `getSectionCount` and `balconyPositions`.
The full-measurement Feature 9 wrappers require all fields to be valid, so these
primitive exports support dimension entry before height/profile/openings are
complete without changing Feature 9 or weakening saved validation.

Total width/count changes distribute integer mm. Editing any section except the
last compensates only its next-right neighbour. The final section is read-only.
Rejected edits restore the previous geometry and show inline feedback. Balcony
operations touch one plane; block window widths never include the door.

Opening choices are filtered using the existing domain PVC/aluminium validators.
Aluminium modes belong to each balcony plane; changing mode resets its openings
to fixed. PVC hardware choices come from that profile's `hardwareActivity` links.
Profile changes preserve configured hardware or select the first active compatible
entry; absence stays invalid. Existing selected hidden catalog entries remain
available for historical editing. Colors use the profile's snapshotted color rules.
No activity percentages or tariffs are editable here.

## Snapshot, preview and persistence

The unchanged App supplies the existing measurement configuration snapshot when
editing, and `measurementSnapshot(current, kind)` when adding. The editor copies
this snapshot on mount; it never loads Settings. Configuration defaults are not
part of `GlazingConfiguration`; new editors select the first active PVC profile
and its configured unlaminated color, not mutable Settings defaults.

`estimateDraft` runs the Feature 3/5 canonical pipeline. The UI only formats the
returned product, installation, additional-works and measurement-total minor-unit
amounts. SVG receives ready geometry through the existing `WindowPreview`.
Pending numeric text hides price/preview and disables Save. Blur/keyboard Next or
Enter commits the complete numeric edit atomically. Invalid canonical values have
no price and cannot save.

Save calls the existing App `saveEditor` → `saveMeasurement` → active repository
path. Existing IDs, snapshots, works and unrelated fields survive editing; nested
input is copied. Cancel discards the local value and does not write. The existing
Additional Works component is reused inside a collapsible group.

## Mobile and scope

Layout is one column at 375 px, with 48 px controls, numeric keyboards, plane
buttons instead of desktop tables, inline section cards and a direct link to the
collapsible scheme. Two-level balconies require an explicit height from the bottom;
upper openings and lower glass/sandwich retain the canonical semantics.

FinishScreen, Main Calculation/Summary, pricing, Settings, transition/migration and
documents/PDF are unchanged. The old WindowScreen had no Add Finish bridge; no new
bridge or Finish v2 UI is introduced. That remains Feature 10B.

## Verification

- `tests/glazing-editors-v2.test.tsx`: canonical creation/edit/save, Feature 9 widths,
  rejected edits, PVC relations/options, aluminium compatibility, independent planes
  and door, explicit lower tiers, snapshot/pricing integration and rendered controls.
- `tests/browser/glazing-editors-v2.*`: production App with isolated in-memory ports;
  Settings deliberately differ from the Calculation snapshot. The runner exercises
  creation, save, edit, cancel, works, dimensions and modes at 375 × 812.
- Run `pnpm dev --host 127.0.0.1`, then
  `node tests/browser/glazing-editors-v2.cjs` with Playwright installed or its absolute
  module path in `PLAYWRIGHT_MODULE`. Uses installed headless Edge. Optional
  `GLAZING_SCREENSHOT_DIR` saves a full-page aluminium screenshot.
