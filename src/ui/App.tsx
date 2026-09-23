import { useState } from 'react';
import type { Calculation } from '../domain/calculation';
import { demoConfiguration } from '../domain/configuration/demo-configuration';
import type { UserConfiguration } from '../domain/configuration/types';
import type { HingeSide, Lamination, Material, OpeningType, Section } from '../domain/measurements/shared';
import type { WindowType } from '../domain/measurements/window/types';
import { estimateWindow } from '../application/estimate/estimate-window';
import { createEqualSections, distributeSectionWidths, toWindowInput, type WindowInput } from '../application/estimate/window-editor';
import type { CalculationRepository } from '../application/estimate/calculation-repository';
import { WindowPreview } from './WindowPreview';
import './styles.css';

// Preserve the existing storage key so the v1 single-window record remains accessible.
const draftId = 'single-window-demo';
const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
const numeric = (value: string) => value === '' ? NaN : Number(value);
const fieldValue = (value: number) => Number.isNaN(value) ? '' : value;
const initialInput: WindowInput = {
  id: draftId, room: 'Кухня', name: 'Окно 1', windowType: 'single', widthMm: 1000, heightMm: 1500,
  material: 'pvc', profileId: 'pvc', lamination: 'none', sections: createEqualSections('single', 1000),
};
const rateFields = [
  ['basePricePerM2', 'Базовая цена, ₽/м²'], ['activityPercent', 'Активная створка, %'],
  ['laminateOneSidePercent', 'Ламинация с одной стороны, %'],
  ['laminateTwoSidesPercent', 'Ламинация с двух сторон, %'], ['productMarkupPercent', 'Наценка изделия, %'],
] as const;

export function App({ repository }: { repository: CalculationRepository }) {
  const [input, setInput] = useState<WindowInput>(initialInput);
  const [configuration, setConfiguration] = useState<UserConfiguration>(demoConfiguration);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const profile = configuration.profiles.find((item) => item.id === input.profileId);
  const hardware = configuration.hardware.filter((item) => item.material === input.material);
  let result: Calculation | undefined;
  let error = '';
  try { result = estimateWindow(input, configuration); }
  catch (reason) { error = reason instanceof Error ? reason.message : 'Некорректные параметры окна.'; }

  function edit(patch: Partial<WindowInput>) { setInput({ ...input, ...patch }); setMessage(''); }
  function editSection(index: number, section: Section) {
    edit({ sections: input.sections.map((existing, i) => i === index ? section : existing) });
  }
  function changeType(windowType: WindowType) {
    try { edit({ windowType, sections: createEqualSections(windowType, input.widthMm) }); }
    catch { setMessage('Для выбора типа сначала введите положительную ширину окна.'); }
  }
  function distribute() {
    try { edit({ sections: distributeSectionWidths(input.windowType, input.widthMm, input.sections) }); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Проверьте ширину окна.'); }
  }
  function changeOpening(index: number, openingType: OpeningType) {
    const existing = input.sections[index]!;
    const base = { id: existing.id, widthMm: existing.widthMm };
    editSection(index, openingType === 'fixed' ? { ...base, openingType } : {
      ...base, openingType, hingeSide: existing.hingeSide ?? 'left', hardwareId: existing.hardwareId ?? hardware[0]?.id ?? '',
    });
  }
  function changeMaterial(material: Material) {
    edit({ material, profileId: configuration.profiles.find((item) => item.material === material)?.id ?? '',
      sections: input.sections.map((section) => section.openingType === 'fixed' ? section : {
        ...section, hardwareId: configuration.hardware.find((item) => item.material === material)?.id ?? '',
      }),
    });
  }
  function changeRate(key: typeof rateFields[number][0], value: string) {
    setConfiguration({ ...configuration, profiles: configuration.profiles.map((item) => item.id === input.profileId ? { ...item, [key]: numeric(value) } : item) });
    setMessage('');
  }
  async function save() {
    if (!result) return;
    setBusy(true);
    try { await repository.save(result); setMessage('Расчёт сохранён в этом браузере. Предыдущий демо-расчёт заменён.'); }
    catch { setMessage('Не удалось сохранить расчёт. Проверьте доступность IndexedDB.'); }
    finally { setBusy(false); }
  }
  async function load() {
    setBusy(true);
    try {
      const saved = await repository.get(draftId);
      if (!saved) { setMessage('Сохранённого расчёта пока нет.'); return; }
      if (saved.schemaVersion !== 2) throw new Error('Unsupported schema');
      const restored = toWindowInput(saved.measurement);
      estimateWindow(restored, saved.configuration);
      setInput(restored); setConfiguration(saved.configuration);
      setMessage('Загружен локальный расчёт с сохранёнными тарифами.');
    } catch { setMessage('Не удалось загрузить расчёт: хранилище недоступно или запись повреждена.'); }
    finally { setBusy(false); }
  }

  return <main>
    <header><p className="eyebrow">ЗАМЕР → РАСЧЁТ → СМЕТА</p><h1>Window Estimator</h1><p>Окно · базовый оконный замер</p></header>
    <p className="notice">Демонстрационные тарифы. Стоимость только остекления, без монтажа и дополнительных работ.</p>
    <div className="layout"><form onSubmit={(event) => event.preventDefault()}>
      <fieldset disabled={busy}><legend>1. Помещение и тип окна</legend><div className="fields">
        <label>Помещение<input required value={input.room} onChange={(e) => edit({ room: e.target.value })} /></label>
        <label>Название<input required value={input.name} onChange={(e) => edit({ name: e.target.value })} /></label>
        <label>Тип окна<select aria-label="Тип окна" value={input.windowType} onChange={(e) => changeType(e.target.value as WindowType)}><option value="single">Одностворчатое</option><option value="double">Двустворчатое</option><option value="triple">Трёхстворчатое</option></select></label>
      </div><p className="muted">При выборе типа создаются равные глухие секции; прежние открывания заменяются.</p></fieldset>
      <fieldset disabled={busy}><legend>2. Общие размеры</legend><div className="fields">
        <label>Ширина окна, мм<input aria-label="Ширина окна, мм" required type="number" min="0" step="any" value={fieldValue(input.widthMm)} onChange={(e) => edit({ widthMm: numeric(e.target.value) })} /></label>
        <label>Высота окна, мм<input aria-label="Высота окна, мм" required type="number" min="0" step="any" value={fieldValue(input.heightMm)} onChange={(e) => edit({ heightMm: numeric(e.target.value) })} /></label>
        <label className="checkbox"><input type="checkbox" checked={input.transom !== undefined} onChange={(e) => {
          if (e.target.checked) edit({ transom: { openingType: 'fixed', heightMm: NaN } });
          else { const { transom: _transom, ...rest } = input; setInput(rest); setMessage(''); }
        }} />Верхняя глухая фрамуга</label>
        {input.transom && <label>Высота фрамуги, мм<input aria-label="Высота фрамуги, мм" required type="number" min="0" step="any" value={fieldValue(input.transom.heightMm)} onChange={(e) => edit({ transom: { openingType: 'fixed', heightMm: numeric(e.target.value) } })} /></label>}
      </div></fieldset>
      <fieldset disabled={busy}><legend>3. Ширины секций слева направо</legend><div className="fields">
        {input.sections.map((section, index) => <label key={section.id}>Секция {index + 1}, мм<input aria-label={`Ширина секции ${index + 1}, мм`} type="number" required min="0" step="any" value={fieldValue(section.widthMm)} onChange={(e) => editSection(index, { ...section, widthMm: numeric(e.target.value) })} /></label>)}
      </div><button type="button" className="secondary" onClick={distribute}>Распределить поровну</button>
        <p className="muted">Общая ширина не перераспределяет секции автоматически. Их сумма должна совпадать с шириной окна. Дробные мм сохраняются без округления.</p>
      </fieldset>
      <fieldset disabled={busy}><legend>4. Открывания</legend>{input.sections.map((section, index) => <div className="section-row fields" key={section.id}>
        <label>Секция {index + 1}: открывание<select aria-label={`Открывание секции ${index + 1}`} value={section.openingType} onChange={(e) => changeOpening(index, e.target.value as OpeningType)}><option value="fixed">Глухое</option><option value="turn">Поворотное</option><option value="tilt_turn">Поворотно-откидное</option></select></label>
        {section.openingType !== 'fixed' && <label>Секция {index + 1}: петли<select aria-label={`Петли секции ${index + 1}`} value={section.hingeSide} onChange={(e) => editSection(index, { ...section, hingeSide: e.target.value as HingeSide })}><option value="left">Слева</option><option value="right">Справа</option></select></label>}
      </div>)}</fieldset>
      <fieldset disabled={busy}><legend>5. Материал и профиль</legend><div className="fields">
        <label>Материал<select aria-label="Материал" value={input.material} onChange={(e) => changeMaterial(e.target.value as Material)}><option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label>
        <label>Профиль<select aria-label="Профиль" value={input.profileId} onChange={(e) => edit({ profileId: e.target.value })}>{configuration.profiles.filter((item) => item.material === input.material).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div><p className="muted">При смене материала выбираются первый совместимый профиль и фурнитура.</p></fieldset>
      <fieldset disabled={busy}><legend>6. Фурнитура активных створок</legend><div className="fields">
        {input.sections.map((section, index) => section.openingType !== 'fixed' && <label key={section.id}>Секция {index + 1}: фурнитура<select aria-label={`Фурнитура секции ${index + 1}`} value={section.hardwareId} onChange={(e) => editSection(index, { ...section, hardwareId: e.target.value })}><option value="">Выберите фурнитуру</option>{hardware.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
      </div><p className="muted">У глухих секций фурнитуры нет. Отдельная надбавка за фурнитуру не начисляется.</p></fieldset>
      <fieldset disabled={busy}><legend>7. Ламинация</legend><label>Ламинация<select aria-label="Ламинация" value={input.lamination} onChange={(e) => edit({ lamination: e.target.value as Lamination })}><option value="none">Нет</option><option value="one_side">Одна сторона</option><option value="two_sides">Две стороны</option></select></label></fieldset>
      <details><summary>Демонстрационные тарифы профиля</summary><fieldset disabled={busy}><div className="fields">{profile && rateFields.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" required value={fieldValue(profile[key])} onChange={(e) => changeRate(key, e.target.value)} /></label>)}</div></fieldset></details>
    </form><aside>
      <h2>Технический эскиз</h2>
      {result ? <WindowPreview geometry={result.geometry} /> : <p className="validation" role="alert">{error}</p>}
      <h2>Текущая цена</h2>{result ? <>
        <p className="total">{money(result.price.totalMinor / 100)}</p>
        <dl>{[
          ['Общая площадь', `${result.geometry.totalAreaM2.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} м²`],
          ['Активная площадь', `${result.geometry.activeAreaM2.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} м²`],
          ['Базовая стоимость', money(result.price.baseAmount)], ['Активные створки', money(result.price.activityAmount)],
          ['Ламинация', money(result.price.colorAmount)], ['Наценка', money(result.price.markupAmount)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </> : <p>Цена недоступна: исправьте параметры окна.</p>}
      <button disabled={busy || !result} onClick={() => void save()}>Сохранить в браузере</button>
      <button className="secondary" disabled={busy} onClick={() => void load()}>Загрузить сохранённый расчёт</button>
      <p className="muted">Один локальный демо-расчёт. Сохранение заменяет предыдущий. Данные доступны только в этом браузере.</p>
      <p role="status" aria-live="polite">{message}</p>
    </aside></div>
  </main>;
}
