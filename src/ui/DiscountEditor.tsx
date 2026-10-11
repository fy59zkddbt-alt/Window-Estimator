import { useState } from 'react';
import type { Discount, DiscountInput } from '../domain/discount';
import { estimateDiscount, setDiscount } from '../application/estimate/discount';
import { rubInputToMinor } from '../application/settings/settings-v2';
import { calculationMoney as money, calculationMoneyInput } from './CalculationSummary';

export function DiscountEditor({ discount, subtotalMinor, busy, onApply, onConfirm, onReset, previewDiscount, currentTotals }: {
  discount: Discount; subtotalMinor: number; busy: boolean;
  onApply: (input: DiscountInput) => Promise<void>; onConfirm: () => Promise<void>; onReset: () => Promise<void>;
  previewDiscount?: (input: DiscountInput) => ReturnType<typeof estimateDiscount>;
  currentTotals?: ReturnType<typeof estimateDiscount>;
}) {
  const [mode, setMode] = useState<DiscountInput['mode']>(discount.mode);
  const [percent, setPercent] = useState(discount.mode === 'percent' ? String(discount.discountPercent) : '');
  const [price, setPrice] = useState(discount.mode === 'fixedFinalPrice' ? calculationMoneyInput(discount.fixedFinalPriceMinor) : '');
  const current = currentTotals ?? estimateDiscount(discount, subtotalMinor);
  let input: DiscountInput | undefined;
  let preview: ReturnType<typeof estimateDiscount> | undefined;
  let error = '';
  try {
    input = mode === 'none' ? { mode } : mode === 'percent' ? { mode, discountPercent: percent.trim() ? Number(percent) : NaN }
      : { mode, fixedFinalPriceMinor: rubInputToMinor(price) };
    preview = previewDiscount ? previewDiscount(input) : estimateDiscount(setDiscount(input, subtotalMinor), subtotalMinor);
  } catch (reason) { error = reason instanceof Error ? reason.message.replaceAll('subtotal', 'сумму до скидки') : 'Проверьте скидку.'; }
  return <section><h3>Скидка / Итоговая цена</h3>
    {current.fixedFinalPriceConfirmation === 'needsConfirmation' && <div role="alert" className="notice">
      <p>Состав заказа изменён. Прежняя итоговая цена: {money(current.fixedFinalPriceMinor!)}. Сумма до скидки: {money(subtotalMinor)}. Подтвердите итоговую цену.</p>
      {!current.canConfirmFixedPrice && <p>Прежняя цена выше суммы заказа. Сбросьте её или задайте меньшую цену.</p>}
      <button disabled={busy || !current.canConfirmFixedPrice} onClick={() => void onConfirm()}>Оставить итоговую цену</button>{' '}
      <button disabled={busy} onClick={() => void onReset()}>Сбросить</button>
    </div>}
    <form onSubmit={(e) => { e.preventDefault(); if (input && preview) void onApply(input); }}>
      <fieldset disabled={busy}><label>Режим скидки<select aria-label="Режим скидки" value={mode} onChange={(e) => setMode(e.target.value as DiscountInput['mode'])}>
        <option value="none">Без скидки</option><option value="percent">Скидка %</option><option value="fixedFinalPrice">Итоговая цена вручную</option>
      </select></label>
      {mode === 'percent' && <label>Скидка, %<input type="number" min="0" max="100" step="any" value={percent} onChange={(e) => setPercent(e.target.value)} /></label>}
      {mode === 'fixedFinalPrice' && <label>Итоговая цена, ₽<input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>}
      </fieldset>
      {error && <p role="alert" className="validation">{error}</p>}
      {preview && <p>После применения: скидка {money(preview.discountAmountMinor!)}; итог {money(preview.finalTotalMinor!)}.</p>}
      <button disabled={busy || !preview}>Применить и сохранить</button>
      <p className="muted">Изменения применяются после сохранения. Фиксированная цена потребует подтверждения после изменения замеров или работ.</p>
    </form>
  </section>;
}
