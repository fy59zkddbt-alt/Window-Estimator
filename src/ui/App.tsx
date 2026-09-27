import { useEffect, useState } from 'react';
import type { Calculation } from '../domain/calculation';
import type { MeasurementEstimate } from '../domain/measurement-estimate';
import { type CalculationRepository, isWindowEstimate } from '../application/estimate/calculation-repository';
import { createCalculation, copyMeasurement, deleteMeasurement, estimateCalculation, saveMeasurement, updateCalculationDetails } from '../application/estimate/calculation-service';
import { WindowScreen } from './WindowScreen';
import { FinishScreen } from './FinishScreen';
import './styles.css';

type Editor = { id: string; kind: 'Window' | 'WindowFinish'; initial?: MeasurementEstimate };
const now = () => new Date().toISOString();
const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);

export function App({ repository }: { repository: CalculationRepository }) {
  const [calculations, setCalculations] = useState<Calculation[]>([]);
  const [current, setCurrent] = useState<Calculation>();
  const [screen, setScreen] = useState<'composition' | 'choose' | 'estimate'>('composition');
  const [editor, setEditor] = useState<Editor>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await repository.list();
        const activeId = await repository.getActiveId();
        if (!cancelled) { setCalculations(items); setCurrent(items.find((item) => item.id === activeId) ?? items[0]); setReady(true); }
      } catch { if (!cancelled) setError('Не удалось открыть хранилище. Данные не удалены. Перезагрузите страницу после устранения ошибки.'); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [repository]);
  async function persist(value: Calculation) {
    await repository.save(value);
    setCurrent(value);
    setCalculations((items) => [value, ...items.filter((item) => item.id !== value.id)]);
  }
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить изменения.'); }
    finally { setBusy(false); }
  }
  async function saveEditor(result: MeasurementEstimate) {
    if (!current || !editor || result.measurement.id !== editor.id) throw new Error('Неверный ID замера.');
    await persist(saveMeasurement(current, result, now(), editor.initial ? 'edit' : 'add'));
    setEditor(undefined); setScreen('composition');
  }
  if (editor) {
    const initial = editor.initial;
    return editor.kind === 'Window'
      ? <WindowScreen key={editor.id} id={editor.id} {...(initial && isWindowEstimate(initial) ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />
      : <FinishScreen key={editor.id} id={editor.id} {...(initial && !isWindowEstimate(initial) ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />;
  }
  const estimate = current ? estimateCalculation(current) : undefined;
  return <main>
    <header><p className="eyebrow">ЗАМЕР → РАСЧЁТ → СМЕТА</p><h1>Window Estimator</h1></header>
    <fieldset disabled={busy || !ready}>
      <div className="calculation-actions">
        <button onClick={() => void action(async () => { await persist(createCalculation(crypto.randomUUID(), now())); setScreen('composition'); })}>Новый расчёт</button>
        <label>Сохранённые расчёты<select aria-label="Сохранённые расчёты" value={current?.id ?? ''} onChange={(event) => {
          const id = event.target.value;
          void action(async () => { const loaded = await repository.get(id); if (!loaded) throw new Error('Расчёт не найден.'); await repository.setActiveId(id); setCurrent(loaded); setScreen('composition'); });
        }}><option value="" disabled>Выберите расчёт</option>{calculations.map((item) => <option key={item.id} value={item.id}>{item.clientName || item.objectAddress || 'Расчёт'} · {new Date(item.createdAt).toLocaleString('ru-RU')} · {item.id.slice(0, 8)}</option>)}</select></label>
      </div>
    </fieldset>
    {busy && <p role="status">Сохранение / загрузка…</p>}
    {error && <p role="alert" className="validation">{error}</p>}
    {!current && ready && <p>Создайте расчёт, затем добавьте окно или отделку окна.</p>}
    {current && estimate && <>
      <CalculationDetails key={`${current.id}:${current.updatedAt}`} calculation={current} busy={busy} onSave={(details) => action(() => persist(updateCalculationDetails(current, details, now())))} />
      {screen === 'choose' ? <section><h2>Добавить замер</h2><div className="calculation-actions">
        <button disabled={busy} onClick={() => setEditor({ id: crypto.randomUUID(), kind: 'Window' })}>Окно</button>
        <button disabled={busy} onClick={() => setEditor({ id: crypto.randomUUID(), kind: 'WindowFinish' })}>Отделка окна</button>
        <button disabled={busy} onClick={() => setScreen('composition')}>К составу расчёта</button>
      </div></section> : <>
        <h2>{screen === 'estimate' ? 'Смета' : 'Состав расчёта'}</h2>
        {estimate.lines.length === 0 && <p>В расчёте пока нет замеров.</p>}
        {estimate.lines.map((line) => <article className="measurement-card" key={line.id}>
          <h3>{line.name} · {line.room}</h3><p>{line.description}</p><p>{line.dimensions}</p><strong>{money(line.totalMinor)}</strong>
          {screen === 'composition' && <div className="calculation-actions">
            <button disabled={busy} onClick={() => setEditor({ id: line.id, kind: line.result.measurement.kind, initial: line.result })}>Изменить</button>
            <button disabled={busy} onClick={() => void action(() => persist(copyMeasurement(current, line.id, crypto.randomUUID(), now())))}>Копировать</button>
            <button disabled={busy} onClick={() => void action(() => persist(deleteMeasurement(current, line.id, now())))}>Удалить</button>
          </div>}
        </article>)}
        <p className="total">Итого: {money(estimate.subtotalMinor)}</p>
        <div className="calculation-actions">
          <button disabled={busy} onClick={() => setScreen('choose')}>{estimate.lines.length ? 'Добавить ещё' : 'Добавить замер'}</button>
          {screen === 'composition' ? <button disabled={busy || !estimate.lines.length} onClick={() => setScreen('estimate')}>Перейти к смете</button> : <button onClick={() => setScreen('composition')}>К составу расчёта</button>}
        </div>
      </>}
      <p className="muted">Замеры сохраняются в браузере после «Сохранить замер». Копирование и удаление сохраняются сразу. Незавершённый ввод в редакторе не сохраняется.</p>
    </>}
  </main>;
}

function CalculationDetails({ calculation, busy, onSave }: { calculation: Calculation; busy: boolean; onSave: (value: Pick<Calculation, 'clientName' | 'clientPhone' | 'objectAddress'>) => Promise<void> }) {
  const [details, setDetails] = useState({ clientName: calculation.clientName ?? '', clientPhone: calculation.clientPhone ?? '', objectAddress: calculation.objectAddress ?? '' });
  return <form onSubmit={(e) => { e.preventDefault(); void onSave(details); }}><fieldset disabled={busy}><legend>Клиент и объект</legend><div className="fields">
    {([['clientName', 'Имя клиента'], ['clientPhone', 'Телефон'], ['objectAddress', 'Адрес объекта']] as const).map(([key, label]) => <label key={key}>{label}<input value={details[key]} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} /></label>)}
  </div></fieldset><button disabled={busy}>Сохранить данные клиента</button></form>;
}
