import type { FinishMaterialConfiguration, FinishSizing } from '../domain/configuration/finish-types';

export function FinishNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label>{label}<input aria-label={label} type="number" min="0" step="any" required value={Number.isNaN(value) ? '' : value} onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))} /></label>;
}

const sizingLabels: readonly [keyof FinishSizing, string][] = [
  ['lengthAllowancePerPieceMm', 'Припуск на длину каждой детали, мм'],
  ['depthAllowanceMm', 'Припуск на глубину, мм'],
  ['purchaseStepMm', 'Шаг закупки, мм (0 — без округления)'],
];

export function FinishMaterialEditor({ material, onChange }: { material: FinishMaterialConfiguration; onChange: (value: FinishMaterialConfiguration) => void }) {
  const pricing = material.pricing;
  return <details className="finish-settings">
    <summary>Настройки материала · {pricing.mode === 'simple' ? 'Simple' : 'Advanced'}</summary>
    <label>Название материала<input value={material.name} required onChange={(event) => onChange({ ...material, name: event.target.value })} /></label>
    <div className="fields">
      {pricing.mode === 'simple' ? <>
        <FinishNumber label="Продажная цена материала, ₽/п.м." value={pricing.materialSellingPricePerM} onChange={(materialSellingPricePerM) => onChange({ ...material, pricing: { ...pricing, materialSellingPricePerM } })} />
        <FinishNumber label="Коэффициент глубины материала" value={pricing.depthCoefficient ?? 1} onChange={(depthCoefficient) => onChange({ ...material, pricing: { ...pricing, depthCoefficient } })} />
      </> : <>
        {!pricing.depthBands?.length && <FinishNumber label="Закупочная цена материала, ₽/п.м." value={pricing.materialPurchasePricePerM} onChange={(materialPurchasePricePerM) => onChange({ ...material, pricing: { ...pricing, materialPurchasePricePerM } })} />}
        <FinishNumber label="Наценка только на материалы, %" value={pricing.materialMarkupPercent} onChange={(materialMarkupPercent) => onChange({ ...material, pricing: { ...pricing, materialMarkupPercent } })} />
        {pricing.depthBands?.map((band, index) => <div className="finish-band" key={index}>
          <FinishNumber label={`Диапазон ${index + 1}: глубина до, мм (включительно)`} value={band.maxDepthMm} onChange={(maxDepthMm) => onChange({ ...material, pricing: { ...pricing, depthBands: pricing.depthBands!.map((item, i) => i === index ? { ...item, maxDepthMm } : item) } })} />
          <FinishNumber label={`Диапазон ${index + 1}: закупочная цена, ₽/п.м.`} value={band.purchasePricePerM} onChange={(purchasePricePerM) => onChange({ ...material, pricing: { ...pricing, depthBands: pricing.depthBands!.map((item, i) => i === index ? { ...item, purchasePricePerM } : item) } })} />
        </div>)}
      </>}
    </div>
    <p className="muted">В стоимость материала можно включить сопутствующие расходники: профили, пену, герметик, крепёж и другие материалы, используемые при монтаже.</p>
    <FinishNumber label="Полная цена работы, ₽/п.м." value={pricing.workRatePerM} onChange={(workRatePerM) => onChange({ ...material, pricing: { ...pricing, workRatePerM } })} />
    <p className="muted">Укажите полную цену работы для клиента, как если бы материалы уже находились на объекте.</p>
    <div className="fields">{sizingLabels.map(([key, label]) => <FinishNumber key={key} label={label} value={material.sizing[key]} onChange={(value) => onChange({ ...material, sizing: { ...material.sizing, [key]: value } })} />)}</div>
    <p className="muted">Закупочная длина каждой детали с припуском округляется отдельно, затем длины суммируются. Раскрой между деталями не оптимизируется. Работы оплачиваются по установленной длине. Диапазон цены учитывает глубину с припуском.</p>
  </details>;
}
