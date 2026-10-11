import type { CalculationTotalsVNext, MeasurementTotalsVNext, AdditionalWorkLineVNext } from '../application/estimate/estimate-calculation-vnext';

// Display only. All amounts and availability come from Feature 5.
export const calculationMoneyInput = (minor: number) => `${BigInt(minor) / 100n}.${String(BigInt(minor) % 100n).padStart(2, '0')}`;
export const calculationMoney = (minor: number) => {
  const absolute = BigInt(minor < 0 ? -minor : minor);
  return (minor < 0 ? '−' : '') + new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })
    .formatToParts(absolute / 100n).map((part) => part.type === 'fraction' ? String(absolute % 100n).padStart(2, '0') : part.value).join('');
};
const shapes = { straight: 'Прямой', L: 'Г-образный', U: 'П-образный' };
const elements = { slope: 'Откосы', sill: 'Подоконник', drip: 'Отлив' };
const windowTypes = { single: 'Одностворчатое окно', double: 'Двустворчатое окно', triple: 'Трёхстворчатое окно', balconyBlock: 'Балконный блок' };
const lineLabels = { glazingProduct: 'Изделие', glazingInstallation: 'Монтаж', finish: 'Отделка под ключ' };
export const workUnits = { piece: 'шт.', runningMeter: 'пог. м', squareMeter: 'м²', unit: 'ед.' };

export function WorkLines({ lines }: { lines: readonly AdditionalWorkLineVNext[] }) {
  return <dl className="client-lines">{lines.map((line) => <div key={line.work.id}>
    <dt>{line.work.name}<small>{line.work.quantity} {workUnits[line.work.unit ?? 'unit']}</small></dt>
    <dd>{calculationMoney(line.clientPriceMinor)}</dd>
  </div>)}</dl>;
}

export function MeasurementCard({ line, children }: { line: MeasurementTotalsVNext; children?: React.ReactNode }) {
  const measurement = line.result.measurement;
  const glazing = measurement.kind !== 'WindowFinish';
  return <article className="measurement-card" aria-label={`${measurement.name} · ${measurement.room}`}>
    <h3>{measurement.name}</h3><p className="muted">{measurement.room}</p>
    <p>{measurement.kind === 'WindowFinish' ? measurement.selections.map((selection) => elements[selection.element]).join(' + ')
      : measurement.kind === 'Balcony' ? `Балкон · ${shapes[measurement.balconyType]} · ${measurement.material === 'pvc' ? 'ПВХ' : 'Алюминий'}`
        : `${windowTypes[measurement.windowType]} · ${measurement.material === 'pvc' ? 'ПВХ' : 'Алюминий'}`}</p>
    {glazing && line.kind !== 'WindowFinish' && <p className="muted">{line.result.configuration.profiles.find((profile) => profile.id === measurement.profileId)?.name}</p>}
    <p className="measurement-dimensions">{measurement.kind === 'Balcony' ? measurement.planes.map((plane) => `${plane.name}: ${plane.widthMm} × ${plane.heightMm} мм`).join('; ')
      : measurement.kind === 'WindowFinish' ? `${measurement.widthMm} × ${measurement.heightMm} мм · глубина ${measurement.depthMm} мм`
        : measurement.windowType === 'balconyBlock' ? `Дверь ${measurement.doorWidthMm} × ${measurement.doorHeightMm} мм; окна ${measurement.plane.sections.map((section) => `${section.widthMm} × ${measurement.windowHeightMm}`).join(', ')} мм`
          : `${measurement.widthMm} × ${measurement.heightMm} мм`}</p>
    {line.kind === 'WindowFinish' && <p className="muted">{line.pricingStatus === 'unresolved' ? 'Нужно уточнить цену отделки'
      : line.result.price.priceState.mode === 'manual' ? 'Цена задана вручную' : 'Цена рассчитана автоматически'}</p>}
    {line.measurementTotalMinor !== null && <strong className="card-price">{calculationMoney(line.measurementTotalMinor)}</strong>}
    {children}
  </article>;
}

export function CalculationTotal({ totals }: { totals: CalculationTotalsVNext }) {
  if (!totals.measurements.length) return <p>В расчёте пока нет замеров.</p>;
  if (totals.pricingStatus === 'unresolved') return <p role="status" className="validation">Нужно уточнить цену отделки. Итог расчёта пока недоступен.</p>;
  if (totals.finalTotalMinor === null) return <p role="status" className="validation">Подтвердите или измените итоговую цену вручную в смете: состав заказа изменён.</p>;
  return <p className="total" data-testid="calculation-final">Итого: {calculationMoney(totals.finalTotalMinor)}</p>;
}

export function CalculationSummary({ totals }: { totals: CalculationTotalsVNext }) {
  return <section aria-label="Итоги расчёта">
    <CalculationTotal totals={totals} />
    {totals.measurements.map((line) => <MeasurementCard key={line.measurementId} line={line}>
      {line.pricingStatus === 'unresolved' && <p className="validation">{totals.unresolvedMeasurements.find((item) => item.measurementId === line.measurementId)?.code === 'manualPriceNeedsConfirmation'
        ? 'Подтвердите ручную цену в редакторе отделки.' : 'Откройте отделку и уточните цену.'}</p>}
      <dl className="client-lines">{line.clientLines.map((item) => <div key={item.kind}><dt>{lineLabels[item.kind]}</dt><dd>{calculationMoney(item.clientPriceMinor)}</dd></div>)}</dl>
      {!!line.additionalWorkLines.length && <><h4>Работы этого замера</h4><WorkLines lines={line.additionalWorkLines} /></>}
    </MeasurementCard>)}
    {!!totals.orderAdditionalWorkLines.length && <section className="measurement-card"><h3>Дополнительные работы по заказу</h3><WorkLines lines={totals.orderAdditionalWorkLines} /></section>}
    {!!totals.measurements.length && totals.subtotalMinor !== null && <dl className="client-lines summary-totals">
      <div><dt>До скидки</dt><dd>{calculationMoney(totals.subtotalMinor)}</dd></div>
      {totals.discountMode !== 'none' && totals.discountAmountMinor !== null && <div><dt>Скидка{totals.discount.mode === 'percent' ? ` ${totals.discount.discountPercent}%` : ''}</dt><dd>{calculationMoney(totals.discountAmountMinor)}</dd></div>}
      {totals.discountMode === 'fixedFinalPrice' && totals.fixedFinalPriceMinor !== null && <div><dt>Итоговая цена вручную{totals.fixedFinalPriceConfirmation === 'needsConfirmation' ? ' · требует подтверждения' : ''}</dt><dd>{calculationMoney(totals.fixedFinalPriceMinor)}</dd></div>}
      {totals.commercialRoundingAdjustmentMinor !== null && totals.commercialRoundingAdjustmentMinor !== 0 && <div><dt>Коммерческое округление</dt><dd>{calculationMoney(totals.commercialRoundingAdjustmentMinor)}</dd></div>}
    </dl>}
  </section>;
}
