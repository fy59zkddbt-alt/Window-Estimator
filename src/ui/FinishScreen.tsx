import { useState } from 'react';
import { finishFromDraft, finishToDraft } from '../application/estimate/calculator-drafts';
import { estimateDraft } from '../application/estimate/active-calculation';
import type { WindowFinishMeasurement } from '../domain/measurements/vnext';
import type { CommercialRoundingStepRub, FinishConfiguration } from '../domain/configuration/vnext/types';
import type { AdditionalWork } from '../domain/works/vnext';
import type { FinishType } from '../domain/configuration/finish-types';
import { type WindowFinishInput } from '../application/estimate/estimate-finish';

import { FinishNumber } from './FinishMaterialEditor';
import { ActiveAdditionalWorksEditor as AdditionalWorksEditor } from './ActiveAdditionalWorksEditor';


const labels = { slope: 'Откосы', sill: 'Подоконник' };
const parts = { top: 'Верх', left: 'Левая сторона', right: 'Правая сторона', sill: 'Подоконник', drip: 'Отлив' };
const amount = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
const length = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 6 });

export function FinishScreen({ id, initial, configuration: currentConfiguration, step, onSave, onCancel }: { id: string; step: CommercialRoundingStepRub; initial?: WindowFinishMeasurement; configuration: FinishConfiguration; onSave: (result: WindowFinishMeasurement) => Promise<void>; onCancel: () => void }) {
  const [configuration] = useState(currentConfiguration);
  const slopeId = configuration.materials.find((item) => item.element === 'slope' && item.side === 'interior')?.id ?? '';
  const sillId = configuration.materials.find((item) => item.element === 'sill' && item.side === 'interior')?.id ?? '';
  const [input, setInput] = useState<WindowFinishInput>((initial ? finishToDraft(initial) : undefined) ?? { id, room: 'Кухня', name: 'Отделка окна 1', widthMm: 1400, heightMm: 1500, depthMm: 250,
    selections: [{ finishType: 'slope', materialId: slopeId }, { finishType: 'sill', materialId: sillId }] });
  const [chosenIds, setChosenIds] = useState({ slope: (initial ? finishToDraft(initial).selections.find((s) => s.finishType === 'slope')?.materialId : undefined) ?? slopeId, sill: (initial ? finishToDraft(initial).selections.find((s) => s.finishType === 'sill')?.materialId : undefined) ?? sillId });
  const [works, setWorks] = useState<readonly AdditionalWork[]>(initial?.additionalWorks ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  let result: Extract<ReturnType<typeof estimateDraft>, { kind: 'WindowFinish' }> | undefined;
  let measurement: WindowFinishMeasurement | undefined;
  let error = '';
  try {
    measurement = finishFromDraft(input, works, initial);
    const next = estimateDraft(measurement, { kind: 'WindowFinish', configuration }, step);
    if (next.kind === 'WindowFinish') result = next;
  }
  catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте параметры отделки.'; }
  function edit(patch: Partial<WindowFinishInput>) { setInput({ ...input, ...patch }); setMessage(''); }
  function toggle(finishType: FinishType, enabled: boolean) {
    edit({ selections: enabled ? [...input.selections, { finishType, materialId: chosenIds[finishType] }] : input.selections.filter((selection) => selection.finishType !== finishType) });
  }
  async function save() {
    if (!result) return;
    setBusy(true);
    try { await onSave(measurement!); }
    catch { setMessage('Не удалось сохранить отделку. Проверьте доступность IndexedDB.'); }
    finally { setBusy(false); }
  }
  return <main>
    <header><p className="eyebrow">ОТДЕЛКА ОКНА</p><h1>Откосы и подоконник</h1><p>Самостоятельный замер отделки</p></header>
    <p className="notice">Материалы и тарифы из снимка настроек замера. Припуски и резерв 20% влияют на материал. Итог отделки включает оплату монтажника и наценку.</p>
    <div className="layout"><form onSubmit={(event) => event.preventDefault()}>
      <fieldset disabled={busy}><legend>Помещение и размеры</legend><div className="fields">
        <label>Помещение<input required value={input.room} onChange={(event) => edit({ room: event.target.value })} /></label>
        <label>Название<input required value={input.name} onChange={(event) => edit({ name: event.target.value })} /></label>
        <FinishNumber label="Ширина отделки, мм" value={input.widthMm} onChange={(widthMm) => edit({ widthMm })} />
        <FinishNumber label="Высота отделки, мм" value={input.heightMm} onChange={(heightMm) => edit({ heightMm })} />
        <FinishNumber label="Глубина отделки, мм" value={input.depthMm} onChange={(depthMm) => edit({ depthMm })} />
      </div></fieldset>
      <fieldset disabled={busy}><legend>Что требуется</legend><div className="fields">{(['slope', 'sill'] as const).map((type) => <label className="checkbox" key={type}><input type="checkbox" checked={input.selections.some((selection) => selection.finishType === type)} onChange={(event) => toggle(type, event.target.checked)} />{labels[type]}</label>)}</div></fieldset>
      {input.selections.map((selection) => {
        return <fieldset disabled={busy} key={selection.finishType}><legend>{labels[selection.finishType]}: материал и работа</legend>
          <label>Материал — {labels[selection.finishType]}<select aria-label={`Материал — ${labels[selection.finishType]}`} value={selection.materialId} onChange={(event) => {
            const materialId = event.target.value;
            setChosenIds({ ...chosenIds, [selection.finishType]: materialId });
            edit({ selections: input.selections.map((item) => item.finishType === selection.finishType ? { ...item, materialId } : item) });
          }}>{configuration.materials.filter((item) => item.side === 'interior' && item.element === selection.finishType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </fieldset>;
      })}
      <AdditionalWorksEditor works={works} onChange={setWorks} disabled={busy} />
    </form><aside><h2>Расчёт отделки</h2>{result ? <>
      <p className="total">{result.measurementTotalMinor === null ? 'Цена требует уточнения' : amount(result.measurementTotalMinor / 100)}</p>
      <p>Отделка: {result.basePriceMinor === null ? '—' : amount(result.basePriceMinor / 100)}; дополнительные работы: {amount(result.additionalWorksTotalMinor / 100)}.</p>
      {'costBasis' in result.result.price && <dl>{[
        ['Материал', amount(result.result.price.materialCost)], ['Материал с резервом 20%', amount(result.result.price.materialsWithReserve)],
        ['Оплата монтажника', amount(result.result.price.installerSalary)], ['Себестоимость', amount(result.result.price.costBasis)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      {result.result.price.clientFinishPriceMinor === null && <p role="alert">{'reason' in result.result.price.priceState ? result.result.price.priceState.reason : 'Ручная цена требует подтверждения.'}</p>}
      {result.result.geometry.elements.map((quantity) => <details key={quantity.materialId} open className="finish-quantities"><summary>{quantity.element === 'slope' ? 'Откосы' : 'Подоконник'}: размеры</summary>
        <ul>{quantity.pieces.map((piece) => <li key={piece.part}>{parts[piece.part]}: {length(piece.requiredLengthMm)} × {length(quantity.requiredDepthMm)} мм с припусками</li>)}</ul>
        <p>Расчётная длина материала: {length(quantity.calculatedMaterialQuantityM)} м; установленная длина для работы: {length(quantity.installedLengthM)} м.</p>
      </details>)}
    </> : <p className="validation" role="alert">{error}</p>}
      <button disabled={busy || !result} onClick={() => void save()}>Сохранить замер</button>
      <button className="secondary" disabled={busy} onClick={onCancel}>Отмена</button>

      <p role="status" aria-live="polite">{message}</p>
    </aside></div>
  </main>;
}
