import { useState } from 'react';
import type { FinishCalculation } from '../domain/calculation';
import type { FinishConfiguration, FinishType } from '../domain/configuration/finish-types';
import { demoFinishConfiguration } from '../domain/configuration/demo-finish-configuration';
import { estimateFinish, type WindowFinishInput } from '../application/estimate/estimate-finish';
import { isFinishCalculation, type CalculationRepository } from '../application/estimate/calculation-repository';
import { FinishMaterialEditor, FinishNumber } from './FinishMaterialEditor';

const finishId = 'window-finish-demo';
const labels = { slope: 'Откосы', sill: 'Подоконник' };
const parts = { top: 'Верх', left: 'Левая сторона', right: 'Правая сторона', sill: 'Подоконник' };
const amount = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
const length = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 6 });

export function FinishScreen({ repository }: { repository: CalculationRepository }) {
  const [input, setInput] = useState<WindowFinishInput>({ id: finishId, room: 'Кухня', name: 'Отделка окна 1', widthMm: 1400, heightMm: 1500, depthMm: 250,
    selections: [{ finishType: 'slope', materialId: 'slope-simple' }, { finishType: 'sill', materialId: 'sill-simple' }] });
  const [chosenIds, setChosenIds] = useState({ slope: 'slope-simple', sill: 'sill-simple' });
  const [configuration, setConfiguration] = useState<FinishConfiguration>(demoFinishConfiguration);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  let result: FinishCalculation | undefined;
  let error = '';
  try { result = estimateFinish(input, configuration); }
  catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте параметры отделки.'; }
  function edit(patch: Partial<WindowFinishInput>) { setInput({ ...input, ...patch }); setMessage(''); }
  function toggle(finishType: FinishType, enabled: boolean) {
    edit({ selections: enabled ? [...input.selections, { finishType, materialId: chosenIds[finishType] }] : input.selections.filter((selection) => selection.finishType !== finishType) });
  }
  async function save() {
    if (!result) return;
    setBusy(true);
    try { await repository.save(result); setMessage('Отделка сохранена в этом браузере.'); }
    catch { setMessage('Не удалось сохранить отделку. Проверьте доступность IndexedDB.'); }
    finally { setBusy(false); }
  }
  async function load() {
    setBusy(true);
    try {
      const saved = await repository.get(finishId);
      if (!saved) { setMessage('Сохранённой отделки пока нет.'); return; }
      if (saved.schemaVersion !== 2 || !isFinishCalculation(saved)) throw new Error('Invalid record');
      const { kind: _kind, ...restored } = saved.measurement;
      const recalculated = estimateFinish(restored, saved.configuration);
      setInput(restored); setConfiguration(recalculated.configuration);
      const ids = { ...chosenIds };
      restored.selections.forEach((selection) => { ids[selection.finishType] = selection.materialId; });
      setChosenIds(ids); setMessage('Отделка загружена с сохранёнными настройками материалов.');
    } catch { setMessage('Не удалось загрузить отделку: хранилище недоступно или запись повреждена.'); }
    finally { setBusy(false); }
  }
  return <main>
    <header><p className="eyebrow">ОТДЕЛКА ОКНА</p><h1>Откосы и подоконник</h1><p>Самостоятельный замер отделки</p></header>
    <p className="notice">Демонстрационные материалы и тарифы. Припуски и закупочное округление влияют только на материал, работа считается по установленной длине.</p>
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
        const material = configuration.materials.find((item) => item.id === selection.materialId);
        return <fieldset disabled={busy} key={selection.finishType}><legend>{labels[selection.finishType]}: материал и работа</legend>
          <label>Материал — {labels[selection.finishType]}<select aria-label={`Материал — ${labels[selection.finishType]}`} value={selection.materialId} onChange={(event) => {
            const materialId = event.target.value;
            setChosenIds({ ...chosenIds, [selection.finishType]: materialId });
            edit({ selections: input.selections.map((item) => item.finishType === selection.finishType ? { ...item, materialId } : item) });
          }}>{configuration.materials.filter((item) => item.finishType === selection.finishType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {material && <FinishMaterialEditor material={material} onChange={(updated) => { setConfiguration({ ...configuration, materials: configuration.materials.map((item) => item.id === updated.id ? updated : item) }); setMessage(''); }} />}
        </fieldset>;
      })}
    </form><aside><h2>Расчёт отделки</h2>{result ? <>
      <p className="total">{amount(result.price.totalMinor / 100)}</p>
      <dl>{[
        ['Длина откосов', `${length(result.geometry.slopeLengthM)} м`], ['Длина подоконника', `${length(result.geometry.sillLengthM)} м`],
        ['База материала¹', amount(result.price.materialPurchaseCost)], ['Наценка на материалы', amount(result.price.materialMarkupAmount)],
        ['Материалы для клиента', amount(result.price.materialSellingPrice)], ['Работа — без наценки', amount(result.price.workPrice)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="muted">¹ В Advanced — закупочная стоимость. В Simple — продажная база материала, отдельная наценка равна нулю.</p>
      {result.geometry.materials.map((quantity) => <details key={quantity.materialId} open className="finish-quantities"><summary>{labels[quantity.finishType]}: размеры и закупка</summary>
        <ul>{quantity.pieces.map((piece) => <li key={piece.part}>{parts[piece.part]}: {length(piece.requiredLengthMm)} × {length(piece.requiredDepthMm)} мм с припусками</li>)}</ul>
        <p>Потребность с припусками: {length(quantity.requiredLengthMm)} мм; к закупке после округления каждой детали: <strong>{length(quantity.purchaseLengthM)} м</strong>.</p>
        <p>Работа: {length(quantity.actualInstalledLengthM)} м. Материал: {amount(result.price.lines.find((line) => line.materialId === quantity.materialId)!.materialSellingPrice)}; работа: {amount(result.price.lines.find((line) => line.materialId === quantity.materialId)!.workPrice)}.</p>
      </details>)}
    </> : <p className="validation" role="alert">{error}</p>}
      <button disabled={busy || !result} onClick={() => void save()}>Сохранить отделку</button>
      <button className="secondary" disabled={busy} onClick={() => void load()}>Загрузить отделку</button>
      <p className="muted">Один расчёт отделки хранится локально отдельно от расчёта окна. Новое сохранение заменяет предыдущую отделку.</p>
      <p role="status" aria-live="polite">{message}</p>
    </aside></div>
  </main>;
}
