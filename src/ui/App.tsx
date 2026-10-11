import { useEffect, useRef, useState } from 'react';
import type { Calculation, MeasurementConfiguration } from '../domain/calculation-vnext';
import type { Measurement } from '../domain/measurements/vnext';
import type { ActiveCalculationRepository as CalculationRepository } from '../application/estimate/active-calculation';
import { createCalculation, measurementSnapshot, copyMeasurement, deleteMeasurement, estimateCalculation, saveMeasurement, updateCalculationDetails, updateOrderAdditionalWorks,
  updateCalculationDiscount, confirmFixedFinalPrice, resetCalculationDiscount } from '../application/estimate/active-calculation';
import { WindowScreen } from './WindowScreen';
import { FinishScreen } from './FinishScreen';
import { finishSeedFromBalconyBlock, type FinishSeed } from '../application/estimate/finish-editor-v2';
import { BalconyScreen } from './BalconyScreen';
import { ActiveOrderWorksEditor as OrderWorksEditor } from './ActiveAdditionalWorksEditor';
import { CalculationSummary, CalculationTotal, MeasurementCard, WorkLines } from './CalculationSummary';
import { DiscountEditor } from './DiscountEditor';
import type { CalculatorSettings } from '../domain/configuration/vnext/types';
import type { ActiveSettingsRepository as CalculatorSettingsRepository } from '../application/settings/active-calculator-settings';
import { SettingsV2Form as SettingsScreen } from './SettingsV2Form';
import type { DocumentSettingsRepository } from '../application/settings/document-settings';
import { DocumentSettingsScreen } from './DocumentSettingsScreen';
import type { ProposalPdfV2Renderer } from '../application/documents/proposal-pdf-v2';
import { PdfExportAction } from './export/PdfExportAction';
import { buildProposalDocumentV2 } from '../application/documents/build-proposal-document-v2';
import type { ProposalDocumentV2 } from '../domain/documents/proposal-document-v2';
import { ClientView } from './ClientView';
import './styles.css';

type Editor = { id: string; kind: Measurement['kind']; initial?: Measurement; createWindowType?: 'balconyBlock'; finishSeed?: FinishSeed; snapshot: MeasurementConfiguration };
const now = () => new Date().toISOString();

export function App({ repository, settingsRepository, documentSettingsRepository, renderProposalPdf }: { repository: CalculationRepository; settingsRepository: CalculatorSettingsRepository; documentSettingsRepository: DocumentSettingsRepository; renderProposalPdf: ProposalPdfV2Renderer }) {
  const [showDocumentSettings, setShowDocumentSettings] = useState(false);
  const [clientDocument, setClientDocument] = useState<ProposalDocumentV2>();
  const [settings, setSettings] = useState<CalculatorSettings>();
  const [showSettings, setShowSettings] = useState(false);
  const [calculations, setCalculations] = useState<Calculation[]>([]);
  const [current, setCurrent] = useState<Calculation>();
  const [screen, setScreen] = useState<'composition' | 'choose' | 'estimate'>('composition');
  const [editor, setEditor] = useState<Editor>();
  const [removing, setRemoving] = useState<string>();
  const [newDetails, setNewDetails] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus(); }, [screen, editor, current?.id, showSettings, showDocumentSettings, clientDocument]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loadedSettings = await settingsRepository.load();
        await documentSettingsRepository.load();
        const items = await repository.list();
        const activeId = await repository.getActiveId();
        if (!cancelled) { setSettings(loadedSettings); setCalculations(items); setCurrent(items.find((item) => item.id === activeId) ?? items[0]); setReady(true); }
      } catch { if (!cancelled) setError('Не удалось открыть хранилище. Данные не удалены. Попробуйте перезагрузить страницу.'); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [repository, settingsRepository, documentSettingsRepository]);
  async function persist(value: Calculation) {
    try { await repository.save(value); }
    catch { throw new Error('Не удалось сохранить расчёт. Повторите сохранение.'); }
    setCurrent(value);
    setCalculations((items) => [value, ...items.filter((item) => item.id !== value.id)]);
  }
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить изменения.'); }
    finally { setBusy(false); }
  }
  function home() { setEditor(undefined); setRemoving(undefined); setScreen('composition'); }
  async function saveEditor(result: Measurement) {
    if (!current || !editor || result.id !== editor.id) throw new Error('Не удалось определить замер.');
    await persist(saveMeasurement(current, result, editor.snapshot, now(), editor.initial ? 'edit' : 'add'));
    home();
  }
  function openNewEditor(kind: Editor['kind'], createWindowType?: 'balconyBlock') {
    if (!current) return;
    try { setError(''); setEditor({ id: crypto.randomUUID(), kind, snapshot: measurementSnapshot(current, kind), ...(createWindowType ? { createWindowType } : {}) }); }
    catch { setError('Не удалось открыть замер: в расчёте нет снимка настроек.'); }
  }
  if (clientDocument) return <ClientView document={clientDocument} renderPdf={renderProposalPdf} onBack={() => setClientDocument(undefined)} />;
  if (showDocumentSettings) return <DocumentSettingsScreen repository={documentSettingsRepository} onClose={() => setShowDocumentSettings(false)} />;
  if (showSettings && settings) return <SettingsScreen initial={settings} notice={settingsRepository.notice ?? ''} onReload={async () => {
    const value = await (settingsRepository.reload?.() ?? settingsRepository.load()); setSettings(value); return value;
  }} onClose={() => setShowSettings(false)} onSave={async (value) => { await settingsRepository.save(value); setSettings(value); }} />;
  if (editor) {
    const initial = editor.initial; const snapshot = editor.snapshot; const step = current!.commercialRoundingStepRub;
    if (editor.kind === 'Balcony' && snapshot.kind === 'Balcony') return <BalconyScreen key={editor.id} id={editor.id} step={step} configuration={snapshot.configuration} {...(initial?.kind === 'Balcony' ? { initial } : {})} onSave={saveEditor} onCancel={home} />;
    if (editor.kind === 'Window' && snapshot.kind === 'Window') return <WindowScreen key={editor.id} id={editor.id} step={step} configuration={snapshot.configuration} {...(initial?.kind === 'Window' ? { initial } : {})} {...(editor.createWindowType ? { createWindowType: editor.createWindowType } : {})} onSave={saveEditor} onCancel={home} />;
    if (snapshot.kind === 'WindowFinish') return <FinishScreen key={editor.id} id={editor.id} step={step} configuration={snapshot.configuration} {...(initial?.kind === 'WindowFinish' ? { initial } : {})} {...(editor.finishSeed ? { seed: editor.finishSeed } : {})} onSave={saveEditor} onCancel={home} />;
  }
  const totals = current ? estimateCalculation(current) : undefined;
  return <main className="calculation-flow" aria-label={screen === 'estimate' ? 'Смета расчёта' : 'Расчёт'}>
    <header><p className="eyebrow">ЗАМЕРОК · РАСЧЁТ</p><h1 ref={heading} tabIndex={-1}>{screen === 'estimate' ? 'Смета' : screen === 'choose' ? 'Добавить замер' : 'Ваш расчёт'}</h1></header>
    {busy && <p role="status">Сохранение / загрузка…</p>}{error && <p role="alert" className="validation">{error}</p>}
    <fieldset disabled={busy || !ready}>
      {screen === 'composition' && <details className="calculation-menu"><summary>Расчёты и настройки</summary><div className="calculation-actions">
        <button onClick={() => void action(async () => { await persist(createCalculation(crypto.randomUUID(), now(), settings!)); setNewDetails(true); home(); })}>Новый расчёт</button>
        <label>Сохранённые расчёты<select aria-label="Сохранённые расчёты" value={current?.id ?? ''} onChange={(event) => {
          const id = event.target.value;
          void action(async () => { const loaded = await repository.get(id); if (!loaded) throw new Error('Расчёт не найден.'); await repository.setActiveId(id); setCurrent(loaded); setNewDetails(false); home(); });
        }}><option value="" disabled>Выберите расчёт</option>{calculations.map((item) => <option key={item.id} value={item.id}>{item.clientName || item.objectAddress || 'Расчёт'} · {new Date(item.createdAt).toLocaleDateString('ru-RU')} · {item.id.slice(0, 8)}</option>)}</select></label>
        <button className="secondary" onClick={() => setShowSettings(true)}>Настройки калькулятора</button><button className="secondary" onClick={() => setShowDocumentSettings(true)}>Данные для КП</button>
      </div></details>}
      {current?.settingsSnapshot && !current.settingsSnapshot.pricesConfirmed && screen === 'composition' && <p className="notice">В расчёте использованы непроверенные цены. Изменённые настройки применяются к новым расчётам.</p>}
      {!current && ready && <section className="empty-calculation"><h2>Начните новый расчёт</h2><p>Данные клиента, замеры и смета — в одном расчёте.</p>
        <button onClick={() => void action(async () => { await persist(createCalculation(crypto.randomUUID(), now(), settings!)); setNewDetails(true); home(); })}>Создать расчёт</button></section>}
      {current && totals && <>
        {screen === 'choose' ? <section aria-label="Выбор вида замера"><p>Выберите, что нужно рассчитать.</p><div className="calculation-actions">
          <button onClick={() => openNewEditor('Window')}>Окно</button><button onClick={() => openNewEditor('Balcony')}>Балкон</button>
          <button onClick={() => openNewEditor('Window', 'balconyBlock')}>Балконный блок</button><button onClick={() => openNewEditor('WindowFinish')}>Отделка окна</button>
          <button className="secondary" onClick={home}>К составу расчёта</button>
        </div></section> : <>
          <section className="calculation-context" aria-label="Клиент и объект"><p><strong>{current.clientName || 'Клиент не указан'}</strong></p>
            {current.clientPhone && <p>{current.clientPhone}</p>}<p>{current.objectAddress || 'Адрес объекта не указан'}</p></section>
          {screen === 'composition' ? <>
            <CalculationDetails key={current.id} calculation={current} initiallyOpen={newDetails} busy={busy} onSave={(details) => action(async () => { await persist(updateCalculationDetails(current, details, now())); setNewDetails(false); })} />
            <div className="flow-primary"><CalculationTotal totals={totals} /><div className="calculation-actions"><button onClick={() => setScreen('choose')}>Добавить замер</button><button className="secondary" onClick={() => setScreen('estimate')}>Перейти к смете</button></div></div>
            <section aria-label="Замеры расчёта"><h2>Замеры · {totals.measurements.length}</h2>
              {totals.measurements.map((line) => <MeasurementCard key={line.measurementId} line={line}>
                {!!line.additionalWorkLines.length && <p className="muted">Включены работы замера</p>}
                {removing === line.measurementId ? <div role="group" aria-label="Подтверждение удаления"><p>Удалить замер «{line.result.measurement.name}»?</p><p className="muted">Остальные замеры и данные заказа сохранятся.</p>
                  <div className="calculation-actions"><button onClick={() => void action(async () => { await persist(deleteMeasurement(current, line.measurementId, now())); setRemoving(undefined); })}>Да, удалить замер</button><button className="secondary" onClick={() => setRemoving(undefined)}>Оставить замер</button></div>
                </div> : <div className="calculation-actions">
                  <button onClick={() => { setError(''); setEditor({ id: line.measurementId, kind: line.kind, initial: line.result.measurement, snapshot: current.configuration[line.measurementId]! }); }}>Изменить</button>
                  {line.result.measurement.kind === 'Window' && line.result.measurement.windowType === 'balconyBlock' && <button className="secondary" onClick={() => {
                    const measurement = line.result.measurement;
                    if (measurement.kind !== 'Window') return;
                    try { setEditor({ id: crypto.randomUUID(), kind: 'WindowFinish', snapshot: measurementSnapshot(current, 'WindowFinish'), finishSeed: finishSeedFromBalconyBlock(measurement) }); }
                    catch { setError('Не удалось открыть отделку. Проверьте снимок настроек расчёта.'); }
                  }}>Добавить отделку</button>}
                  <button className="secondary" onClick={() => void action(() => persist(copyMeasurement(current, line.measurementId, crypto.randomUUID(), now())))}>Копировать</button>
                  <button className="secondary" onClick={() => setRemoving(line.measurementId)}>Удалить</button>
                </div>}
              </MeasurementCard>)}
            </section>
            <details className="order-works"><summary>Дополнительные работы по заказу</summary><p className="muted">Работы на весь заказ. Работы отдельных замеров редактируются внутри замера.</p>
              <OrderWorksEditor key={`works:${current.id}`} works={current.orderAdditionalWorks} catalog={current.settingsSnapshot?.additionalWorks ?? []} busy={busy}
                preview={(works) => estimateCalculation(updateOrderAdditionalWorks(current, works, current.updatedAt)).orderAdditionalWorkLines}
                onSave={(works) => action(() => persist(updateOrderAdditionalWorks(current, works, now())))} />
            </details>
            {!!totals.orderAdditionalWorkLines.length && <section aria-label="Сохранённые работы заказа"><h3>Работы по заказу</h3><WorkLines lines={totals.orderAdditionalWorkLines} /></section>}
          </> : <>
            <button className="secondary" onClick={home}>К составу расчёта</button><CalculationSummary totals={totals} />
            {!!totals.measurements.length && totals.subtotalMinor !== null && <DiscountEditor key={`discount:${current.id}:${current.updatedAt}`} discount={totals.discount} subtotalMinor={totals.subtotalMinor} busy={busy}
              currentTotals={totals} previewDiscount={(input) => estimateCalculation(updateCalculationDiscount(current, input, current.updatedAt))}
              onApply={(input) => action(() => persist(updateCalculationDiscount(current, input, now())))} onConfirm={() => action(() => persist(confirmFixedFinalPrice(current, now())))} onReset={() => action(() => persist(resetCalculationDiscount(current, now())))} />}
            <button disabled={!totals.measurements.length} onClick={() => void action(async () => {
              const seller = await documentSettingsRepository.load();
              setClientDocument(buildProposalDocumentV2(current, seller));
            })}>Показать клиенту</button>
            <PdfExportAction renderer={renderProposalPdf} disabled={!totals.measurements.length} getDocument={async () =>
              buildProposalDocumentV2(current, await documentSettingsRepository.load())} />
            <div className="calculation-actions"><button onClick={() => setScreen('choose')}>Добавить замер</button><button className="secondary" onClick={home}>К составу расчёта</button></div>
          </>}
          <p className="muted">Замеры сохраняются после «Сохранить замер». Копирование и удаление сохраняются сразу. Незавершённый ввод в редакторе не сохраняется.</p>
        </>}
      </>}
    </fieldset>
  </main>;
}

function CalculationDetails({ calculation, initiallyOpen, busy, onSave }: { calculation: Calculation; initiallyOpen: boolean; busy: boolean; onSave: (value: Pick<Calculation, 'clientName' | 'clientPhone' | 'objectAddress'>) => Promise<void> }) {
  const [details, setDetails] = useState({ clientName: calculation.clientName ?? '', clientPhone: calculation.clientPhone ?? '', objectAddress: calculation.objectAddress ?? '' });
  const changed = details.clientName !== (calculation.clientName ?? '') || details.clientPhone !== (calculation.clientPhone ?? '') || details.objectAddress !== (calculation.objectAddress ?? '');
  return <details className="client-details" open={initiallyOpen || undefined}><summary>Данные клиента и объекта{changed ? ' · не сохранены' : ''}</summary>
    <form onSubmit={(e) => { e.preventDefault(); void onSave(details); }}><fieldset disabled={busy}><legend>Все поля необязательные</legend><div className="fields">
      {([['clientName', 'Имя клиента'], ['clientPhone', 'Телефон'], ['objectAddress', 'Адрес объекта']] as const).map(([key, label]) => <label key={key}>{label}<input type={key === 'clientPhone' ? 'tel' : 'text'} autoComplete={key === 'clientName' ? 'name' : key === 'clientPhone' ? 'tel' : 'street-address'} value={details[key]} onChange={(e) => setDetails({ ...details, [key]: e.target.value })} /></label>)}
    </div></fieldset><button disabled={busy || !changed}>Сохранить данные клиента</button><p className="muted">Данные применяются после сохранения. Можно сразу перейти к замерам.</p></form>
  </details>;
}
