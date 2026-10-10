import { useCallback, useState } from 'react';
import { changeFinishWork, copyFinishEditorValue, finishDimensionFromText, finishMaterialChoices, finishMaterialFit,
  manualFinishPriceText, newFinishDraft, readyFinishMeasurement, reviseFinishDraft, setManualFinishPrice, type FinishSeed } from '../application/estimate/finish-editor-v2';
import { estimateDraft } from '../application/estimate/active-calculation';
import type { WindowFinishMeasurement } from '../domain/measurements/vnext';
import type { CommercialRoundingStepRub, FinishConfiguration, FinishElement, FinishWork, FinishWorkType } from '../domain/configuration/vnext/types';
import { ActiveAdditionalWorksEditor } from './ActiveAdditionalWorksEditor';
import './styles.css';

const elements = { slope: 'Откосы', sill: 'Подоконник', drip: 'Отлив' };
const workLabels: Record<FinishWorkType, string> = { interiorSlopes: 'Откосы', interiorSlopesAndSill: 'Откосы + подоконник',
  sillOnly: 'Только подоконник', exteriorSlopes: 'Наружные откосы', exteriorSlopesAndDrip: 'Наружные откосы + отлив', dripOnly: 'Только отлив' };
const workOptions: readonly FinishWork[] = [
  { side: 'interior', workType: 'interiorSlopes' }, { side: 'interior', workType: 'interiorSlopesAndSill' }, { side: 'interior', workType: 'sillOnly' },
  { side: 'exterior', workType: 'exteriorSlopes' }, { side: 'exterior', workType: 'exteriorSlopesAndDrip' }, { side: 'exterior', workType: 'dripOnly' },
];
const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })
  .formatToParts(BigInt(minor) / 100n).map((part) => part.type === 'fraction' ? String(BigInt(minor) % 100n).padStart(2, '0') : part.value).join('');
const mm = (value: number) => value.toLocaleString('ru-RU', { maximumSignificantDigits: 21 });

function Dimension({ label, value, onChange, onEditing }: { label: string; value: number; onChange: (value: number) => void; onEditing: (id: string, pending: boolean) => void }) {
  const [text, setText] = useState<string>();
  return <label>{label}<input aria-label={label} type="text" inputMode="decimal" enterKeyHint="next"
    value={text ?? (Number.isFinite(value) ? String(value) : '')}
    onChange={(e) => { setText(e.target.value); onEditing(label, true); }}
    onBlur={() => { if (text !== undefined) { onChange(finishDimensionFromText(text)); setText(undefined); onEditing(label, false); } }}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} /></label>;
}

export function FinishScreen({ id, initial, seed, configuration: snapshot, step, onSave, onCancel }: {
  id: string; initial?: WindowFinishMeasurement; seed?: FinishSeed; configuration: FinishConfiguration; step: CommercialRoundingStepRub;
  onSave: (result: WindowFinishMeasurement) => Promise<void>; onCancel: () => void;
}) {
  const [configuration] = useState(() => copyFinishEditorValue(snapshot));
  const [value, setValue] = useState(() => initial ? copyFinishEditorValue(initial) : newFinishDraft(id, configuration, seed));
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const onEditing = useCallback((id: string, editing: boolean) => setPending((previous) => {
    const next = new Set(previous); if (editing) next.add(id); else next.delete(id); return next;
  }), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [manualEntry, setManualEntry] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualError, setManualError] = useState('');
  let result: Extract<ReturnType<typeof estimateDraft>, { kind: 'WindowFinish' }> | undefined;
  let error = '';
  try {
    const next = estimateDraft(readyFinishMeasurement(value), { kind: 'WindowFinish', configuration }, step);
    if (next.kind === 'WindowFinish') result = next;
  } catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте параметры отделки.'; }
  const live = pending.size ? undefined : result;
  if (pending.size) error = 'Завершите ввод размера: нажмите «Далее» или перейдите к следующему полю.';
  function update(next: WindowFinishMeasurement) { setValue(reviseFinishDraft(value, next)); setMessage(''); }
  function work(next: FinishWork) { update(changeFinishWork(value, next, configuration)); }
  function manual() {
    setManualText(value.priceState.mode === 'manual' ? manualFinishPriceText(value.priceState.finalPriceMinor) : '');
    setManualEntry(true); setManualError('');
  }
  function applyManual() {
    if (!live) return;
    try { setValue(setManualFinishPrice(value, manualText)); setManualEntry(false); setManualError(''); }
    catch (reason) { setManualError(reason instanceof Error ? reason.message : 'Проверьте цену.'); }
  }
  async function save() {
    if (!live || manualEntry) return;
    setBusy(true); setMessage('');
    try { await onSave(live.result.measurement); }
    catch { setMessage('Не удалось сохранить отделку. Повторите сохранение.'); }
    finally { setBusy(false); }
  }
  return <main className="finish-editor" aria-label="Редактор отделки">
    <header><p className="eyebrow">ЗАМЕРОК · ЗАМЕР</p><h1>Отделка окна</h1></header>
    {seed && <p className="notice">Размеры из балконного блока. Измерьте фактическую глубину. Отделка сохранится отдельным замером.</p>}
    <p className="muted">Материалы и цены из снимка расчёта.</p>
    <form onSubmit={(e) => e.preventDefault()}><fieldset disabled={busy}>
      <fieldset><legend>Размеры проёма</legend><div className="fields">
        <Dimension label="Ширина проёма, мм" value={value.widthMm} onChange={(widthMm) => update({ ...value, widthMm })} onEditing={onEditing} />
        <Dimension label="Высота проёма, мм" value={value.heightMm} onChange={(heightMm) => update({ ...value, heightMm })} onEditing={onEditing} />
        <Dimension label="Фактическая глубина, мм" value={value.depthMm} onChange={(depthMm) => update({ ...value, depthMm })} onEditing={onEditing} />
      </div><p className="muted">По этой глубине калькулятор подбирает подходящую ширину материала.</p></fieldset>
      <fieldset><legend>Вид отделки</legend><div className="fields">
        <label>Сторона отделки<select aria-label="Сторона отделки" value={value.side} onChange={(e) => work(e.target.value === 'interior'
          ? { side: 'interior', workType: 'interiorSlopesAndSill' } : { side: 'exterior', workType: 'exteriorSlopesAndDrip' })}>
          <option value="interior">Внутренняя отделка</option><option value="exterior">Наружная отделка</option></select></label>
        <label>Состав работ<select aria-label="Состав работ" value={value.workType} onChange={(e) => { const selected = workOptions.find((option) => option.workType === e.target.value); if (selected) work(selected); }}>
          {workOptions.filter((option) => option.side === value.side).map((option) => <option key={option.workType} value={option.workType}>{workLabels[option.workType]}</option>)}
        </select></label>
      </div></fieldset>
      <fieldset id="finish-materials"><legend>Материалы</legend>{value.selections.map((selection) => {
        const choices = finishMaterialChoices(configuration, value.side, selection.element, selection.materialId);
        const fit = live ? finishMaterialFit(live.result.measurement, configuration, selection.element) : undefined;
        return <section className="finish-material" key={selection.element}><label>Материал — {elements[selection.element]}<select aria-label={`Материал — ${elements[selection.element]}`} value={selection.materialId}
          onChange={(e) => update({ ...value, selections: value.selections.map((item) => item.element === selection.element ? { element: item.element, materialId: e.target.value } : item) })}>
          <option value="" disabled>Выберите материал</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          {!choices.length && <p className="validation">В снимке расчёта нет материала для этого вида отделки. Выберите другой состав работ или создайте новый расчёт после настройки материалов.</p>}
          {fit?.variant && <><p><strong>Подходящая ширина: {mm(fit.variant.physicalWidthMm)} мм</strong></p>
            <p className="muted">Для глубины {mm(value.depthMm)} мм выбран {selection.widthVariantId ? 'указанный' : 'минимальный подходящий'} материал шириной {mm(fit.variant.physicalWidthMm)} мм.</p></>}
          {fit?.material && !fit.variant && <p className="validation">Для глубины {mm(value.depthMm)} мм нет подходящего варианта материала «{fit.material.name}»{selection.widthVariantId ? ' с указанной шириной' : ''}.</p>}
        </section>;
      })}</fieldset>
      <fieldset><legend>Помещение и название</legend><div className="fields">
        <label>Помещение <span className="muted">Необязательно</span><input placeholder="Кухня, спальня…" value={value.room} onChange={(e) => update({ ...value, room: e.target.value })} /></label>
        <label>Название <span className="muted">Необязательно</span><input placeholder="Отделка окна 1" value={value.name} onChange={(e) => update({ ...value, name: e.target.value })} /></label>
      </div></fieldset>
      <details><summary>Дополнительные параметры</summary><p className="muted">Припуски на раскрой заданы в снимке расчёта. Они влияют на количество материала, а ширина подбирается по фактической глубине.</p>
        {value.selections.map((selection) => <VariantControl key={selection.element} value={value} element={selection.element} configuration={configuration} onChange={update} />)}
      </details>
      <details><summary>Дополнительные работы</summary><p className="muted">Утепление и герметизация добавляются отдельно к цене отделки.</p>
        <ActiveAdditionalWorksEditor works={value.additionalWorks} onChange={(additionalWorks) => update({ ...value, additionalWorks })} />
      </details>
    </fieldset></form>
    <section className="finish-result" aria-label="Текущая цена" aria-live="polite"><h2>Отделка под ключ</h2>
      {manualEntry ? <p>Введите ручную цену и нажмите «Применить ручную цену».</p> : live ? <>
        {live.result.price.priceState.mode === 'manual' && <><p>Цена задана вручную</p>
          {live.result.price.priceState.confirmation === 'needsConfirmation' && <><p>Прежняя ручная цена: {money(live.result.price.priceState.finalPriceMinor)}</p><p className="validation" role="alert">Параметры изменились. Подтвердите ручную цену повторно.</p></>}</>}
        {live.basePriceMinor === null ? <div className="validation" role="alert"><strong>Нужно уточнить цену</strong><p>Цена требует уточнения{live.result.price.priceState.mode === 'manual' ? ' до подтверждения ручной цены.' : '.'}</p></div>
          : <p className="total">{money(live.basePriceMinor)}</p>}
        {live.result.price.priceState.mode === 'priceRequiresClarification' && <><p>{live.result.price.priceState.reason}</p>
          <a href="#finish-materials">Изменить материал</a><p className="muted">Можно указать итоговую цену вручную или сохранить замер для уточнения. Изменённые настройки применяются к новым расчётам.</p></>}
        {live.additionalWorksTotalMinor > 0 && <p>Дополнительные работы: {money(live.additionalWorksTotalMinor)}</p>}
        {live.additionalWorksTotalMinor > 0 && live.measurementTotalMinor !== null && <p className="editor-total">С работами: {money(live.measurementTotalMinor)}</p>}
      </> : <p className="validation" role="alert">{error}</p>}
      <fieldset disabled={busy}>
        {manualEntry ? <div className="manual-finish-price"><label>Итоговая цена отделки, ₽<input aria-label="Итоговая цена отделки, ₽" type="text" inputMode="decimal" value={manualText} onChange={(e) => { setManualText(e.target.value); setManualError(''); }} /></label>
          <p className="muted">Конечная цена для клиента. Сумма сохраняется точно, без повторного округления. Дополнительные работы учитываются отдельно.</p>
          {manualError && <p className="validation" role="alert">{manualError}</p>}
          <button type="button" disabled={!live} onClick={applyManual}>Применить ручную цену</button>
          <button className="secondary" type="button" onClick={() => setManualEntry(false)}>Отменить ввод цены</button>
        </div> : <>
          <button type="button" disabled={!live} onClick={manual}>{value.priceState.mode === 'manual' ? 'Изменить ручную цену' : 'Указать цену вручную'}</button>
          {value.priceState.mode === 'manual' && <>
            {value.priceState.confirmation === 'needsConfirmation' && <button type="button" disabled={!live} onClick={() => {
              if (value.priceState.mode === 'manual') setValue(setManualFinishPrice(value, manualFinishPriceText(value.priceState.finalPriceMinor)));
            }}>Подтвердить ручную цену</button>}
            <button className="secondary" type="button" onClick={() => update({ ...value, priceState: { mode: 'automatic' } })}>Рассчитать автоматически</button>
          </>}
        </>}
      </fieldset>
    </section>
    <div className="editor-actions"><button disabled={busy || !live || manualEntry} onClick={() => void save()}>Сохранить замер</button>
      <button className="secondary" disabled={busy} onClick={onCancel}>Отмена</button></div>
    {message && <p role="alert" className="validation">{message}</p>}
  </main>;
}

function VariantControl({ value, element, configuration, onChange }: { value: WindowFinishMeasurement; element: FinishElement; configuration: FinishConfiguration; onChange: (value: WindowFinishMeasurement) => void }) {
  const selection = value.selections.find((item) => item.element === element)!;
  const material = configuration.materials.find((item) => item.id === selection.materialId);
  return <><label>Ширина материала — {elements[element]}<select aria-label={`Ширина материала — ${elements[element]}`} value={selection.widthVariantId ?? ''} onChange={(e) => onChange({ ...value,
    selections: value.selections.map((item) => item.element !== element ? item : { element, materialId: selection.materialId, ...(e.target.value ? { widthVariantId: e.target.value } : {}) }) })}>
    <option value="">Автоматический подбор</option>{material?.widthVariants.map((variant) => <option key={variant.id} value={variant.id}>{mm(variant.physicalWidthMm)} мм</option>)}
    {selection.widthVariantId && !material?.widthVariants.some((variant) => variant.id === selection.widthVariantId) && <option value={selection.widthVariantId}>Прежняя ширина недоступна</option>}
  </select></label><p className="muted">{elements[element]}: припуск длины на деталь {mm(configuration.allowances[element].lengthMm)} мм; глубины {mm(configuration.allowances[element].depthMm)} мм.</p></>;
}
