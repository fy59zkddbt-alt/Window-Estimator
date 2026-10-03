import { useEffect, useState } from 'react';
import type { Calculation } from '../domain/calculation';
import type { MeasurementEstimate } from '../domain/measurement-estimate';
import { type CalculationRepository, isWindowEstimate, isFinishEstimate, isBalconyEstimate } from '../application/estimate/calculation-repository';
import { createCalculation, copyMeasurement, deleteMeasurement, estimateCalculation, saveMeasurement, updateCalculationDetails, updateOrderAdditionalWorks } from '../application/estimate/calculation-service';
import { WindowScreen } from './WindowScreen';
import { FinishScreen } from './FinishScreen';
import { BalconyScreen } from './BalconyScreen';
import './styles.css';
import { AdditionalWorksList, OrderWorksEditor } from './AdditionalWorksEditor';
import { DiscountEditor } from './DiscountEditor';
import { updateCalculationDiscount, confirmFixedFinalPrice, resetCalculationDiscount } from '../application/estimate/calculation-service';
import { createSettingsSnapshot, type CalculatorSettings, type CalculatorSettingsRepository } from '../application/settings/calculator-settings';
import { SettingsScreen } from './SettingsScreen';
import type { DocumentSettingsRepository } from '../application/settings/document-settings';
import { DocumentSettingsScreen } from './DocumentSettingsScreen';
import { createProposalDocument } from '../application/documents/create-proposal-document';
import { proposalFilename, type ProposalPdfRenderer } from '../application/documents/proposal-pdf';
import { canShareProposal, downloadProposal } from './proposal-file';

type Editor = { id: string; kind: 'Window' | 'WindowFinish' | 'Balcony'; initial?: MeasurementEstimate; snapshot?: ReturnType<typeof createSettingsSnapshot> };
const now = () => new Date().toISOString();
const money = (minor: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);

export function App({ repository, settingsRepository, documentSettingsRepository, renderProposalPdf }: { repository: CalculationRepository; settingsRepository: CalculatorSettingsRepository; documentSettingsRepository: DocumentSettingsRepository; renderProposalPdf: ProposalPdfRenderer }) {
  const [proposalFile, setProposalFile] = useState<File>();
  const [showDocumentSettings, setShowDocumentSettings] = useState(false);
  const [settings, setSettings] = useState<CalculatorSettings>();
  const [showSettings, setShowSettings] = useState(false);
  const [calculations, setCalculations] = useState<Calculation[]>([]);
  const [current, setCurrent] = useState<Calculation>();
  const [screen, setScreen] = useState<'composition' | 'choose' | 'estimate'>('composition');
  const [editor, setEditor] = useState<Editor>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => { setProposalFile(undefined); }, [current, screen, showDocumentSettings]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await repository.list();
        const activeId = await repository.getActiveId();
        const loadedSettings = await settingsRepository.load();
        await documentSettingsRepository.load();
        if (!cancelled) setSettings(loadedSettings);
        if (!cancelled) { setCalculations(items); setCurrent(items.find((item) => item.id === activeId) ?? items[0]); setReady(true); }
      } catch { if (!cancelled) setError('Не удалось открыть хранилище. Данные не удалены. Перезагрузите страницу после устранения ошибки.'); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [repository, settingsRepository, documentSettingsRepository]);
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
  function openNewEditor(kind: Editor['kind']) {
    if (settings) setEditor({ id: crypto.randomUUID(), kind, snapshot: createSettingsSnapshot(settings) });
  }
  async function generateProposal() {
    if (!current) return;
    setProposalFile(undefined);
    const settings = await documentSettingsRepository.load();
    const document = createProposalDocument(current, estimateCalculation(current), settings, { id: crypto.randomUUID(), generatedAt: now() });
    const blob = await renderProposalPdf(document);
    const file = new File([blob], proposalFilename(document), { type: 'application/pdf' });
    setProposalFile(file); downloadProposal(file);
  }
  if (showDocumentSettings) return <DocumentSettingsScreen repository={documentSettingsRepository} onClose={() => setShowDocumentSettings(false)} />;
  if (showSettings && settings) return <SettingsScreen initial={settings} notice={settingsRepository.notice ?? ''} onReload={async () => {
    const value = await (settingsRepository.reload?.() ?? settingsRepository.load()); setSettings(value); return value;
  }} onClose={() => setShowSettings(false)} onSave={async (value) => {
    await settingsRepository.save(value); setSettings(value);
  }} />;
  if (editor) {
    const initial = editor.initial;
    const snapshot = editor.snapshot ?? createSettingsSnapshot(settings!);
    if (editor.kind === 'Balcony') return <BalconyScreen key={editor.id} id={editor.id} configuration={snapshot.glazing} {...(initial && isBalconyEstimate(initial) ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />;
    return editor.kind === 'Window'
      ? <WindowScreen key={editor.id} id={editor.id} configuration={snapshot.glazing} {...(initial && isWindowEstimate(initial) ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />
      : <FinishScreen key={editor.id} id={editor.id} configuration={snapshot.finish} {...(initial && isFinishEstimate(initial) ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />;
  }
  const estimate = current ? estimateCalculation(current) : undefined;
  return <main>
    <header><p className="eyebrow">ЗАМЕР → РАСЧЁТ → СМЕТА</p><h1>Window Estimator</h1></header>
    <fieldset disabled={busy || !ready}>
      <div className="calculation-actions">
        <button onClick={() => setShowSettings(true)}>Настройки калькулятора</button>
        <button onClick={() => setShowDocumentSettings(true)}>Данные для КП</button>
        <button onClick={() => void action(async () => { await persist(createCalculation(crypto.randomUUID(), now())); setScreen('composition'); })}>Новый расчёт</button>
        <label>Сохранённые расчёты<select aria-label="Сохранённые расчёты" value={current?.id ?? ''} onChange={(event) => {
          const id = event.target.value;
          void action(async () => { const loaded = await repository.get(id); if (!loaded) throw new Error('Расчёт не найден.'); await repository.setActiveId(id); setCurrent(loaded); setScreen('composition'); });
        }}><option value="" disabled>Выберите расчёт</option>{calculations.map((item) => <option key={item.id} value={item.id}>{item.clientName || item.objectAddress || 'Расчёт'} · {new Date(item.createdAt).toLocaleString('ru-RU')} · {item.id.slice(0, 8)}</option>)}</select></label>
      </div>
    </fieldset>
    {busy && <p role="status">Сохранение / загрузка…</p>}
    {error && <p role="alert" className="validation">{error}</p>}
    {!current && ready && <p>Создайте расчёт, затем добавьте окно, балкон или отделку окна.</p>}
    {current && estimate && <>
      <CalculationDetails key={`${current.id}:${current.updatedAt}`} calculation={current} busy={busy} onSave={(details) => action(() => persist(updateCalculationDetails(current, details, now())))} />
      {screen === 'choose' ? <section><h2>Добавить замер</h2><div className="calculation-actions">
        <button disabled={busy} onClick={() => openNewEditor('Window')}>Окно</button>
        <button disabled={busy} onClick={() => openNewEditor('Balcony')}>Балкон</button>
        <button disabled={busy} onClick={() => openNewEditor('WindowFinish')}>Отделка окна</button>
        <button disabled={busy} onClick={() => setScreen('composition')}>К составу расчёта</button>
      </div></section> : <>
        <h2>{screen === 'estimate' ? 'Смета' : 'Состав расчёта'}</h2>
        {estimate.lines.length === 0 && <p>В расчёте пока нет замеров.</p>}
        {estimate.lines.map((line) => <article className="measurement-card" key={line.id}>
          <h3>{line.name} · {line.room}</h3><p>{line.description}</p><p>{line.dimensions}</p><strong>{money(line.totalMinor)}</strong>
          <p>Базовая стоимость: {money(line.result.basePriceMinor)}; допработы: {money(line.result.additionalWorksTotalMinor)}.</p>
          <AdditionalWorksList works={line.result.measurement.additionalWorks} />
          {screen === 'composition' && <div className="calculation-actions">
            <button disabled={busy} onClick={() => setEditor({ id: line.id, kind: line.result.measurement.kind, initial: line.result })}>Изменить</button>
            <button disabled={busy} onClick={() => void action(() => persist(copyMeasurement(current, line.id, crypto.randomUUID(), now())))}>Копировать</button>
            <button disabled={busy} onClick={() => void action(() => persist(deleteMeasurement(current, line.id, now())))}>Удалить</button>
          </div>}
        </article>)}
        <OrderWorksEditor key={`works:${current.id}:${current.updatedAt}`} works={current.orderAdditionalWorks} busy={busy} onSave={(works) => action(() => persist(updateOrderAdditionalWorks(current, works, now())))} />
        <AdditionalWorksList works={current.orderAdditionalWorks} />
        <p>Замеры: {money(estimate.measurementsSubtotalMinor)}; работы по заказу: {money(estimate.orderWorksTotalMinor)}.</p>
        <p>Subtotal до скидки: {money(estimate.subtotalMinor)}</p>
        {screen === 'estimate' && <DiscountEditor key={`discount:${current.id}:${current.updatedAt}`} discount={estimate.discount} subtotalMinor={estimate.subtotalMinor} busy={busy}
          onApply={(input) => action(() => persist(updateCalculationDiscount(current, input, now())))}
          onConfirm={() => action(() => persist(confirmFixedFinalPrice(current, now())))}
          onReset={() => action(() => persist(resetCalculationDiscount(current, now())))} />}
        {estimate.finalTotalMinor === null ? <p role="alert" className="validation">Итог не подтверждён. Прежняя фиксированная цена: {money(estimate.fixedFinalPriceMinor!)}. Подтвердите или сбросьте её на экране сметы.</p>
          : <><p>Скидка: {money(estimate.discountAmountMinor!)}</p><p className="total">Итого: {money(estimate.finalTotalMinor)}</p></>}
        <div className="calculation-actions">
          <button disabled={busy} onClick={() => setScreen('choose')}>{estimate.lines.length ? 'Добавить ещё' : 'Добавить замер'}</button>
          {screen === 'composition' ? <button disabled={busy} onClick={() => setScreen('estimate')}>Перейти к смете</button> : <button disabled={busy} onClick={() => setScreen('composition')}>К составу расчёта</button>}
        </div>
        {screen === 'estimate' && <section aria-label="Коммерческое предложение">
          <button disabled={busy || !estimate.isFinalized || !estimate.lines.length} onClick={() => void action(generateProposal)}>Сформировать КП</button>
          {proposalFile && <>
            <p role="status">PDF создан: {proposalFile.name}</p>
            <button disabled={busy} onClick={() => downloadProposal(proposalFile)}>Скачать PDF</button>
            {canShareProposal(proposalFile) && <button disabled={busy} onClick={() => {
              // Invoke share directly from the click to retain browser user activation.
              void navigator.share({ files: [proposalFile], title: 'Коммерческое предложение' }).catch((reason: unknown) => {
                if (!(reason instanceof Error && reason.name === 'AbortError')) setError('Не удалось поделиться PDF. Сохраните файл кнопкой «Скачать PDF».');
              });
            }}>Поделиться</button>}
          </>}
        </section>}
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
