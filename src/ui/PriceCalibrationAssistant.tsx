import { useEffect, useRef, useState } from 'react';
import type { CalculatorSettings } from '../domain/configuration/vnext/types';
import { applyCalibration, proposeCalibration, type CalibrationInput, type CalibrationProposal } from '../application/settings/price-calibration';

const number = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 6 });
const quotes = [
  ['base', 'Цена глухого белого изделия, ₽'],
  ['active', 'Цена открывающегося белого изделия, ₽'],
  ['oneSide', 'Цена глухого изделия с ламинацией с одной стороны, ₽'],
  ['twoSides', 'Цена глухого изделия с ламинацией с двух сторон, ₽'],
  ['extensions', 'Цена глухого белого изделия с доборами, ₽'],
] as const;

export function PriceCalibrationAssistant({ settings, initialProfileId, onApply, onCancel }: {
  settings: CalculatorSettings; initialProfileId: string;
  onApply: (next: CalculatorSettings) => void; onCancel: () => void;
}) {
  const [input, setInput] = useState<CalibrationInput>({ profileId: initialProfileId, hardwareId: '', base: '' });
  const [step, setStep] = useState<'target' | 'quotes' | 'review'>('target');
  const [proposal, setProposal] = useState<CalibrationProposal>();
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  const profile = settings.glazing.profiles.find((p) => p.id === input.profileId && p.material === 'pvc');
  const hardware = settings.glazing.hardware.filter((h) => h.status === 'active' && profile?.material === 'pvc'
    && profile.hardwareActivity.some((r) => r.hardwareId === h.id));
  const colors = (lamination: 'one_side' | 'two_sides') => settings.glazing.colors.filter((c) => c.status === 'active'
    && c.materials.includes('pvc') && c.lamination === lamination && profile?.colorRules.some((r) => r.colorId === c.id));
  function change(next: CalibrationInput) { setInput(next); setError(''); setProposal(undefined); }
  function attempt(action: () => void) {
    try { action(); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Проверьте цены.'); }
  }
  return <main className="settings-v2 calibration" aria-label="Помощник настройки цен">
    <h1 tabIndex={-1} ref={heading}>Помочь настроить цены</h1>
    <p>Шаг {step === 'target' ? 1 : step === 'quotes' ? 2 : 3} из 3</p>
    {step === 'target' && <section className="measurement-card">
      <h2>Профиль и фурнитура</h2>
      <label>Профиль ПВХ<select aria-label="Профиль ПВХ" value={input.profileId} onChange={(e) => change({ profileId: e.target.value, hardwareId: '', base: '' })}>
        {settings.glazing.profiles.filter((p) => p.material === 'pvc' && p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label>Фурнитура<select aria-label="Фурнитура" value={input.hardwareId} onChange={(e) => change({ ...input, hardwareId: e.target.value })}>
        <option value="">Выберите фурнитуру</option>{hardware.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </select></label>
      {!hardware.length && <p role="alert">Сначала добавьте фурнитуру в этот профиль в настройках.</p>}
      <h2>Что понадобится</h2>
      <p>Запросите у производителя стоимость одного и того же одностворчатого изделия ПВХ 1000×1000 мм (1 м²) в нескольких вариантах. Не меняйте профиль, стеклопакет, размеры или другие условия между вариантами. Цены — без монтажа и вашей коммерческой наценки.</p>
      <p>Все варианты должны быть рассчитаны производителем для одного и того же изделия. Меняется только одна опция за раз.</p>
      <button type="button" disabled={!hardware.some((h) => h.id === input.hardwareId)} onClick={() => setStep('quotes')}>Ввести цены</button>
    </section>}
    {step === 'quotes' && <section className="measurement-card">
      <h2>Цены производителя</h2>
      <p>{profile?.name} × {hardware.find((h) => h.id === input.hardwareId)?.name}. Все варианты: 1000×1000 мм.</p>
      <p>Базовое изделие — полностью глухое, белое, без доборов. Открывающееся — полностью активная створка с выбранной фурнитурой (активная площадь 1 м²), без ламинации и доборов. В остальных вариантах изделие остаётся глухим; добавляется только указанная опция.</p>
      <p>Обязательна только базовая цена. Пустые дополнительные цены оставят соответствующие настройки без изменений.</p>
      {quotes.map(([key, label]) => <div key={key}>
        {(key === 'oneSide' || key === 'twoSides') && <label>{key === 'oneSide' ? 'Вариант ламинации с одной стороны' : 'Вариант ламинации с двух сторон'}
          <select aria-label={key === 'oneSide' ? 'Вариант ламинации с одной стороны' : 'Вариант ламинации с двух сторон'} value={(key === 'oneSide' ? input.oneSideColorId : input.twoSidesColorId) ?? ''} onChange={(e) => change({ ...input, [key === 'oneSide' ? 'oneSideColorId' : 'twoSidesColorId']: e.target.value })}>
            <option value="">Выберите вариант для этой цены</option>{colors(key === 'oneSide' ? 'one_side' : 'two_sides').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>}
        <label>{label}{key !== 'base' && <span className="muted">Необязательно</span>}
          <input aria-label={label} type="text" inputMode="decimal" value={input[key] ?? ''} required={key === 'base'} onChange={(e) => change({ ...input, [key]: e.target.value })} />
        </label>
      </div>)}
      <button type="button" onClick={() => attempt(() => { setProposal(proposeCalibration(settings, input)); setStep('review'); })}>Рассчитать настройки</button>
    </section>}
    {step === 'review' && proposal && <section className="measurement-card">
      <h2>Результат настройки</h2>
      <p>Профиль: <strong>{profile?.name}</strong></p><p>Фурнитура: <strong>{hardware.find((h) => h.id === input.hardwareId)?.name}</strong></p>
      <p>Базовая стоимость: <strong>{number(proposal.basePricePerM2)} ₽/м²</strong></p>
      {proposal.activityPercent !== undefined && <><p>Наценка за открывающуюся часть: <strong>+{number(proposal.activityPercent)}%</strong></p>
        <p>Для выбранной фурнитуры производитель добавляет {number(proposal.activityAmountRub!)} ₽ на 1 м² активной площади относительно базовой стоимости. В обычном расчёте эта наценка применяется только к активной площади.</p></>}
      {([
        ['oneSidePercent', 'Ламинация с одной стороны'], ['twoSidesPercent', 'Ламинация с двух сторон'], ['extensionPercent', 'Доборы'],
      ] as const).map(([key, label]) => <p key={key}>{label}: <strong>{proposal[key] === undefined ? 'Без изменений' : `+${number(proposal[key])}%`}</strong></p>)}
      {proposal.oneSidePercent !== undefined && <p>Вариант с одной стороны: {settings.glazing.colors.find((c) => c.id === input.oneSideColorId)?.name}</p>}
      {proposal.twoSidesPercent !== undefined && <p>Вариант с двух сторон: {settings.glazing.colors.find((c) => c.id === input.twoSidesColorId)?.name}</p>}
      {proposal.activityPercent === undefined && <p>Открывающаяся часть: без изменений</p>}
      <p>ЗамерОк рассчитает проценты относительно базовой стоимости. Эти значения затем используются обычным точным расчётом. Проценты сохраняются с точностью до 6 знаков после запятой (половина вверх); коммерческое округление здесь не применяется.</p>
      <p>Общая наценка изделия не рассчитывается по ценам производителя. Она задаётся отдельно в настройках как ваша коммерческая наценка.</p>
      <p>Не изменятся: общая наценка изделия, монтаж, другая фурнитура, другие профили, настройки алюминия, отделка и дополнительные работы.</p>
      <p>Применение изменит только черновик. Затем нажмите «Сохранить настройки». Отметка «Цены проверены» остаётся отдельным действием.</p>
      <button type="button" onClick={() => attempt(() => onApply(applyCalibration(settings, input)))}>Применить к профилю</button>
    </section>}
    {error && <p role="alert" className="validation">{error}</p>}
    <div className="calculation-actions">
      {step !== 'target' && <button type="button" onClick={() => { setError(''); setStep(step === 'review' ? 'quotes' : 'target'); }}>Назад</button>}
      <button type="button" onClick={onCancel}>Отмена</button>
    </div>
  </main>;
}
