# Feature 3 — Glazing Pricing v2

Implements sections 8 and 15 of `ux-pricing-spec-v1.2.md` for the existing vNext
Window/Balcony contracts. No production v3 flow, persistence, UI, finishing,
order totals or proposal generation is switched.

## Entry points and snapshots

`estimateGlazingVNext(measurement, glazingConfiguration, stepRub)` validates the
measurement, reuses the existing window/balcony geometry algorithms, and returns
independent measurement/configuration snapshots, geometry and a price breakdown.
`estimateCalculationGlazingVNext(calculation, measurementId)` obtains those inputs
from Calculation v4, including its own commercial rounding step. It estimates
only the selected glazing measurement, without applying order discounts or
summing additional works.

The existing shape validators are shared between current and vNext measurements.
Material-specific opening validation remains separate: PVC uses fixed/turn/tilt_turn
with hardware on active sections; aluminium uses fixed/sliding or fixed/turn
according to each plane's mode, without PVC hardware. A block door follows its
plane's mode. Hidden snapshot catalog entries remain valid for saved measurements.

## Pricing

`priceInstalledGlazingVNext` receives total area and active area contributions,
never dimensions. PVC contributions retain each section's hardware identity.
Aluminium contributions retain each plane's sliding/swing mode. Application
selects active lower window sections (excluding the fixed transom), active upper
balcony sections and block windows/door from domain geometry. Block contribution
order follows model identity order, independent of door position.

- Base: total area × profile rate.
- Activity: sum of active area × profile rate × applicable activity percentage.
  PVC resolves each profile/hardware mapping; aluminium resolves the plane mode.
- Color, enabled extensions and enabled connectors: independent percentages of base.
- Product subtotal: base plus all four independent components.
- Product: subtotal plus its product markup, applied once.
- Installation: total area × the snapshot's material installation rate.

Missing profile/color/hardware mappings, incompatible openings, invalid numbers
and unsafe monetary results throw errors; no arbitrary percentages are substituted.

## Money boundaries

Feature 2 integer helpers round fractional kopecks immediately. For product
components, that would lose fractions before the product is complete. The shared
`money.ts` now also supports transient exact decimal money expressions using the
same decimal interpretation, BigInt arithmetic and half-up rounding machinery.
Expressions are immutable; BigInts stay private to that module and are never
returned in estimate DTOs. Informational RUB breakdowns are numeric approximations
and are never reused for monetary arithmetic.

Complete product and installation each convert once to safe integer kopecks
(half-up). Each then crosses its own client boundary through Feature 2's
`commercialRoundMinor`, using the supplied 10/50/100 RUB step. Their client prices
are added with `sumMinor`. The item total is not commercially rounded again.
Internal components receive neither kopeck rounding nor commercial rounding.

Both raw informational RUB lines and pre-commercial integer kopeck lines are
available alongside the two rounded client lines and their total. No new fields
were needed in the measurement/configuration contracts: `extensions`, `connectors`,
`colorId`, hardware assignments and aluminium plane modes already exist.
