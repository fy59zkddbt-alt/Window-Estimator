import type { Discount, DiscountInput } from '../../domain/discount';
import { percentageMinor } from '../../domain/money';

function minor(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Цена должна быть неотрицательной суммой в целых копейках.');
}
export function normalizeDiscount(value: Discount | undefined, subtotalMinor: number): Discount {
  minor(subtotalMinor);
  if (value === undefined) return { mode: 'none' };
  if (!value || typeof value !== 'object') throw new Error('Некорректная скидка.');
  if (value.mode === 'none') return { mode: 'none' };
  if (value.mode === 'percent') {
    if (!Number.isFinite(value.discountPercent) || value.discountPercent < 0 || value.discountPercent > 100) throw new Error('Скидка должна быть от 0 до 100%.');
    return { mode: 'percent', discountPercent: value.discountPercent };
  }
  if (value.mode !== 'fixedFinalPrice') throw new Error('Неизвестный режим скидки.');
  minor(value.fixedFinalPriceMinor); minor(value.confirmedSubtotalMinor);
  if (!['confirmed', 'needsConfirmation'].includes(value.confirmation)) throw new Error('Некорректное состояние подтверждения.');
  const confirmation = value.confirmedSubtotalMinor !== subtotalMinor ? 'needsConfirmation' : value.confirmation;
  // A pending price can exceed a newly reduced subtotal. Keep it visible, never finalize it.
  if (confirmation === 'confirmed' && value.fixedFinalPriceMinor > subtotalMinor) throw new Error('Итоговая цена не может превышать subtotal.');
  return { mode: 'fixedFinalPrice', fixedFinalPriceMinor: value.fixedFinalPriceMinor, confirmedSubtotalMinor: value.confirmedSubtotalMinor, confirmation };
}
export function setDiscount(input: DiscountInput, subtotalMinor: number): Discount {
  if (input.mode === 'fixedFinalPrice') {
    minor(input.fixedFinalPriceMinor);
    if (input.fixedFinalPriceMinor > subtotalMinor) throw new Error('Итоговая цена не может превышать subtotal.');
    return normalizeDiscount({ ...input, confirmation: 'confirmed', confirmedSubtotalMinor: subtotalMinor }, subtotalMinor);
  }
  return normalizeDiscount(input, subtotalMinor);
}
export function invalidateDiscount(value: Discount | undefined): Discount {
  if (value?.mode === 'fixedFinalPrice') return { ...value, confirmation: 'needsConfirmation' };
  return value ?? { mode: 'none' };
}
export function estimateDiscount(value: Discount | undefined, subtotalMinor: number) {
  const discount = normalizeDiscount(value, subtotalMinor);
  const pending = discount.mode === 'fixedFinalPrice' && discount.confirmation === 'needsConfirmation';
  // Round the discount once to Minor, then subtract integers so the displayed amounts reconcile.
  const discountAmountMinor = pending ? null : discount.mode === 'percent'
    ? percentageMinor(subtotalMinor, discount.discountPercent)
    : discount.mode === 'fixedFinalPrice' ? subtotalMinor - discount.fixedFinalPriceMinor : 0;
  return { discount, discountMode: discount.mode, discountAmountMinor,
    finalTotalMinor: discountAmountMinor === null ? null : subtotalMinor - discountAmountMinor,
    fixedFinalPriceConfirmation: discount.mode === 'fixedFinalPrice' ? discount.confirmation : null,
    fixedFinalPriceMinor: discount.mode === 'fixedFinalPrice' ? discount.fixedFinalPriceMinor : null,
    canConfirmFixedPrice: discount.mode === 'fixedFinalPrice' && discount.fixedFinalPriceMinor <= subtotalMinor,
    isFinalized: !pending };
}
