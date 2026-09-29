import { useState } from 'react';
import type { AdditionalWork } from '../domain/works/types';
import { additionalWorksTotal } from '../application/estimate/additional-works';

export function AdditionalWorksEditor({ works, onChange, disabled = false, title = 'Дополнительные работы' }: {
  works: readonly AdditionalWork[]; onChange: (works: AdditionalWork[]) => void; disabled?: boolean; title?: string;
}) {
  return <fieldset disabled={disabled}><legend>{title}</legend>
    {works.map((work, index) => <div className="work-row" key={work.id}>
      <label>Название работы {index + 1}<input value={work.name} onChange={(e) => onChange(works.map((item) => item.id === work.id ? { ...item, name: e.target.value } : item))} /></label>
      <label>Цена работы {index + 1}, ₽<input type="number" min="0" step="0.01" value={Number.isNaN(work.priceMinor) ? '' : work.priceMinor / 100} onChange={(e) => {
        const raw = e.target.value;
        const priceMinor = /^\d+(\.\d{0,2})?$/.test(raw) ? Math.round(Number(raw) * 100) : NaN;
        onChange(works.map((item) => item.id === work.id ? { ...item, priceMinor } : item));
      }} /></label>
      <button type="button" onClick={() => onChange(works.filter((item) => item.id !== work.id))}>Удалить работу {index + 1}</button>
    </div>)}
    <button type="button" onClick={() => onChange([...works, { id: crypto.randomUUID(), name: '', priceMinor: 0 }])}>Добавить работу</button>
  </fieldset>;
}

export function OrderWorksEditor({ works: initial, busy, onSave }: { works: readonly AdditionalWork[]; busy: boolean; onSave: (works: readonly AdditionalWork[]) => Promise<void> }) {
  const [works, setWorks] = useState(initial);
  let error = '';
  try { additionalWorksTotal(works); } catch (reason) { error = reason instanceof Error ? reason.message : 'Проверьте работы.'; }
  return <form onSubmit={(e) => { e.preventDefault(); if (!error) void onSave(works); }}>
    <AdditionalWorksEditor title="Дополнительные работы по заказу" works={works} onChange={setWorks} disabled={busy} />
    {error && <p role="alert" className="validation">{error}</p>}
    <button disabled={busy || !!error}>Сохранить работы по заказу</button>
    <p className="muted">Изменения и удаление применяются после сохранения работ по заказу.</p>
  </form>;
}

export function AdditionalWorksList({ works }: { works: readonly AdditionalWork[] }) {
  return <ul>{works.map((work) => <li key={work.id}>{work.name}: {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(work.priceMinor / 100)}</li>)}</ul>;
}
