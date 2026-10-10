# Feature 8 — controlled vNext transition

The production calculator uses CalculatorSettings v2 and Calculation v4.
`main.tsx` retains the existing owner/revision-aware CloudSettingsSync and cloud
table/payload envelope. ActiveCalculatorSettingsRepository exposes only the v2
catalog to App. Valid configured v2 catalogs and price confirmation are copied,
never replaced with starter values. An absent v2 catalog initializes the starter
with `pricesConfirmed=false`; no v1 prices are imported. Corrupt explicit v2 data
fails without overwriting the original or falling back to v1. Invalid retired v1
fields cannot prevent a valid v2 catalog from loading. The compatibility envelope
may retain v1 fields, but calculator pricing never reads them.

Cloud acceptance caches the initialized v2 envelope through the existing protected
path. Offline startup can use the local v2 cache (or an unconfirmed in-memory
starter when no v2 was stored); it does not write around revision protection.
Saving and explicit confirmation still require the existing protected save path.

New calculations snapshot the whole creation-time v2 catalog/defaults in
`settingsSnapshot`, and independently snapshot `commercialRoundingStepRub`.
Each saved measurement has its own configuration snapshot. Existing calculations,
including measurements subsequently added to them, use their creation-time
settings, never mutable global settings. Later new calculations use the latest
loaded settings. Metadata, order works and discounts retain their v4 contracts.

App and existing editor previews delegate to `estimateCalculationVNext` (Feature
5), which delegates glazing and finishing to Features 3 and 4. No pricing formulas
are added to React, storage or the draft adapter. Existing geometry draft controls
are retained with only contract bindings: lamination resolves to a configured
color, existing windows use aluminium swing and balconies aluminium sliding,
and existing interior slope/sill selections resolve to the corresponding finish
work type. Extensions/connectors, quantity/unit/catalog provenance and manual
finish overrides already present in v4 measurements are preserved on edit.
Broader editor choices and layout remain outside Feature 8.

## Calculator-only cleanup

The prelaunch v1–v3 calculator pricing snapshots cannot supply the new Profile ×
Hardware activity tables, installation split, finishing width variants, installer
cost basis and commercial rounding without invented values. Existing migration
helpers only implement the historical v1 → v2 → v3 chain; they do not provide a
semantically valid v3 → v4 conversion. That historical chain remains unchanged.

`transitionCalculatorData` uses one Dexie transaction over ownedCalculations and
ownedSettings, scoped to the current owner. It deletes only that owner's records
with calculator schemaVersion 1/2/3 and deletes their activeCalculationId pointer
only if it points to a removed record. Valid existing v4 records are retained.
Unknown versions, malformed v4 records or mismatched ownership envelopes abort
the transaction, including deletion and marker writes.

The existing Dexie schema/indexes remain at version 4. The one-way data migration
marker is ownedSettings[ownedKey(userId, 'calculatorFoundation:v4')] with value
`1`. Its presence prevents reprocessing on later startup or repository calls.
Incompatible records written after this marker cause deterministic load failure,
never repeated cleanup or a legacy pricing fallback.

Anonymous originals and legacyCalculations backups remain untouched. Ownership
claim semantics are unchanged. calculatorSettings, documentSettings, all other
settings/account/cloud metadata, other owners and browser localStorage are not
cleared. There is no database deletion or global storage reset. Settings are loaded
before cleanup, so a failed settings load does not trigger calculator cleanup.

The production repository accepts only v4 and atomically saves the calculation
and active selection. Legacy services remain for historical storage migrations
and regression tests, outside the active production calculator path. Auth,
sessions, subscriptions, entitlement, trusted devices, billing/payments, cloud
ownership and revision/conflict logic are unchanged.

No Summary, Proposal/View DTO, client view, PDF adaptation or rendering service is
introduced. The existing Proposal/PDF contract accepts v3; its compatibility with
v4 is a separate contract boundary, not a reason to restore legacy calculator
pricing. The App's КП action is temporarily disabled for v4 with an explanation;
the existing document preparation and PDF renderer remain unchanged.

This is an intentional Feature 8 limitation. Calculation v4 is never converted
back to v3, and no adapter reconstructs legacy calculations or pricing. The later
ProposalDocument v2 / Client View / PDF features will consume canonical vNext
results directly. Until then the legacy v3 generator has no active production
caller; it is retained unchanged with its existing regression tests.
