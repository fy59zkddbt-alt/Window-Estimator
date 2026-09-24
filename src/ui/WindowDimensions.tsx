import type { WindowDraft, BlockDraft } from '../application/estimate/window-editor';
import { distributeSectionWidths } from '../application/estimate/window-editor';

const numeric = (value: string) => value === '' ? NaN : Number(value);
export const fieldValue = (value: number) => Number.isNaN(value) ? '' : value;

function Dimension({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label>{label}<input aria-label={label} required type="number" min="0" step="any" value={fieldValue(value)} onChange={(event) => onChange(numeric(event.target.value))} /></label>;
}

export function WindowDimensions({ input, busy, onChange, onCountChange, onError }: {
  input: WindowDraft; busy: boolean; onChange: (input: WindowDraft) => void;
  onCountChange: (count: 1 | 2) => void; onError: (message: string) => void;
}) {
  const sectionWidths = <div className="fields">{input.sections.map((section, index) => <Dimension key={section.id} label={`Ширина секции ${index + 1}, мм`} value={section.widthMm} onChange={(widthMm) => onChange({ ...input, sections: input.sections.map((existing, i) => i === index ? { ...existing, widthMm } : existing) })} />)}</div>;
  if (input.windowType === 'balconyBlock') return <>
    <fieldset disabled={busy}><legend>2. Компоновка балконного блока</legend><div className="fields">
      <label>Количество окон<select aria-label="Количество окон" value={input.sections.length} onChange={(event) => onCountChange(Number(event.target.value) as 1 | 2)}><option value="1">1 окно</option><option value="2">2 окна</option></select></label>
      <label>Положение двери<select aria-label="Положение двери" value={input.doorPosition} onChange={(event) => onChange({ ...input, doorPosition: event.target.value as BlockDraft['doorPosition'] })}><option value="">Выберите положение</option><option value="left">Слева</option><option value="middle" disabled={input.sections.length !== 2}>Посередине — только с двумя окнами</option><option value="right">Справа</option></select></label>
    </div><p className="muted">Параметры окон сохраняются при перемещении двери. Убранное второе окно можно вернуть до перезагрузки страницы. Если выбрано «Посередине», для одного окна явно выберите другую позицию.</p></fieldset>
    <fieldset disabled={busy}><legend>3. Размеры двери</legend><div className="fields">
      <Dimension label="Ширина двери, мм" value={input.doorWidthMm} onChange={(doorWidthMm) => onChange({ ...input, doorWidthMm })} />
      <Dimension label="Высота двери, мм" value={input.doorHeightMm} onChange={(doorHeightMm) => onChange({ ...input, doorHeightMm })} />
    </div></fieldset>
    <fieldset disabled={busy}><legend>4. Размеры окон</legend>
      <Dimension label="Высота окон, мм" value={input.windowHeightMm} onChange={(windowHeightMm) => onChange({ ...input, windowHeightMm })} />
      {sectionWidths}<p className="muted">Окна нумеруются слева направо независимо от двери. Верхние края выровнены. Площадь — сумма двери и окон, без пространства под окнами.</p>
    </fieldset>
  </>;
  return <>
    <fieldset disabled={busy}><legend>2. Общие размеры</legend><div className="fields">
      <Dimension label="Ширина окна, мм" value={input.widthMm} onChange={(widthMm) => onChange({ ...input, widthMm })} />
      <Dimension label="Высота окна, мм" value={input.heightMm} onChange={(heightMm) => onChange({ ...input, heightMm })} />
      <label className="checkbox"><input type="checkbox" checked={input.transom !== undefined} onChange={(event) => {
        if (event.target.checked) onChange({ ...input, transom: { openingType: 'fixed' as const, heightMm: NaN } });
        else { const { transom: _transom, ...rest } = input; onChange(rest); }
      }} />Верхняя глухая фрамуга</label>
      {input.transom && <Dimension label="Высота фрамуги, мм" value={input.transom.heightMm} onChange={(heightMm) => onChange({ ...input, transom: { openingType: 'fixed' as const, heightMm } })} />}
    </div></fieldset>
    <fieldset disabled={busy}><legend>3. Ширины секций слева направо</legend>{sectionWidths}
      <button type="button" className="secondary" onClick={() => {
        try { onChange({ ...input, sections: distributeSectionWidths(input.windowType, input.widthMm, input.sections) }); }
        catch (reason) { onError(reason instanceof Error ? reason.message : 'Проверьте ширину окна.'); }
      }}>Распределить поровну</button>
      <p className="muted">Общая ширина не перераспределяет секции автоматически. Их сумма должна совпадать с шириной окна. Дробные мм сохраняются без округления.</p>
    </fieldset>
  </>;
}
