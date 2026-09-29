/** Order-level state only; individual pricing engines never consume this model. */
export type Discount =
  | { mode: 'none' }
  | { mode: 'percent'; discountPercent: number }
  | { mode: 'fixedFinalPrice'; fixedFinalPriceMinor: number; confirmation: 'confirmed' | 'needsConfirmation'; confirmedSubtotalMinor: number };
export type DiscountInput = { mode: 'none' } | { mode: 'percent'; discountPercent: number }
  | { mode: 'fixedFinalPrice'; fixedFinalPriceMinor: number };
