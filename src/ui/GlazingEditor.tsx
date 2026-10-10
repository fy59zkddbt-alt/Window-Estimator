import { useCallback, useState } from 'react';
import type { WindowMeasurement, BalconyMeasurement } from '../domain/measurements/vnext';
import type { GlazingConfiguration, CommercialRoundingStepRub } from '../domain/configuration/vnext/types';
import { copyEditorMeasurement, newWindow, newBalcony, windowPartWidth, setWindowWidth, setWindowType, setBlockCount, editWindowWidth,
  changeShape, setPlaneWidth, editPlaneWidth, setPlaneMode, restoreBlockSecondOpening, type Glazing, type Element, type Plane } from '../application/estimate/glazing-editor-v2';
import { Identity, Millimeters, OpeningFields, ProductFields, ProductOptions, Scheme, LiveResult, useGlazingResult, NumericEditing } from './GlazingEditorFields';
import { ActiveAdditionalWorksEditor } from './ActiveAdditionalWorksEditor';
import './styles.css';

export interface GlazingEditorProps {
  id: string; kind: 'Window' | 'Balcony'; initial?: Glazing; configuration: GlazingConfiguration; step: CommercialRoundingStepRub;
  onSave: (value: Glazing) => Promise<void>; onCancel: () => void;
}
export function GlazingEditor({ id, kind, initial, configuration: snapshot, step, onSave, onCancel }: GlazingEditorProps) {
  const [configuration] = useState(() => copyEditorMeasurement(snapshot));
  const [value, setValue] = useState<Glazing>(() => initial ? copyEditorMeasurement(initial) : kind === 'Window' ? newWindow(id, configuration) : newBalcony(id, configuration));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const numericEditing = useCallback((id: string, editing: boolean) => setPending((previous) => {
    if (previous.has(id) === editing) return previous;
    const next = new Set(previous); if (editing) next.add(id); else next.delete(id); return next;
  }), []);
  const calculated = useGlazingResult(value, configuration, step);
  const live = pending.size ? { ...calculated, result: undefined, error: 'Завершите ввод размера: нажмите «Далее» или перейдите к следующему полю.' } : calculated;
  function update(next: Glazing) { setValue(next); setMessage(''); }
  async function save() {
    if (!live.result || !live.measurement) return;
    setBusy(true); setMessage('');
    try { await onSave(live.measurement); }
    catch { setMessage('Не удалось сохранить замер. Повторите сохранение.'); }
    finally { setBusy(false); }
  }
  return <NumericEditing value={numericEditing}><main className="glazing-editor" aria-label={kind === 'Window' ? 'Редактор окна' : 'Редактор балкона'}>
    <header><p className="eyebrow">ЗАМЕРОК · ЗАМЕР</p><h1>{value.kind === 'Balcony' ? 'Остекление балкона' : value.windowType === 'balconyBlock' ? 'Балконный блок' : 'Окно'}</h1>
      <a href="#measurement-scheme">К эскизу</a></header>
    <p className="muted">Цены и комплектация из снимка расчёта. Монтаж рассчитывается автоматически.</p>
    <form onSubmit={(e) => e.preventDefault()}><fieldset disabled={busy}>
      <Identity value={value} onChange={update} />
      {value.kind === 'Window' ? <WindowFields value={value} configuration={configuration} onChange={update} />
        : <BalconyFields value={value} configuration={configuration} onChange={update} />}
      <ProductFields value={value} configuration={configuration} onChange={update} />
      <details><summary>Дополнительные параметры</summary><ProductOptions value={value} onChange={update} />
        {value.kind === 'Window' && value.windowType !== 'balconyBlock' && <>
          <label className="checkbox"><input type="checkbox" checked={!!value.transom} onChange={(e) => {
            const { transom: _transom, ...rest } = value;
            update(e.target.checked ? { ...value, transom: { heightMm: NaN, openingType: 'fixed' } } : rest);
          }} />Верхняя глухая фрамуга</label>
          {value.transom && <Millimeters label="Высота фрамуги, мм" value={value.transom.heightMm} onChange={(heightMm) => update({ ...value, transom: { heightMm, openingType: 'fixed' } })} />}
        </>}
      </details>
      <details><summary>Дополнительные работы</summary><ActiveAdditionalWorksEditor works={value.additionalWorks} onChange={(additionalWorks) => update({ ...value, additionalWorks })} /></details>
    </fieldset></form>
    <section id="measurement-scheme" className="editor-scheme"><details open><summary>Эскиз · вид из помещения</summary><Scheme result={live.result} /></details></section>
    <LiveResult result={live.result} error={live.error} />
    <div className="editor-actions"><button disabled={busy || !live.result} onClick={() => void save()}>Сохранить замер</button>
      <button className="secondary" disabled={busy} onClick={onCancel}>Отмена</button></div>
    {message && <p role="alert" className="validation">{message}</p>}
  </main></NumericEditing>;
}

function WindowFields({ value, onChange, configuration }: { value: WindowMeasurement; onChange: (value: WindowMeasurement) => void; configuration: GlazingConfiguration }) {
  const [otherDraft, setOtherDraft] = useState<WindowMeasurement>();
  const [secondWindow, setSecondWindow] = useState<Element>();
  const [geometryError, setGeometryError] = useState('');
  function geometry(operation: () => void) {
    try { operation(); setGeometryError(''); } catch { setGeometryError('Недостаточная ширина для выбранного количества секций.'); }
  }
  function type(windowType: WindowMeasurement['windowType']) {
    const crossed = (windowType === 'balconyBlock') !== (value.windowType === 'balconyBlock');
    if (crossed) {
      setOtherDraft(copyEditorMeasurement(value));
      const restored = otherDraft ? { ...copyEditorMeasurement(otherDraft), room: value.room, name: value.name, additionalWorks: value.additionalWorks } : value;
      onChange(setWindowType(restored, windowType));
    } else onChange(setWindowType(value, windowType));
  }
  function count(next: 1 | 2) {
    if (value.plane.sections.length === 2) setSecondWindow(value.plane.sections[1]);
    let changed = setBlockCount(value, next);
    if (next === 2 && secondWindow) changed = restoreBlockSecondOpening(changed, secondWindow, configuration);
    onChange(changed);
  }
  function section(index: number, element: Element) {
    onChange({ ...value, plane: { ...value.plane, sections: value.plane.sections.map((s, i) => i === index ? element : s) } } as WindowMeasurement);
  }
  return <>
    <fieldset><legend>Размеры и конструкция</legend>
      <label>Тип окна<select aria-label="Тип окна" value={value.windowType} onChange={(e) => geometry(() => type(e.target.value as WindowMeasurement['windowType']))}>
        <option value="single">Одностворчатое</option><option value="double">Двустворчатое</option><option value="triple">Трёхстворчатое</option><option value="balconyBlock">Балконный блок</option>
      </select></label>
      <div className="fields"><Millimeters label={value.windowType === 'balconyBlock' ? 'Ширина оконной части, мм' : 'Общая ширина, мм'} value={windowPartWidth(value)} onChange={(width) => onChange(setWindowWidth(value, width))} />
        {value.windowType === 'balconyBlock' ? <>
          <Millimeters label="Ширина двери, мм" value={value.doorWidthMm} onChange={(doorWidthMm) => onChange({ ...value, doorWidthMm })} />
          <Millimeters label="Высота окна, мм" value={value.windowHeightMm} onChange={(windowHeightMm) => onChange({ ...value, windowHeightMm })} />
          <Millimeters label="Высота двери, мм" value={value.doorHeightMm} onChange={(doorHeightMm) => onChange({ ...value, doorHeightMm })} />
          <label>Секции оконной части<select aria-label="Секции оконной части" value={value.plane.sections.length} onChange={(e) => geometry(() => count(Number(e.target.value) as 1 | 2))}><option value="1">1</option><option value="2">2</option></select></label>
          <label>Положение двери<select aria-label="Положение двери" value={value.doorPosition} onChange={(e) => onChange({ ...value, doorPosition: e.target.value as typeof value.doorPosition })}><option value="">Выберите</option><option value="left">Слева</option><option value="middle">Посередине · для двух секций</option><option value="right">Справа</option></select></label>
        </> : <Millimeters label="Высота, мм" value={value.heightMm} onChange={(heightMm) => onChange({ ...value, heightMm })} />}
      </div><p className="muted">Общая ширина и количество секций распределяют ширины поровну. Изменение секции компенсируется соседней справа.</p>
      {geometryError && <p className="validation" role="alert">{geometryError}</p>}
    </fieldset>
    <fieldset><legend>Секции слева направо</legend>{value.plane.sections.map((s, i) => <section className="editor-section" key={s.id}>
      <h3>Секция {i + 1}</h3><Millimeters label={`Ширина секции ${i + 1}, мм`} value={s.widthMm} derived={i === value.plane.sections.length - 1} reject onChange={(width) => onChange(editWindowWidth(value, i, width))} />
      <OpeningFields label={`Секция ${i + 1}`} element={s} value={value} configuration={configuration} mode={'mode' in value.plane ? value.plane.mode : undefined} onChange={(element) => section(i, element)} />
    </section>)}
      {value.windowType === 'balconyBlock' && <section className="editor-section"><h3>Дверь</h3>
        <OpeningFields label="Дверь" element={{ ...value.door, widthMm: value.doorWidthMm }} value={value} configuration={configuration} mode={'mode' in value.plane ? value.plane.mode : undefined} onChange={({ widthMm: _width, ...door }) => onChange({ ...value, door } as WindowMeasurement)} />
      </section>}
    </fieldset>
  </>;
}

function BalconyFields({ value, configuration, onChange }: { value: BalconyMeasurement; configuration: GlazingConfiguration; onChange: (value: BalconyMeasurement) => void }) {
  const [position, setPosition] = useState<Plane['position']>('facade');
  const [geometryError, setGeometryError] = useState('');
  const plane = value.planes.find((p) => p.position === position) ?? value.planes[0]!;
  function updatePlane(next: Plane) { onChange({ ...value, planes: value.planes.map((p) => p.id === plane.id ? next : p) } as BalconyMeasurement); }
  function section(index: number, element: Element) { updatePlane({ ...plane, sections: plane.sections.map((s, i) => i === index ? element : s) } as Plane); }
  return <>
    <fieldset><legend>Конструкция балкона</legend><div className="fields">
      <label>Форма балкона<select aria-label="Форма балкона" value={value.balconyType} onChange={(e) => onChange(changeShape(value, e.target.value as BalconyMeasurement['balconyType'], e.target.value === 'L' ? 'left' : undefined))}>
        <option value="straight">Прямой</option><option value="L">L-образный</option><option value="U">U-образный</option></select></label>
      {value.balconyType === 'L' && <label>Сторона L<select aria-label="Сторона L" value={value.side} onChange={(e) => onChange(changeShape(value, 'L', e.target.value as 'left' | 'right'))}><option value="left">Левая</option><option value="right">Правая</option></select></label>}
    </div><p className="muted">Смена формы сохраняет общие стороны и удаляет отсутствующие.</p></fieldset>
    <fieldset><legend>Плоскости остекления</legend><div className="editor-planes" aria-label="Плоскости">{value.planes.map((p) => <button type="button" key={p.id} aria-pressed={p.id === plane.id} onClick={() => setPosition(p.position)}>{p.name}</button>)}</div>
      <h2>{plane.name}</h2><div className="fields">
        <Millimeters key={`${plane.id}:width`} label="Ширина плоскости, мм" value={plane.widthMm} onChange={(width) => updatePlane(setPlaneWidth(plane, width))} />
        <Millimeters key={`${plane.id}:height`} label="Высота плоскости, мм" value={plane.heightMm} onChange={(heightMm) => updatePlane({ ...plane, heightMm })} />
        <label>Количество секций<select aria-label="Количество секций" value={plane.sectionCount} onChange={(e) => {
          try { updatePlane(setPlaneWidth(plane, plane.widthMm, Number(e.target.value))); setGeometryError(''); }
          catch { setGeometryError('Недостаточная ширина для выбранного количества секций.'); }
        }}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
        {value.material === 'aluminium' && <label>Тип открывания<select aria-label="Тип открывания" value={'mode' in plane ? plane.mode : ''} onChange={(e) => updatePlane(setPlaneMode(plane, e.target.value as 'sliding' | 'swing'))}><option value="sliding">Раздвижное</option><option value="swing">Распашное</option></select><span className="muted">Смена типа делает секции глухими.</span></label>}
      </div>
      {geometryError && <p className="validation" role="alert">{geometryError}</p>}
      <label>Ярусность<select aria-label="Ярусность" value={plane.levels.mode} onChange={(e) => updatePlane({ ...plane, levels: e.target.value === 'oneLevel' ? { mode: 'oneLevel' } : { mode: 'twoLevel', splitHeightMm: NaN, lowerFill: 'glass' } })}><option value="oneLevel">Один ярус</option><option value="twoLevel">Остекление в пол · два яруса</option></select></label>
      {plane.levels.mode === 'twoLevel' && <div className="fields">
        <Millimeters key={`${plane.id}:lower`} label="Высота нижнего яруса от низа, мм" value={plane.levels.splitHeightMm} onChange={(splitHeightMm) => { if (plane.levels.mode === 'twoLevel') updatePlane({ ...plane, levels: { ...plane.levels, splitHeightMm } }); }} />
        <label>Нижнее заполнение<select aria-label="Нижнее заполнение" value={plane.levels.lowerFill} onChange={(e) => { if (plane.levels.mode === 'twoLevel') updatePlane({ ...plane, levels: { ...plane.levels, lowerFill: e.target.value as 'glass' | 'sandwich' } }); }}><option value="glass">Стекло</option><option value="sandwich">Сэндвич</option></select></label>
        <p className="muted">Нижний ярус глухой. Открывания задаются для верхнего яруса.</p>
      </div>}
      {plane.sections.map((s, i) => <section className="editor-section" key={`${plane.id}:${s.id}`}><h3>Секция {i + 1}{plane.levels.mode === 'twoLevel' ? ' · верхний ярус' : ''}</h3>
        <Millimeters label={`Ширина секции ${i + 1}, мм`} value={s.widthMm} derived={i === plane.sections.length - 1} reject onChange={(width) => updatePlane(editPlaneWidth(plane, i, width))} />
        <OpeningFields label={`Секция ${i + 1}`} element={s} value={value} configuration={configuration} mode={'mode' in plane ? plane.mode : undefined} onChange={(element) => section(i, element)} />
      </section>)}
    </fieldset>
  </>;
}
