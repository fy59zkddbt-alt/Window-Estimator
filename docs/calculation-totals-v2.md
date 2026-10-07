# Calculation Totals v2 — Feature 5

`estimateCalculationVNext(Calculation)` in `application/estimate/estimate-calculation-vnext.ts`
is the aggregation entry point for the existing Calculation v4 contract. It reads
only measurement/configuration snapshots and the Calculation rounding step. It has
no settings lookup, I/O, UI, repository migration or production caller switch.
The canonical rules are in `ux-pricing-spec-v1.2.md`, sections 14–16.

## Results and pricing boundaries

- Window (including balconyBlock) and Balcony delegate to Feature 3's
  `estimateCalculationGlazingVNext`. The product and installation lines retain
  their finalized client prices; the item price comes directly from that result.
- WindowFinish delegates to Feature 4's `estimateCalculationFinishVNext`.
  Automatic and confirmed manual prices are used unchanged. Its full result,
  including the finish price state, remains available to application consumers.
- Measurement and order Additional Works retain independent snapshots and an
  explicit location. Each uses `multiplyMinorByQuantity`, then
  `commercialRoundMinor`. Units are descriptive, and catalogId is provenance.
- `sumMinor` combines finalized client lines. Neither measurement totals nor
  subtotal receive commercial rounding. All IDs and measurement order survive.

The DTO is an application result, not a client-safe ProposalDocument: nested
engine results include internal costs/configuration. Future proposal preparation
must select appropriate client fields rather than export this entire result.

## Discount and finalization

Existing discount validation and fixed-price confirmation semantics are reused.
Percentage discounts use the shared exact-decimal percentage helper through
`estimateDiscount`: round the discount to kopecks half-up, subtract it from the
subtotal, then commercially round the resulting final price. The result exposes
`discountAmountMinor`, `rawDiscountedTotalMinor` and the signed
`commercialRoundingAdjustmentMinor` separately:

```text
finalTotalMinor = subtotalMinor - discountAmountMinor + commercialRoundingAdjustmentMinor
```

Mode `none` leaves the subtotal unchanged. Mode `percent`, including 0%, applies
the required final rounding. A confirmed fixed final price is exact, without
commercial rounding. A stale or pending fixed price retains its entered amount,
but has null discount/final amounts and `isFinalized=false`. The normalized
discount is returned; estimating never mutates or persists the input.

## Unavailable and invalid prices

`pricingStatus` is `priced` or `unresolved`. Missing depth variants and pending
manual finish confirmation identify each affected measurement in
`unresolvedMeasurements`, with a reason and code. Known measurement/work lines
remain inspectable. Measurement totals for affected items, the overall
measurement subtotal, Calculation subtotal, discount amount and final total are
null. A fixed price cannot authorize finalization without a trustworthy subtotal.

`pricingStatus=priced` describes line prices; consumers must also check
`isFinalized` because a fixed final price can still require confirmation.
Unsupported kinds, malformed inputs/snapshots, invalid work quantities, invalid
discounts and unsafe monetary arithmetic throw rather than produce zero prices.
A valid empty Calculation is a priced zero.

## Verification and transition

`tests/calculation-totals-vnext.test.ts` covers aggregation, all rounding steps,
both work locations, decimal boundaries, discounts, unresolved prices, snapshot
ownership and numeric failures. A rounding-call assertion supplements numeric
tests because re-rounding a step multiple is numerically idempotent.

No Feature 2/3/4 source or existing production caller changes are required.
Storage and the v3 UI pipeline remain unchanged until their planned transition.
No material fixed-price contract conflict was found; confirmation safeguards
are compatible with preserving the explicit fixed price exactly.
