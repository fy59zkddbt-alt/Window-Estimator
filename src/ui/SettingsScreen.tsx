import { useState } from 'react';
import { createDefaultCalculatorSettings, validateCalculatorSettings, type CalculatorSettings } from '../application/settings/calculator-settings';
import type { FinishMaterialConfiguration } from '../domain/configuration/finish-types';
import { FinishMaterialEditor, FinishNumber } from './FinishMaterialEditor';

const rates = [
  ['basePricePerM2', 'Базовая цена, ₽/м²'], ['activityPercent', 'Активные створки, %'],
  ['laminateOneSidePercent', 'Ламинация / цвет с одной стороны, %'],
  ['laminateTwoSidesPercent', 'Ламинация / цвет с двух сторон, %'],
  ['productMarkupPercent', 'Наценка изделия, %'], ['installationRatePerM2', 'Монтаж, ₽/м²'],
] as const;

export function SettingsScreen({ initial, onSave, onClose }: {
  initial: CalculatorSettings; onSave: (settings: CalculatorSettings) => Promise<void>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  let validation = '';
  try { validateCalculatorSettings(draft); } catch (reason) { validation = reason instanceof Error ? reason.message : 'Проверьте настройки.'; }
  function update(value: CalculatorSettings) { setDraft(value); setMessage(''); }
  function updateFinish(material: FinishMaterialConfiguration) {
    update({ ...draft, finish: { ...draft.finish, materials: draft.finish.materials.map((item) => item.id === material.id ? material : item) } });
  }
  async function save() {
    setBusy(true); setMessage('');
    try { await onSave(draft); setMessage('Настройки сохранены. Они применяются к новым замерам.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки.'); }
    finally { setBusy(false); }
  }
  return <main><h1>Настройки калькулятора</h1>
    <p>Тарифы применяются к новым замерам. Сохранённые замеры и их копии используют собственные снимки тарифов.</p>
    <p className="notice">Начальные значения демонстрационные. Проверьте их перед расчётом для клиента.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!validation) void save(); }}>
      <fieldset disabled={busy}><legend>Остекление</legend>
        <p>Для алюминия цвет учитывается по той же схеме одной / двух сторон. Монтаж включается в стоимость остекления по общей площади, без наценки изделия. Фурнитура не имеет отдельной надбавки.</p>
        {draft.glazing.profiles.map((profile, index) => <section className="measurement-card" key={profile.id} aria-label={`Профиль ${index + 1}`}>
          <h2>{profile.name || 'Новый профиль'}</h2><p className="muted">ID: {profile.id}</p>
          <div className="fields">
            <label>Название профиля<input required value={profile.name} onChange={(event) => update({ ...draft, glazing: { ...draft.glazing, profiles: draft.glazing.profiles.map((item) => item.id === profile.id ? { ...item, name: event.target.value } : item) } })} /></label>
            <label>Материал профиля<select value={profile.material} onChange={(event) => update({ ...draft, glazing: { ...draft.glazing, profiles: draft.glazing.profiles.map((item) => item.id === profile.id ? { ...item, material: event.target.value as 'pvc' | 'aluminium' } : item) } })}><option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label>
            {rates.map(([key, label]) => <FinishNumber key={key} label={label} value={profile[key]} onChange={(value) => update({ ...draft, glazing: { ...draft.glazing, profiles: draft.glazing.profiles.map((item) => item.id === profile.id ? { ...item, [key]: value } : item) } })} />)}
          </div>
          <button type="button" disabled={draft.glazing.profiles.filter((item) => item.material === profile.material).length === 1} onClick={() => update({ ...draft, glazing: { ...draft.glazing, profiles: draft.glazing.profiles.filter((item) => item.id !== profile.id) } })}>Удалить профиль</button>
        </section>)}
        <button type="button" onClick={() => update({ ...draft, glazing: { ...draft.glazing, profiles: [...draft.glazing.profiles, { id: crypto.randomUUID(), name: 'Новый профиль', material: 'pvc', basePricePerM2: 0, activityPercent: 0, laminateOneSidePercent: 0, laminateTwoSidesPercent: 0, productMarkupPercent: 0, installationRatePerM2: 0 }] } })}>Добавить профиль</button>
        <p className="muted">Для каждого материала требуется хотя бы один профиль.</p>
      </fieldset>
      <fieldset disabled={busy}><legend>Отделка окна</legend>
        <p>Simple: продажная база, отдельная наценка равна нулю; себестоимость неизвестна. Advanced: закупочная ставка и наценка материала.</p>
        {(['slope', 'sill'] as const).map((finishType) => <section key={finishType}><h2>{finishType === 'slope' ? 'Откосы' : 'Подоконники'}</h2>
          {draft.finish.materials.filter((item) => item.finishType === finishType).map((material) => <article className="measurement-card" key={material.id}>
            <h3>{material.name || 'Новый материал'}</h3><p className="muted">ID: {material.id}</p>
            <label>Режим цены<select value={material.pricing.mode} onChange={(event) => updateFinish({ ...material, pricing: event.target.value === 'simple'
              ? { mode: 'simple', materialSellingPricePerM: 0, depthCoefficient: 1, workRatePerM: material.pricing.workRatePerM }
              : { mode: 'advanced', materialPurchasePricePerM: 0, materialMarkupPercent: 0, workRatePerM: material.pricing.workRatePerM } })}><option value="simple">Simple — продажная цена</option><option value="advanced">Advanced — закупка и наценка</option></select></label>
            <p className="muted">Смена режима сбрасывает ставки материала и диапазоны глубины. Рабочая ставка и припуски сохраняются.</p>
            <FinishMaterialEditor material={material} onChange={updateFinish} />
            <button type="button" disabled={draft.finish.materials.filter((item) => item.finishType === finishType).length === 1} onClick={() => update({ ...draft, finish: { ...draft.finish, materials: draft.finish.materials.filter((item) => item.id !== material.id) } })}>Удалить материал</button>
          </article>)}
          <button type="button" onClick={() => update({ ...draft, finish: { ...draft.finish, materials: [...draft.finish.materials, { id: crypto.randomUUID(), name: finishType === 'slope' ? 'Новые откосы' : 'Новый подоконник', finishType, sizing: { lengthAllowancePerPieceMm: 0, depthAllowanceMm: 0, purchaseStepMm: 0 }, pricing: { mode: 'simple', materialSellingPricePerM: 0, workRatePerM: 0, depthCoefficient: 1 } }] } })}>Добавить {finishType === 'slope' ? 'откосы' : 'подоконник'}</button>
        </section>)}
      </fieldset>
      {validation && <p role="alert" className="validation">{validation}</p>}
      <div className="calculation-actions">
        <button disabled={busy || !!validation}>Сохранить настройки</button>
        <button type="button" disabled={busy} onClick={() => { update(createDefaultCalculatorSettings()); setMessage('Начальные значения восстановлены в форме. Нажмите «Сохранить настройки», чтобы применить.'); }}>Восстановить defaults</button>
        <button type="button" disabled={busy} onClick={onClose}>К расчётам без сохранения</button>
      </div>
      <p role="status">{message}</p>
    </form>
  </main>;
}
