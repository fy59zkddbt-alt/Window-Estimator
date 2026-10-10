import { useEffect, useState } from 'react';
import type { Calculation, MeasurementConfiguration } from '../domain/calculation-vnext';
import type { Measurement } from '../domain/measurements/vnext';
import type { ActiveCalculationRepository as CalculationRepository } from '../application/estimate/active-calculation';
import { createCalculation, measurementSnapshot, copyMeasurement, deleteMeasurement, estimateCalculation, saveMeasurement, updateCalculationDetails, updateOrderAdditionalWorks } from '../application/estimate/active-calculation';
import { WindowScreen } from './WindowScreen';
import { FinishScreen } from './FinishScreen';
import { finishSeedFromBalconyBlock, type FinishSeed } from '../application/estimate/finish-editor-v2';
import { BalconyScreen } from './BalconyScreen';
import './styles.css';
import { ActiveAdditionalWorksList as AdditionalWorksList, ActiveOrderWorksEditor as OrderWorksEditor } from './ActiveAdditionalWorksEditor';
import { DiscountEditor } from './DiscountEditor';
import { updateCalculationDiscount, confirmFixedFinalPrice, resetCalculationDiscount } from '../application/estimate/active-calculation';
import type { CalculatorSettings } from '../domain/configuration/vnext/types';
import type { ActiveSettingsRepository as CalculatorSettingsRepository } from '../application/settings/active-calculator-settings';
import { SettingsV2Form as SettingsScreen } from './SettingsV2Form';
import type { DocumentSettingsRepository } from '../application/settings/document-settings';
import { DocumentSettingsScreen } from './DocumentSettingsScreen';
import type { ProposalPdfRenderer } from '../application/documents/proposal-pdf';

type Editor = { id: string; kind: 'Window' | 'WindowFinish' | 'Balcony'; initial?: Measurement; finishSeed?: FinishSeed; snapshot: MeasurementConfiguration };
const now = () => new Date().toISOString();
const money = (minor: number | null) => minor === null ? 'Требует уточнения' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(minor / 100);

export function App({ repository, settingsRepository, documentSettingsRepository }: { repository: CalculationRepository; settingsRepository: CalculatorSettingsRepository; documentSettingsRepository: DocumentSettingsRepository; renderProposalPdf: ProposalPdfRenderer }) {
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
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loadedSettings = await settingsRepository.load();
        await documentSettingsRepository.load();
        const items = await repository.list();
        const activeId = await repository.getActiveId();
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
  async function saveEditor(result: Measurement) {
    if (!current || !editor || result.id !== editor.id) throw new Error('Неверный ID замера.');
    await persist(saveMeasurement(current, result, editor.snapshot, now(), editor.initial ? 'edit' : 'add'));
    setEditor(undefined); setScreen('composition');
  }
  function openNewEditor(kind: Editor['kind']) {
    if (!current) return;
    try { setEditor({ id: crypto.randomUUID(), kind, snapshot: measurementSnapshot(current, kind) }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть замер.'); }
  }
  if (showDocumentSettings) return <DocumentSettingsScreen repository={documentSettingsRepository} onClose={() => setShowDocumentSettings(false)} />;
  if (showSettings && settings) return <SettingsScreen initial={settings} notice={settingsRepository.notice ?? ''} onReload={async () => {
    const value = await (settingsRepository.reload?.() ?? settingsRepository.load()); setSettings(value); return value;
  }} onClose={() => setShowSettings(false)} onSave={async (value) => {
    await settingsRepository.save(value); setSettings(value);
  }} />;
  if (editor) {
    const initial = editor.initial;
    const snapshot = editor.snapshot;
    const step = current!.commercialRoundingStepRub;
    if (editor.kind === 'Balcony' && snapshot.kind === 'Balcony') return <BalconyScreen key={editor.id} id={editor.id} step={step} configuration={snapshot.configuration} {...(initial?.kind === 'Balcony' ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />;
    if (editor.kind === 'Window' && snapshot.kind === 'Window') return <WindowScreen key={editor.id} id={editor.id} step={step} configuration={snapshot.configuration} {...(initial?.kind === 'Window' ? { initial } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />;
    if (snapshot.kind === 'WindowFinish') return <FinishScreen key={editor.id} id={editor.id} step={step} configuration={snapshot.configuration} {...(initial?.kind === 'WindowFinish' ? { initial } : {})} {...(editor.finishSeed ? { seed: editor.finishSeed } : {})} onSave={saveEditor} onCancel={() => setEditor(undefined)} />;
  }
  const estimate = current ? estimateCalculation(current) : undefined;
  return <main>
    <header><p className="eyebrow">ЗАМЕР → РАСЧЁТ → СМЕТА</p><h1>Window Estimator</h1></header>
    <fieldset disabled={busy || !ready}>
      <div className="calculation-actions">
        <button onClick={() => setShowSettings(true)}>Настройки калькулятора</button>
        <button onClick={() => setShowDocumentSettings(true)}>Данные для КП</button>
        <button onClick={() => void action(async () => { await persist(createCalculation(crypto.randomUUID(), now(), settings!)); setScreen('composition'); })}>Новый расчёт</button>
        <label>Сохранённые расчёты<select aria-label="Сохранённые расчёты" value={current?.id ?? ''} onChange={(event) => {
          const id = event.target.value;
          void action(async () => { const loaded = await repository.get(id); if (!loaded) throw new Error('Расчёт не найден.'); await repository.setActiveId(id); setCurrent(loaded); setScreen('composition'); });
        }}><option value="" disabled>Выберите расчёт</option>{calculations.map((item) => <option key={item.id} value={item.id}>{item.clientName || item.objectAddress || 'Расчёт'} · {new Date(item.createdAt).toLocaleString('ru-RU')} · {item.id.slice(0, 8)}</option>)}</select></label>
      </div>
    </fieldset>
    {settings && !settings.pricesConfirmed && <p className="notice">Цены не проверены. Проверьте настройки и нажмите «Цены проверены».</p>}
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
        {estimate.measurements.length === 0 && <p>В расчёте пока нет замеров.</p>}
        {estimate.measurements.map((line) => {
          const measurement = line.result.measurement;
          return <article className="measurement-card" key={line.measurementId}>
          <h3>{measurement.name} · {measurement.room}</h3>
          <p>{measurement.kind === 'WindowFinish' ? measurement.selections.map((selection) => selection.element === 'slope' ? 'Откосы' : selection.element === 'sill' ? 'Подоконник' : 'Отлив').join(' + ')
            : measurement.kind === 'Balcony' ? `Балкон ${measurement.balconyType} · ${measurement.material === 'pvc' ? 'ПВХ' : 'Алюминий'}`
              : `${{ single: 'Одностворчатое окно', double: 'Двустворчатое окно', triple: 'Трёхстворчатое окно', balconyBlock: 'Балконный блок' }[measurement.windowType]} · ${measurement.material === 'pvc' ? 'ПВХ' : 'Алюминий'}`}</p>
          <p>{measurement.kind === 'Balcony' ? measurement.planes.map((plane) => `${plane.name}: ${plane.widthMm} × ${plane.heightMm} мм`).join('; ')
            : measurement.kind === 'WindowFinish' ? `${measurement.widthMm} × ${measurement.heightMm} × ${measurement.depthMm} мм`
              : measurement.windowType === 'balconyBlock' ? `Дверь ${measurement.doorWidthMm} × ${measurement.doorHeightMm} мм; окна ${measurement.plane.sections.map((section) => `${section.widthMm} × ${measurement.windowHeightMm}`).join(', ')} мм`
                : `${measurement.widthMm} × ${measurement.heightMm} мм`}</p>
          <strong>{money(line.measurementTotalMinor)}</strong>
          <p>Базовая стоимость: {money(line.basePriceMinor)}; допработы: {money(line.additionalWorksTotalMinor)}.</p>
          <AdditionalWorksList works={line.result.measurement.additionalWorks} />
          {screen === 'composition' && <div className="calculation-actions">
            {measurement.kind === 'Window' && measurement.windowType === 'balconyBlock' && <button disabled={busy} onClick={() => {
              try { setEditor({ id: crypto.randomUUID(), kind: 'WindowFinish', snapshot: measurementSnapshot(current, 'WindowFinish'), finishSeed: finishSeedFromBalconyBlock(measurement) }); }
              catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось открыть отделку.'); }
            }}>Добавить отделку</button>}
            <button disabled={busy} onClick={() => setEditor({ id: line.measurementId, kind: line.kind, initial: line.result.measurement, snapshot: current.configuration[line.measurementId]! })}>Изменить</button>
            <button disabled={busy} onClick={() => void action(() => persist(copyMeasurement(current, line.measurementId, crypto.randomUUID(), now())))}>Копировать</button>
            <button disabled={busy} onClick={() => void action(() => persist(deleteMeasurement(current, line.measurementId, now())))}>Удалить</button>
          </div>}
        </article>; })}
        <OrderWorksEditor key={`works:${current.id}:${current.updatedAt}`} works={current.orderAdditionalWorks} busy={busy} onSave={(works) => action(() => persist(updateOrderAdditionalWorks(current, works, now())))} />
        <AdditionalWorksList works={current.orderAdditionalWorks} />
        <p>Замеры: {money(estimate.measurementsSubtotalMinor)}; работы по заказу: {money(estimate.orderWorksTotalMinor)}.</p>
        <p>Subtotal до скидки: {money(estimate.subtotalMinor)}</p>
        {screen === 'estimate' && estimate.subtotalMinor !== null && <DiscountEditor key={`discount:${current.id}:${current.updatedAt}`} discount={estimate.discount} subtotalMinor={estimate.subtotalMinor} busy={busy}
          previewDiscount={(input) => estimateCalculation(updateCalculationDiscount(current, input, current.updatedAt))}
          onApply={(input) => action(() => persist(updateCalculationDiscount(current, input, now())))}
          onConfirm={() => action(() => persist(confirmFixedFinalPrice(current, now())))}
          onReset={() => action(() => persist(resetCalculationDiscount(current, now())))} />}
        {estimate.finalTotalMinor === null ? <p role="alert" className="validation">{estimate.pricingStatus === 'unresolved' ? 'Цена отделки требует уточнения.' : `Итог не подтверждён. Прежняя фиксированная цена: ${money(estimate.fixedFinalPriceMinor)}. Подтвердите или сбросьте её на экране сметы.`}</p>
          : <><p>Скидка: {money(estimate.discountAmountMinor!)}</p><p className="total">Итого: {money(estimate.finalTotalMinor)}</p></>}
        <div className="calculation-actions">
          <button disabled={busy} onClick={() => setScreen('choose')}>{estimate.measurements.length ? 'Добавить ещё' : 'Добавить замер'}</button>
          {screen === 'composition' ? <button disabled={busy} onClick={() => setScreen('estimate')}>Перейти к смете</button> : <button disabled={busy} onClick={() => setScreen('composition')}>К составу расчёта</button>}
        </div>
        {screen === 'estimate' && <section aria-label="Коммерческое предложение">
          <button disabled>Сформировать КП</button>
          <p className="muted">Формирование КП для нового формата расчёта пока недоступно.</p>
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
