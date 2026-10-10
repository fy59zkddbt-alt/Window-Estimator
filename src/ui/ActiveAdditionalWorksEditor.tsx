import { useState } from 'react';
import type { AdditionalWork } from '../domain/works/vnext';
import { copyAdditionalWorks } from '../domain/works/vnext';
import { rubInputToMinor } from '../application/settings/settings-v2';

export function ActiveAdditionalWorksEditor({ works, onChange, disabled = false, title = 'Дополнительные работы' }: {
  works: readonly AdditionalWork[]; onChange: (works: AdditionalWork[]) => void; disabled?: boolean; title?: string;
}) {
  function patch(id: string, value: Partial<AdditionalWork>) { onChange(works.map((work) => work.id === id ? { ...work, ...value } : work)); }
  return <fieldset disabled={disabled}><legend>{title}</legend>{works.map((work, index) => <div className="work-row" key={work.id}>
    <label>Название работы {index + 1}<input value={work.name} onChange={(e) => patch(work.id, { name: e.target.value })} /></label>
    <label>Цена за единицу {index + 1}, ₽<input type="number" min="0" step="0.01" value={Number.isFinite(work.unitPriceMinor) ? work.unitPriceMinor / 100 : ''} onChange={(e) => patch(work.id, { unitPriceMinor: rubInputToMinor(e.target.value) })} /></label>
    <button type="button" onClick={() => onChange(works.filter((item) => item.id !== work.id))}>Удалить работу {index + 1}</button>
  </div>)}<button type="button" onClick={() => onChange([...works, { id: crypto.randomUUID(), name: '', unitPriceMinor: 0, quantity: 1 }])}>Добавить работу</button></fieldset>;
}
export function ActiveOrderWorksEditor({ works: initial, busy, onSave }: { works: readonly AdditionalWork[]; busy: boolean; onSave: (works: readonly AdditionalWork[]) => Promise<void> }) {
  const [works, setWorks] = useState(initial);
  let error = '';
  try { copyAdditionalWorks(works); } catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте работы.'; }
  return <form onSubmit={(e) => { e.preventDefault(); if (!error) void onSave(works); }}>
    <ActiveAdditionalWorksEditor title="Дополнительные работы по заказу" works={works} onChange={setWorks} disabled={busy} />
    {error && <p role="alert">{error}</p>}<button disabled={busy || !!error}>Сохранить работы по заказу</button>
    <p className="muted">Изменения применяются после сохранения работ по заказу.</p>
  </form>;
}
export function ActiveAdditionalWorksList({ works }: { works: readonly AdditionalWork[] }) {
  return <ul>{works.map((work) => <li key={work.id}>{work.name}: {work.unitPriceMinor / 100} ₽ × {work.quantity}</li>)}</ul>;
}
