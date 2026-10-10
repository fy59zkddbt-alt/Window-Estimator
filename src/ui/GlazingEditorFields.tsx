import { createContext, useContext, useEffect, useId, useState } from 'react';
import type { GlazingConfiguration, CommercialRoundingStepRub } from '../domain/configuration/vnext/types';
import { colorChoices, hardwareChoices, openingChoices, setOpening, selectMaterial, selectProfile, readyMeasurement, editorError,
  type Glazing, type Element, type Opening } from '../application/estimate/glazing-editor-v2';
import { estimateDraft } from '../application/estimate/active-calculation';
import type { AluminiumPlaneMode } from '../domain/measurements/vnext';
import { WindowPreview } from './WindowPreview';

export const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);
export const NumericEditing = createContext<(id: string, pending: boolean) => void>(() => {});
export function Millimeters({ label, value, onChange, derived = false, reject = false }: {
  label: string; value: number; onChange?: (value: number) => void; derived?: boolean; reject?: boolean;
}) {
  // Text buffer permits quick replacement on a phone. Committing on blur/Enter
  // makes next-right compensation atomic, instead of applying each typed digit.
  const [text, setText] = useState<string>();
  const [error, setError] = useState('');
  const pending = useContext(NumericEditing);
  const id = useId();
  useEffect(() => () => pending(id, false), [id, pending]);
  function commit() {
    if (text === undefined) return;
    try {
      const next = text.trim() === '' ? NaN : Number(text);
      if (!Number.isNaN(next) && (!Number.isSafeInteger(next) || next <= 0)) throw new Error();
      onChange?.(next); setError('');
    } catch { setError(reject ? 'Ширина недопустима: справа должна остаться положительная секция.' : 'Введите положительное целое число миллиметров.'); }
    setText(undefined); pending(id, false);
  }
  return <label>{label}{derived && <span className="muted">Автоматически</span>}
    <input aria-label={label} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" readOnly={derived}
      value={text ?? (Number.isFinite(value) ? String(value) : '')} aria-invalid={!!error}
      onChange={(e) => { setText(e.target.value); setError(''); pending(id, true); }} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
    {error && <span className="field-error" role="alert">{error}</span>}
  </label>;
}
export function Identity({ value, onChange }: { value: Glazing; onChange: (value: Glazing) => void }) {
  return <fieldset><legend>Помещение и название</legend><div className="fields">
    <label>Помещение <span className="muted">Необязательно</span><input placeholder="Кухня, спальня…" value={value.room} onChange={(e) => onChange({ ...value, room: e.target.value })} /></label>
    <label>Название <span className="muted">Необязательно</span><input placeholder={value.kind === 'Balcony' ? 'Остекление балкона' : 'Окно 1'} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></label>
  </div></fieldset>;
}
const openingLabels = { fixed: 'Глухая', turn: 'Поворотная', tilt_turn: 'Поворотно-откидная', sliding: 'Раздвижная' };
export function OpeningFields({ label, element, value, configuration, mode, onChange }: {
  label: string; element: Element; value: Glazing; configuration: GlazingConfiguration; mode?: AluminiumPlaneMode | undefined; onChange: (element: Element) => void;
}) {
  const hardware = hardwareChoices(configuration, value.profileId).filter((h) => h.status === 'active' || h.id === element.hardwareId);
  return <div className="fields section-row">
    <label>{label}: открывание<select aria-label={`${label}: открывание`} value={element.openingType}
      onChange={(e) => onChange(setOpening(element, e.target.value as Opening, value, configuration, mode))}>
      {openingChoices(value.material, mode).map((opening) => <option key={opening} value={opening}>{openingLabels[opening]}</option>)}
    </select></label>
    {(element.openingType === 'turn' || element.openingType === 'tilt_turn') && <>
      <label>{label}: петли<select aria-label={`${label}: петли`} value={element.hingeSide} onChange={(e) => onChange({ ...element, hingeSide: e.target.value as 'left' | 'right' })}><option value="left">Слева</option><option value="right">Справа</option></select></label>
      {value.material === 'pvc' && <label>{label}: фурнитура<select aria-label={`${label}: фурнитура`} value={element.hardwareId} onChange={(e) => onChange({ ...element, hardwareId: e.target.value })}>
        <option value="">Выберите фурнитуру</option>{hardware.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select>{!hardware.length && <span className="field-error">Для профиля нет доступной фурнитуры.</span>}</label>}
    </>}
  </div>;
}
export function ProductFields({ value, configuration, onChange }: { value: Glazing; configuration: GlazingConfiguration; onChange: (value: Glazing) => void }) {
  const colors = colorChoices(configuration, value.profileId).filter((c) => c.status === 'active' || c.id === value.colorId);
  return <fieldset><legend>Материал и комплектация</legend><div className="fields">
    <label>Материал<select aria-label="Материал" value={value.material} onChange={(e) => onChange(selectMaterial(value, e.target.value as Glazing['material'], configuration))}><option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label>
    <label>{value.material === 'pvc' ? 'Профиль' : 'Алюминиевая система'}<select aria-label={value.material === 'pvc' ? 'Профиль' : 'Алюминиевая система'} value={value.profileId} onChange={(e) => onChange(selectProfile(value, e.target.value, configuration))}>
      <option value="" disabled>Выберите</option>{configuration.profiles.filter((p) => p.material === value.material && (p.status === 'active' || p.id === value.profileId)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <label>Ламинация<select aria-label="Ламинация" value={value.colorId} onChange={(e) => onChange({ ...value, colorId: e.target.value })}>
      <option value="">Выберите</option>{colors.map((c) => <option key={c.id} value={c.id}>{({ none: 'Нет', one_side: 'С одной стороны', two_sides: 'С двух сторон' })[c.lamination]}{colors.filter((other) => other.lamination === c.lamination).length > 1 ? ` · ${c.name}` : ''}</option>)}
    </select></label>
  </div></fieldset>;
}
export function ProductOptions({ value, onChange }: { value: Glazing; onChange: (value: Glazing) => void }) {
  return <><label className="checkbox"><input type="checkbox" checked={value.extensions} onChange={(e) => onChange({ ...value, extensions: e.target.checked })} />Доборы</label>
    <label className="checkbox"><input type="checkbox" checked={value.connectors} onChange={(e) => onChange({ ...value, connectors: e.target.checked })} />Соединители</label></>;
}
export function useGlazingResult(value: Glazing, configuration: GlazingConfiguration, step: CommercialRoundingStepRub) {
  try {
    const measurement = readyMeasurement(value);
    const result = estimateDraft(measurement, { kind: measurement.kind, configuration }, step);
    if (result.kind === 'WindowFinish') throw new Error();
    return { measurement, result, error: '' };
  } catch (reason) { return { measurement: undefined, result: undefined, error: editorError(reason) }; }
}
export function Scheme({ result }: { result: ReturnType<typeof useGlazingResult>['result'] }) {
  if (!result) return <p className="muted">Эскиз появится после заполнения размеров и комплектации.</p>;
  const geometry = result.result.geometry;
  return 'planes' in geometry ? <>{geometry.planes.map((p) => <section key={p.id}><h3>{p.name}</h3><WindowPreview geometry={p} label={p.name} /></section>)}</> : <WindowPreview geometry={geometry} />;
}
export function LiveResult({ result, error }: Pick<ReturnType<typeof useGlazingResult>, 'result' | 'error'>) {
  return <section aria-label="Текущая цена" aria-live="polite"><h2>Текущая цена</h2>{result ? <dl>
    <div><dt>Изделие</dt><dd>{money(result.result.price.productPriceMinor)}</dd></div>
    <div><dt>Монтаж</dt><dd>{money(result.result.price.installationPriceMinor)}</dd></div>
    {result.additionalWorksTotalMinor > 0 && <div><dt>Дополнительные работы</dt><dd>{money(result.additionalWorksTotalMinor)}</dd></div>}
    <div className="editor-total"><dt>Итого</dt><dd>{money(result.measurementTotalMinor!)}</dd></div>
  </dl> : <p className="validation" role="alert">{error}</p>}</section>;
}
