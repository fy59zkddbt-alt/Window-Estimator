import { useState } from 'react';
import type { BalconyEstimate } from '../domain/measurement-estimate';
import type { BalconyPlane, BalconySection } from '../domain/measurements/balcony/types';
import type { UserConfiguration } from '../domain/configuration/types';
import { estimateBalcony, type BalconyInput } from '../application/estimate/estimate-balcony';
import { balconyDraft, changeBalconyShape, changeBalconyMaterial, changePlaneSectionCount, initializePlaneWidth, distributePlane, changeBalconyOpening } from '../application/estimate/balcony-editor';
import { WindowPreview } from './WindowPreview';
import { AdditionalWorksEditor } from './AdditionalWorksEditor';

const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label>{label}<input type="number" min="0" step="any" value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} /></label>;
}
export function BalconyScreen({ id, initial, configuration: currentConfiguration, onSave, onCancel }: { id: string; initial?: BalconyEstimate; configuration: UserConfiguration; onSave: (value: BalconyEstimate) => Promise<void>; onCancel: () => void }) {
  const [input, setInput] = useState<BalconyInput>(() => initial?.measurement ?? balconyDraft(id));
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [configuration] = useState(initial?.configuration ?? currentConfiguration);
  let result: BalconyEstimate | undefined;
  let error = '';
  try { result = estimateBalcony(input, configuration); } catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте данные.'; }
  const plane = input.planes[page]!;
  function updatePlane(next: BalconyPlane) { setInput({ ...input, planes: input.planes.map((p, i) => i === page ? next : p) }); }
  function updateSection(index: number, section: BalconySection) { updatePlane({ ...plane, sections: plane.sections.map((s, i) => i === index ? section : s) }); }
  async function save() {
    if (!result) return;
    setBusy(true); setSaveError('');
    try { await onSave(result); } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Не удалось сохранить.'); }
    finally { setBusy(false); }
  }
  return <main><h1>Балкон</h1><p className="muted">Тарифы из снимка настроек замера. Вид из помещения; плоскости показаны отдельно. Монтаж автоматически не начисляется.</p>
    <div className="layout"><form onSubmit={(e) => e.preventDefault()}><fieldset disabled={busy}><legend>Помещение и конструкция</legend>
      <div className="fields"><label>Помещение<input value={input.room} onChange={(e) => setInput({ ...input, room: e.target.value })} /></label>
      <label>Название<input value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} /></label>
      <label>Тип балкона<select value={input.balconyType} onChange={(e) => { setInput(changeBalconyShape(input, e.target.value as BalconyInput['balconyType'], e.target.value === 'L' ? 'left' : undefined)); setPage(0); }}><option value="straight">Прямой</option><option value="L">L-образный</option><option value="U">U-образный</option></select></label>
      {input.balconyType === 'L' && <label>Сторона L<select value={input.side} onChange={(e) => { setInput(changeBalconyShape(input, 'L', e.target.value as 'left' | 'right')); setPage(0); }}><option value="left">Левая</option><option value="right">Правая</option></select></label>}
      <label>Материал<select value={input.material} onChange={(e) => setInput(changeBalconyMaterial(input, e.target.value as BalconyInput['material']))}><option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label></div>
      <p className="muted">Смена формы сохраняет общие стороны и удаляет отсутствующие. Смена материала сбрасывает открывания в fixed и выбор профиля.</p>
    </fieldset>
    <fieldset disabled={busy}><legend>Плоскость {page + 1} из {input.planes.length}: {plane.name}</legend>
      <div className="calculation-actions">{input.planes.map((p, i) => <button type="button" key={p.id} aria-pressed={i === page} onClick={() => setPage(i)}>{p.name}</button>)}</div>
      <div className="fields"><NumberField label="Ширина плоскости, мм" value={plane.widthMm} onChange={(v) => updatePlane(initializePlaneWidth(plane, v))} />
      <NumberField label="Высота плоскости, мм" value={plane.heightMm} onChange={(heightMm) => updatePlane({ ...plane, heightMm })} />
      <label>Количество секций<select value={plane.sectionCount} onChange={(e) => updatePlane(changePlaneSectionCount(plane, Number(e.target.value)))}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label></div>
      <p className="muted">Первое создание и смена количества: равные глухие секции. Затем общая ширина не изменяет ширины секций автоматически.</p>
      <button type="button" disabled={!Number.isFinite(plane.widthMm) || plane.widthMm <= 0} onClick={() => updatePlane(distributePlane(plane))}>Распределить поровну</button>
      <label>Ярусность<select value={plane.levels.mode} onChange={(e) => updatePlane({ ...plane, levels: e.target.value === 'oneLevel' ? { mode: 'oneLevel' } : { mode: 'twoLevel', splitHeightMm: NaN, lowerFill: 'glass' } })}><option value="oneLevel">Один ярус</option><option value="twoLevel">Два яруса</option></select></label>
      {plane.levels.mode === 'twoLevel' && <><NumberField label="Высота нижнего яруса от низа, мм" value={plane.levels.splitHeightMm} onChange={(splitHeightMm) => { if (plane.levels.mode === 'twoLevel') updatePlane({ ...plane, levels: { ...plane.levels, splitHeightMm } }); }} />
      <label>Нижнее заполнение<select value={plane.levels.lowerFill} onChange={(e) => { if (plane.levels.mode === 'twoLevel') updatePlane({ ...plane, levels: { ...plane.levels, lowerFill: e.target.value as 'glass' | 'sandwich' } }); }}><option value="glass">Стекло</option><option value="sandwich">Сэндвич</option></select></label></>}
      {plane.sections.map((section, index) => <fieldset key={section.id}><legend>Секция {index + 1}{plane.levels.mode === 'twoLevel' ? ' — верхний ярус' : ''}</legend><div className="fields">
        <NumberField label={`Ширина секции ${index + 1}, мм`} value={section.widthMm} onChange={(widthMm) => updateSection(index, { ...section, widthMm })} />
        <label>Открывание<select value={section.openingType} onChange={(e) => updateSection(index, changeBalconyOpening(section, e.target.value as BalconySection['openingType']))}><option value="fixed">Глухое</option>{input.material === 'pvc' ? <><option value="turn">Поворотное</option><option value="tilt_turn">Поворотно-откидное</option></> : <option value="sliding">Раздвижное</option>}</select></label>
        {(section.openingType === 'turn' || section.openingType === 'tilt_turn') && <><label>Петли<select value={section.hingeSide} onChange={(e) => updateSection(index, { ...section, hingeSide: e.target.value as 'left' | 'right' })}><option value="left">Слева</option><option value="right">Справа</option></select></label>
        <label>Фурнитура<select value={section.hardwareId} onChange={(e) => updateSection(index, { ...section, hardwareId: e.target.value })}><option value="">Выберите</option>{configuration.hardware.filter((h) => h.material === input.material).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label></>}
      </div></fieldset>)}
      {page + 1 < input.planes.length && <button type="button" onClick={() => setPage(page + 1)}>Следующая сторона</button>}
    </fieldset>
    <fieldset disabled={busy}><legend>Профиль / система</legend><label>Профиль<select value={input.profileId} onChange={(e) => setInput({ ...input, profileId: e.target.value })}><option value="">Выберите</option>{configuration.profiles.filter((p) => p.material === input.material).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Ламинация<select value={input.lamination} onChange={(e) => setInput({ ...input, lamination: e.target.value as BalconyInput['lamination'] })}><option value="none">Нет</option><option value="one_side">Одна сторона</option><option value="two_sides">Две стороны</option></select></label>
    </fieldset>
    <AdditionalWorksEditor works={input.additionalWorks ?? []} onChange={(additionalWorks) => setInput({ ...input, additionalWorks })} disabled={busy} />
    </form><aside><h2>Текущая цена</h2>{result ? <><p className="total">{money(result.measurementTotalMinor)}</p>
      <p>Остекление: {money(result.basePriceMinor)}; допработы: {money(result.additionalWorksTotalMinor)}.</p>
      <p>Общая площадь: {result.geometry.totalAreaM2.toLocaleString('ru-RU')} м²; активная: {result.geometry.activeAreaM2.toLocaleString('ru-RU')} м²; сэндвич: {result.geometry.sandwichAreaM2.toLocaleString('ru-RU')} м².</p>
      <p className="muted">Сэндвич пока оценивается по общей ставке остекления, без ценовой поправки.</p>
      {result.geometry.planes.map((p) => <section key={p.id}><h3>{p.name}</h3><p>Площадь: {p.totalAreaM2.toLocaleString('ru-RU')} м².</p><WindowPreview geometry={p} label={`Балкон — ${p.name}`} /></section>)}
    </> : <p role="alert" className="validation">{error}</p>}
      {saveError && <p role="alert">{saveError}</p>}<button disabled={busy || !result} onClick={() => void save()}>Сохранить замер</button> <button disabled={busy} onClick={onCancel}>Отмена</button>
    </aside></div></main>;
}
