import { useState } from 'react';
import type { WindowEstimate } from '../domain/measurement-estimate';
import type { UserConfiguration } from '../domain/configuration/types';
import type { HingeSide, Lamination, Material, OpeningType, OpeningElement } from '../domain/measurements/shared';
import type { WindowType } from '../domain/measurements/window/types';
import { createEqualSections, toWindowInput, createEditorState, changeWindowType, changeBlockWindowCount, estimateDraft, type WindowInput, type WindowDraft } from '../application/estimate/window-editor';



import { WindowPreview } from './WindowPreview';
import { WindowDimensions } from './WindowDimensions';
import './styles.css';
import { AdditionalWorksEditor } from './AdditionalWorksEditor';


const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
const initialInput: WindowInput = {
  id: '', room: 'Кухня', name: 'Окно 1', windowType: 'single', widthMm: 1000, heightMm: 1500,
  material: 'pvc', profileId: 'pvc', lamination: 'none', sections: createEqualSections('single', 1000),
};
export function WindowScreen({ id, initial, configuration: currentConfiguration, onSave, onCancel }: { id: string; initial?: WindowEstimate; configuration: UserConfiguration; onSave: (result: WindowEstimate) => Promise<void>; onCancel: () => void }) {
  const [configuration] = useState(initial?.configuration ?? currentConfiguration);
  const [editor, setEditor] = useState(() => createEditorState(initial ? toWindowInput(initial.measurement) : { ...initialInput, id, profileId: configuration.profiles.find((item) => item.material === 'pvc')?.id ?? '' }));
  const input = editor.input;
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const hardware = configuration.hardware.filter((item) => item.material === input.material);
  let result: WindowEstimate | undefined;
  let error = '';
  try { result = estimateDraft(input, configuration); }
  catch (reason) { error = reason instanceof Error ? reason.message : 'Некорректные параметры окна.'; }

  function update(input: WindowDraft) { setEditor({ ...editor, input }); setMessage(''); }
  function edit(patch: Partial<Pick<WindowDraft, 'room' | 'name' | 'material' | 'profileId' | 'lamination' | 'sections'>>) { update({ ...input, ...patch }); }
  function editOpening(element: OpeningElement) {
    if (input.windowType === 'balconyBlock' && element.id === input.door.id) update({ ...input, door: element });
    else edit({ sections: input.sections.map((section) => section.id === element.id ? { ...element, widthMm: section.widthMm } : section) });
  }
  function changeType(windowType: WindowType) {
    try { setEditor(changeWindowType(editor, windowType)); setMessage(''); }
    catch { setMessage('Для выбора типа сначала введите положительную ширину окна.'); }
  }
  function changeOpening(existing: OpeningElement, openingType: OpeningType) {
    const base = { id: existing.id };
    editOpening(openingType === 'fixed' ? { ...base, openingType } : {
      ...base, openingType, hingeSide: existing.hingeSide ?? 'left', hardwareId: existing.hardwareId ?? (input.windowType === 'balconyBlock' ? '' : hardware[0]?.id ?? ''),
    });
  }
  function changeMaterial(material: Material) {
    const compatibleHardware = configuration.hardware.find((item) => item.material === material)?.id ?? '';
    const common = { material, profileId: configuration.profiles.find((item) => item.material === material)?.id ?? '',
      sections: input.sections.map((section) => section.openingType === 'fixed' ? section : { ...section, hardwareId: compatibleHardware }),
    };
    if (input.windowType === 'balconyBlock') update({ ...input, ...common, door: input.door.openingType === 'fixed' ? input.door : { ...input.door, hardwareId: compatibleHardware } });
    else update({ ...input, ...common });
  }
  async function save() {
    if (!result) return;
    setBusy(true);
    try { await onSave(result); }
    catch { setMessage('Не удалось сохранить расчёт. Проверьте доступность IndexedDB.'); }
    finally { setBusy(false); }
  }
  // Form order is stable by identity. Visual left-to-right order is supplied only by domain geometry.
  const windowOpenings = input.sections.map((element, index) => ({ element, label: `Секция ${index + 1}` }));
  const openingItems = input.windowType === 'balconyBlock' ? [{ element: input.door, label: 'Дверь' }, ...windowOpenings] : windowOpenings;
  const firstOpeningStep = input.windowType === 'balconyBlock' ? 5 : 4;

  return <main>
    <header><p className="eyebrow">ЗАМЕР → РАСЧЁТ → СМЕТА</p><h1>Window Estimator</h1><p>Окно · базовый оконный замер</p></header>
    <p className="notice">Тарифы взяты из снимка настроек замера. Монтаж включён по общей площади; дополнительные работы добавляются отдельно.</p>
    <div className="layout"><form onSubmit={(event) => event.preventDefault()}>
      <fieldset disabled={busy}><legend>1. Помещение и тип окна</legend><div className="fields">
        <label>Помещение<input required value={input.room} onChange={(e) => edit({ room: e.target.value })} /></label>
        <label>Название<input required value={input.name} onChange={(e) => edit({ name: e.target.value })} /></label>
        <label>Тип окна<select aria-label="Тип окна" value={input.windowType} onChange={(e) => changeType(e.target.value as WindowType)}><option value="single">Одностворчатое</option><option value="double">Двустворчатое</option><option value="triple">Трёхстворчатое</option><option value="balconyBlock">Балконный блок</option></select></label>
      </div><p className="muted">Новые элементы создаются глухими. Single/double/triple создают равные секции при смене типа. Черновик балконного блока хранится отдельно от прямоугольного окна до перезагрузки.</p></fieldset>
      <WindowDimensions input={input} busy={busy} onChange={update} onCountChange={(count) => { setEditor(changeBlockWindowCount(editor, count)); setMessage(''); }} onError={setMessage} />
      <fieldset disabled={busy}><legend>{firstOpeningStep}. Открывания</legend>{openingItems.map(({ element, label }) => <div className="section-row fields" key={element.id}>
        <label>{label}: открывание<select aria-label={`${label}: открывание`} value={element.openingType} onChange={(e) => changeOpening(element, e.target.value as OpeningType)}><option value="fixed">Глухое</option><option value="turn">Поворотное</option><option value="tilt_turn">Поворотно-откидное</option></select></label>
        {element.openingType !== 'fixed' && <label>{label}: петли<select aria-label={`${label}: петли`} value={element.hingeSide} onChange={(e) => editOpening({ ...element, hingeSide: e.target.value as HingeSide })}><option value="left">Слева</option><option value="right">Справа</option></select></label>}
      </div>)}</fieldset>
      <fieldset disabled={busy}><legend>{firstOpeningStep + 1}. Материал и профиль</legend><div className="fields">
        <label>Материал<select aria-label="Материал" value={input.material} onChange={(e) => changeMaterial(e.target.value as Material)}><option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label>
        <label>Профиль<select aria-label="Профиль" value={input.profileId} onChange={(e) => edit({ profileId: e.target.value })}>{configuration.profiles.filter((item) => item.material === input.material).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div><p className="muted">При смене материала выбираются первый совместимый профиль и фурнитура.</p></fieldset>
      <fieldset disabled={busy}><legend>{firstOpeningStep + 2}. Фурнитура активных элементов</legend><div className="fields">
        {openingItems.map(({ element, label }) => element.openingType !== 'fixed' && <label key={element.id}>{label}: фурнитура<select aria-label={`${label}: фурнитура`} value={element.hardwareId} onChange={(e) => editOpening({ ...element, hardwareId: e.target.value })}><option value="">Выберите фурнитуру</option>{hardware.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
      </div><p className="muted">У глухих секций фурнитуры нет. Отдельная надбавка за фурнитуру не начисляется.</p></fieldset>
      <fieldset disabled={busy}><legend>{firstOpeningStep + 3}. Ламинация</legend><label>Ламинация<select aria-label="Ламинация" value={input.lamination} onChange={(e) => edit({ lamination: e.target.value as Lamination })}><option value="none">Нет</option><option value="one_side">Одна сторона</option><option value="two_sides">Две стороны</option></select></label></fieldset>
      <AdditionalWorksEditor works={input.additionalWorks ?? []} onChange={(additionalWorks) => update({ ...input, additionalWorks })} disabled={busy} />
    </form><aside>
      <h2>Технический эскиз</h2>
      {result ? <WindowPreview geometry={result.geometry} /> : <p className="validation" role="alert">{error}</p>}
      <h2>Текущая цена</h2>{result ? <>
        <p className="total">{money(result.measurementTotalMinor / 100)}</p>
        <p>Остекление: {money(result.basePriceMinor / 100)}; дополнительные работы: {money(result.additionalWorksTotalMinor / 100)}.</p>
        <p>Изделие: {money(result.price.productPriceMinor / 100)}; монтаж: {money(result.price.installationPriceMinor / 100)}.</p>
        <dl>{[
          ['Общая площадь', `${result.geometry.totalAreaM2.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} м²`],
          ['Активная площадь', `${result.geometry.activeAreaM2.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} м²`],
          ['Базовая стоимость', money(result.price.baseAmount)], ['Активные створки', money(result.price.activityAmount)],
          ['Ламинация', money(result.price.colorAmount)], ['Наценка', money(result.price.markupAmount)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </> : <p>Цена недоступна: исправьте параметры окна.</p>}
      <button disabled={busy || !result} onClick={() => void save()}>Сохранить замер</button>
      <button className="secondary" disabled={busy} onClick={onCancel}>Отмена</button>

      <p role="status" aria-live="polite">{message}</p>
    </aside></div>
  </main>;
}
