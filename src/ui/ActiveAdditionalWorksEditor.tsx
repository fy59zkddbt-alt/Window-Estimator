import { useState } from 'react';
import type { AdditionalWork, AdditionalWorkCatalogEntry } from '../domain/works/vnext';
import { copyAdditionalWorks, createAdditionalWorkSnapshot } from '../domain/works/vnext';
import { rubInputToMinor } from '../application/settings/settings-v2';
import type { AdditionalWorkLineVNext } from '../application/estimate/estimate-calculation-vnext';
import { WorkLines, workUnits, calculationMoneyInput } from './CalculationSummary';

export function ActiveAdditionalWorksEditor({ works, onChange, disabled = false, title = 'Дополнительные работы', quantities = false }: {
  works: readonly AdditionalWork[]; onChange: (works: AdditionalWork[]) => void; disabled?: boolean; title?: string; quantities?: boolean;
}) {
  function patch(id: string, value: Partial<AdditionalWork>) { onChange(works.map((work) => work.id === id ? { ...work, ...value } : work)); }
  return <fieldset disabled={disabled}><legend>{title}</legend>{works.map((work, index) => <div className="work-row" key={work.id}>
    <label>Название работы {index + 1}<input value={work.name} onChange={(e) => patch(work.id, { name: e.target.value })} /></label>
    <label>Цена за единицу {index + 1}, ₽<input type="number" min="0" step="0.01" value={Number.isSafeInteger(work.unitPriceMinor) ? calculationMoneyInput(work.unitPriceMinor) : ''} onChange={(e) => patch(work.id, { unitPriceMinor: rubInputToMinor(e.target.value) })} /></label>
    {quantities && <>
      <label>Количество {index + 1}<input type="number" inputMode="decimal" min="0" step="any" value={Number.isFinite(work.quantity) ? work.quantity : ''} onChange={(e) => patch(work.id, { quantity: e.target.value.trim() ? Number(e.target.value) : NaN })} /></label>
      <label>Единица {index + 1}<select aria-label={`Единица ${index + 1}`} value={work.unit ?? 'unit'} onChange={(e) => patch(work.id, { unit: e.target.value as NonNullable<AdditionalWork['unit']> })}>{Object.entries(workUnits).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    </>}
    <button type="button" onClick={() => onChange(works.filter((item) => item.id !== work.id))}>Удалить работу {index + 1}</button>
  </div>)}<button type="button" onClick={() => onChange([...works, { id: crypto.randomUUID(), name: '', unitPriceMinor: 0, quantity: 1 }])}>Добавить работу</button></fieldset>;
}
export function ActiveOrderWorksEditor({ works: initial, busy, onSave, catalog = [], preview }: {
  works: readonly AdditionalWork[]; busy: boolean; onSave: (works: readonly AdditionalWork[]) => Promise<void>;
  catalog?: readonly AdditionalWorkCatalogEntry[]; preview: (works: readonly AdditionalWork[]) => readonly AdditionalWorkLineVNext[];
}) {
  const [works, setWorks] = useState(initial);
  const [catalogId, setCatalogId] = useState('');
  let lines: readonly AdditionalWorkLineVNext[] = [];
  let error = '';
  try { copyAdditionalWorks(works); lines = preview(works); } catch { error = 'Укажите название, неотрицательную цену и положительное количество. Проверьте, что сумма не слишком велика.'; }
  return <form onSubmit={(e) => { e.preventDefault(); if (!error) void onSave(works); }}>
    <fieldset disabled={busy}><label>Работа из каталога<select aria-label="Работа из каталога" value={catalogId} onChange={(e) => setCatalogId(e.target.value)}><option value="">Выберите работу</option>{catalog.filter((entry) => entry.status === 'active').map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <button type="button" disabled={!catalogId} onClick={() => { const entry = catalog.find((item) => item.id === catalogId); if (entry) setWorks([...works, createAdditionalWorkSnapshot(entry, crypto.randomUUID(), 1)]); }}>Добавить выбранную работу</button>
    </fieldset>
    <ActiveAdditionalWorksEditor title="Дополнительные работы по заказу" works={works} onChange={setWorks} disabled={busy} quantities />
    {!error && <WorkLines lines={lines} />}
    {error && <p role="alert">{error}</p>}<button disabled={busy || !!error}>Сохранить работы по заказу</button>
    <p className="muted">Изменения применяются после сохранения работ по заказу.</p>
  </form>;
}
export function ActiveAdditionalWorksList({ works }: { works: readonly AdditionalWork[] }) {
  return <ul>{works.map((work) => <li key={work.id}>{work.name}: {work.unitPriceMinor / 100} ₽ × {work.quantity}</li>)}</ul>;
}
