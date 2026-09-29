import { useState } from 'react';
import type { Discount, DiscountInput } from '../domain/discount';
import { estimateDiscount, setDiscount } from '../application/estimate/discount';

const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);
export function DiscountEditor({ discount, subtotalMinor, busy, onApply, onConfirm, onReset }: {
  discount: Discount; subtotalMinor: number; busy: boolean;
  onApply: (input: DiscountInput) => Promise<void>; onConfirm: () => Promise<void>; onReset: () => Promise<void>;
}) {
  const [mode, setMode] = useState<DiscountInput['mode']>(discount.mode);
  const [percent, setPercent] = useState(discount.mode === 'percent' ? String(discount.discountPercent) : '');
  const [price, setPrice] = useState(discount.mode === 'fixedFinalPrice' ? String(discount.fixedFinalPriceMinor / 100) : '');
  const current = estimateDiscount(discount, subtotalMinor);
  let input: DiscountInput | undefined;
  let preview: ReturnType<typeof estimateDiscount> | undefined;
  let error = '';
  try {
    input = mode === 'none' ? { mode } : mode === 'percent' ? { mode, discountPercent: percent.trim() ? Number(percent) : NaN }
      : { mode, fixedFinalPriceMinor: /^\d+(\.\d{0,2})?$/.test(price) ? Math.round(Number(price) * 100) : NaN };
    preview = estimateDiscount(setDiscount(input, subtotalMinor), subtotalMinor);
  } catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте скидку.'; }
  return <section><h3>Скидка / Итоговая цена</h3>
    {current.fixedFinalPriceConfirmation === 'needsConfirmation' && <div role="alert" className="notice">
      <p>Состав заказа изменён. Прежняя итоговая цена: {money(current.fixedFinalPriceMinor!)}. Новый subtotal: {money(subtotalMinor)}. Расчёт не финализирован.</p>
      {!current.canConfirmFixedPrice && <p>Прежняя цена выше subtotal. Сбросьте её или задайте новую цену не выше subtotal.</p>}
      <button disabled={busy || !current.canConfirmFixedPrice} onClick={() => void onConfirm()}>Оставить итоговую цену</button>{' '}
      <button disabled={busy} onClick={() => void onReset()}>Сбросить</button>
    </div>}
    <form onSubmit={(e) => { e.preventDefault(); if (input && preview) void onApply(input); }}>
      <fieldset disabled={busy}><label>Режим скидки<select value={mode} onChange={(e) => setMode(e.target.value as DiscountInput['mode'])}>
        <option value="none">Без скидки</option><option value="percent">Скидка %</option><option value="fixedFinalPrice">Установить итоговую цену</option>
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
