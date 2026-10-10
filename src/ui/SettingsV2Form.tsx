import { useId, useState } from 'react';
import type { CalculatorSettings, FinishMaterialConfiguration, ProfileConfiguration } from '../domain/configuration/vnext/types';
import type { AdditionalWorkUnit } from '../domain/works/vnext';
import { duplicateProfile, persistSettingsV2, putWork, removeWork, rubInputToMinor, updateFinishMaterial, updateHardwareActivity, updateInstallation, updateProfile, validateCalculatorSettings } from '../application/settings/settings-v2';
import { glazingExplanation, percentageHint, productMarkupExplanation } from './settings-hints';
import { PriceCalibrationAssistant } from './PriceCalibrationAssistant';

const workLabels = {
  interiorSlopes: 'Внутренние откосы', interiorSlopesAndSill: 'Внутренние откосы и подоконник', sillOnly: 'Только подоконник',
  exteriorSlopes: 'Наружные откосы', exteriorSlopesAndDrip: 'Наружные откосы и отлив', dripOnly: 'Только отлив',
} as const;
const units = { piece: 'шт.', runningMeter: 'пог. м', squareMeter: 'м²', unit: 'ед.' } as const;
const elementLabels = { slope: 'Откосы', sill: 'Подоконник', drip: 'Отлив' } as const;

function NumberField({ label, value, onChange, hint, positive = false, minor = false }: {
  label: string; value: number; onChange: (value: number) => void; hint?: string; positive?: boolean; minor?: boolean;
}) {
  const id = useId();
  const invalid = !Number.isFinite(value) || value < 0 || (positive && value === 0) || (minor && !Number.isSafeInteger(value));
  return <label>{label}<input type="number" inputMode="decimal" step={minor ? '0.01' : 'any'} min={positive ? undefined : 0}
    value={Number.isFinite(value) ? (minor ? value / 100 : value) : ''} aria-label={label} aria-invalid={invalid} aria-describedby={id}
    onChange={(event) => onChange(minor ? rubInputToMinor(event.target.value) : event.target.value.trim() === '' ? NaN : Number(event.target.value))} />
    <span id={id}>{invalid && <span className="field-error">{positive ? 'Введите число больше нуля.' : minor ? 'Введите цену от 0 с точностью до копейки.' : 'Введите конечное число не меньше нуля.'}</span>}
      {hint && <span className="muted">{hint}</span>}</span></label>;
}
function NameField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return <label>{label}<input value={value} required aria-label={label} aria-invalid={!value.trim()} aria-describedby={!value.trim() ? id : undefined} onChange={(e) => onChange(e.target.value)} />
    {!value.trim() && <span id={id} className="field-error">Введите название.</span>}</label>;
}

export function SettingsV2Form({ initial, onSave, onReload, onClose, notice = '' }: {
  initial: CalculatorSettings; onSave: (value: CalculatorSettings) => Promise<void>;
  onReload?: () => Promise<CalculatorSettings>; onClose: () => void; notice?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [calibratingProfile, setCalibratingProfile] = useState<string>();
  let validation = '';
  try { validateCalculatorSettings(draft); } catch (reason) { validation = reason instanceof Error ? reason.message : 'Проверьте настройки.'; }
  function update(next: CalculatorSettings) { setDraft(next); setMessage(''); }
  function profile(next: ProfileConfiguration) { update(updateProfile(draft, next)); }
  function finish(next: FinishMaterialConfiguration) {
    update(updateFinishMaterial(draft, next));
  }
  async function save(confirm: boolean) {
    setBusy(true); setMessage('');
    try {
      const next = await persistSettingsV2(draft, confirm, onSave); setDraft(next);
      setMessage(confirm ? 'Настройки сохранены. Цены отмечены как проверенные.' : 'Настройки сохранены. Подтверждение цен не изменено.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки.'); }
    finally { setBusy(false); }
  }
  function profileCard(item: ProfileConfiguration) {
    const percent = (key: 'extensionPercent' | 'connectorPercent' | 'productMarkupPercent', label: string, hint: string) =>
      <NumberField label={label} value={item[key]} hint={hint} onChange={(value) => profile({ ...item, [key]: value })} />;
    return <article className="measurement-card" key={item.id} aria-label={item.name}>
      <h3>{item.name || 'Новый профиль'}</h3>
      {item.material === 'pvc' && <button type="button" disabled={item.status !== 'active'} onClick={() => setCalibratingProfile(item.id)}>Помочь настроить цены</button>}
      <NameField label={item.material === 'pvc' ? 'Название профиля' : 'Название алюминиевой системы'} value={item.name} onChange={(name) => profile({ ...item, name })} />
      <NumberField label="Базовая стоимость, ₽/м²" value={item.basePricePerM2} onChange={(basePricePerM2) => profile({ ...item, basePricePerM2 })}
        hint="Начальная стоимость изделия до опций и общей наценки. Это ещё не итоговая цена для клиента." />
      {item.material === 'pvc' ? <section aria-label="Фурнитура"><h4>Фурнитура</h4>
        {item.hardwareActivity.map((relation) => <div className="settings-group" key={relation.hardwareId}>
          <strong>{draft.glazing.hardware.find((hardware) => hardware.id === relation.hardwareId)?.name}</strong>
          <NumberField label="Наценка за открывающуюся часть, %" value={relation.activityPercent}
            hint={percentageHint(item.basePricePerM2, relation.activityPercent, true)}
            onChange={(value) => update(updateHardwareActivity(draft, item.id, relation.hardwareId, value))} />
          <button type="button" disabled={item.id === draft.defaults.pvcProfileId && relation.hardwareId === draft.defaults.hardwareId}
            onClick={() => profile({ ...item, hardwareActivity: item.hardwareActivity.filter((r) => r.hardwareId !== relation.hardwareId) })}>Убрать фурнитуру из профиля</button>
        </div>)}
        {draft.glazing.hardware.filter((h) => h.status === 'active' && !item.hardwareActivity.some((r) => r.hardwareId === h.id)).map((h) =>
          <button type="button" key={h.id} onClick={() => update(updateHardwareActivity(draft, item.id, h.id, 0))}>Добавить {h.name} в профиль</button>)}
      </section> : <section aria-label="Механизмы алюминия">
        <NumberField label="Раздвижное открывание, %" value={item.activity.slidingPercent} hint={percentageHint(item.basePricePerM2, item.activity.slidingPercent, true)}
          onChange={(slidingPercent) => profile({ ...item, activity: { ...item.activity, slidingPercent } })} />
        <NumberField label="Распашное открывание, %" value={item.activity.swingPercent} hint={percentageHint(item.basePricePerM2, item.activity.swingPercent, true)}
          onChange={(swingPercent) => profile({ ...item, activity: { ...item.activity, swingPercent } })} />
      </section>}
      <details><summary>Дополнительные параметры</summary>
        <p>Свёрнутые параметры продолжают влиять на стоимость.</p>
        {item.colorRules.map((rule) => <NumberField key={rule.colorId}
          label={`${draft.glazing.colors.find((color) => color.id === rule.colorId)?.name ?? 'Цвет'}, %`} value={rule.colorPercent}
          hint={`${percentageHint(item.basePricePerM2, rule.colorPercent)} Цвет применяется ко всей площади изделия.`}
          onChange={(colorPercent) => profile({ ...item, colorRules: item.colorRules.map((r) => r.colorId === rule.colorId ? { ...r, colorPercent } : r) })} />)}
        {draft.glazing.colors.filter((c) => c.status === 'active' && c.materials.includes(item.material) && !item.colorRules.some((r) => r.colorId === c.id)).map((c) =>
          <button type="button" key={c.id} onClick={() => profile({ ...item, colorRules: [...item.colorRules, { colorId: c.id, colorPercent: 0 }] })}>Добавить цвет: {c.name}</button>)}
        {percent('extensionPercent', 'Доборы / расширители, %', `${percentageHint(item.basePricePerM2, item.extensionPercent)} Применяется при выборе доборов, ко всей площади изделия.`)}
        {percent('connectorPercent', 'Соединители, %', `${percentageHint(item.basePricePerM2, item.connectorPercent)} Применяется при выборе соединителей, ко всей площади изделия.`)}
        {percent('productMarkupPercent', 'Общая наценка изделия, %', productMarkupExplanation)}
        <label>Доступность<select value={item.status} onChange={(e) => profile({ ...item, status: e.target.value as 'active' | 'hidden' })}>
          <option value="active">Доступен</option><option value="hidden">Скрыт для новых замеров</option></select></label>
        {item.status === 'hidden' && [draft.defaults.pvcProfileId, draft.defaults.aluminiumSystemId].includes(item.id) && <p className="field-error">Сначала выберите другой профиль по умолчанию в общих настройках.</p>}
      </details>
    </article>;
  }
  if (calibratingProfile) return <PriceCalibrationAssistant settings={draft} initialProfileId={calibratingProfile}
    onCancel={() => setCalibratingProfile(undefined)} onApply={(next) => {
      update(next); setCalibratingProfile(undefined); setMessage('Результат применён к черновику. Сохраните настройки. Подтверждение цен не изменено.');
    }} />;
  return <main className="settings-v2"><h1>Настройки расчёта</h1>
    <p>Настройте цены один раз и проверяйте их при изменении закупочных условий.</p>
    <p className="notice">Настройки v2 подготовлены для нового расчёта. Текущий калькулятор пока использует прежние тарифы; переход будет отдельным этапом. Снимки сохранённых расчётов не меняются.</p>
    {notice && <p role="alert">{notice}</p>}
    {onReload && <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setMessage('');
      try { setDraft(await onReload()); setReviewing(false); setMessage('Актуальные настройки загружены.'); }
      catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Ошибка загрузки.'); }
      finally { setBusy(false); }
    }}>Загрузить актуальные настройки</button>}
    {draft.example.containsExamplePrices && !draft.pricesConfirmed && <aside className="example-notice" role="note">
      <strong>Используются примерные цены</strong><p>Проверьте цены материалов, изделий, монтажа и работ перед использованием расчётов с клиентами.</p>
      <button type="button" disabled={busy} onClick={() => { setReviewing(true); }}>Проверить цены</button>
      {reviewing && <p>Проверьте все разделы, включая дополнительные параметры. В конце формы нажмите «Цены проверены».</p>}
    </aside>}
    {draft.pricesConfirmed && <p role="status">Цены отмечены как проверенные.</p>}
    <form onSubmit={(e) => { e.preventDefault(); if (!validation) void save(false); }}>
      <fieldset disabled={busy}>
        {(['pvc', 'aluminium'] as const).map((material) => <section key={material} aria-label={material === 'pvc' ? 'Остекление ПВХ' : 'Алюминиевое остекление'}>
          <h2>{material === 'pvc' ? 'Остекление ПВХ' : 'Алюминиевое остекление'}</h2>
          <p>{glazingExplanation}</p>
          {draft.glazing.profiles.filter((p) => p.material === material).map(profileCard)}
          <button type="button" onClick={() => {
            update(duplicateProfile(draft, material, crypto.randomUUID()));
          }}>Добавить {material === 'pvc' ? 'профиль ПВХ' : 'алюминиевую систему'}</button>
          <section className="measurement-card" aria-label={material === 'pvc' ? 'Монтаж ПВХ' : 'Монтаж алюминия'}>
            <h3>{material === 'pvc' ? 'Монтаж ПВХ' : 'Монтаж алюминия'}</h3>
            <NumberField label="Ставка монтажа, ₽/м²" value={draft.glazing.installationRatesPerM2[material]}
              hint="Считается по общей площади. Опции и наценки изделия не меняют стоимость монтажа."
              onChange={(value) => update(updateInstallation(draft, material, value))} />
          </section>
          {material === 'pvc' && <details><summary>Дополнительные параметры — каталог фурнитуры</summary>
            {draft.glazing.hardware.map((hardware) => <NameField key={hardware.id} label="Название фурнитуры" value={hardware.name}
              onChange={(name) => update({ ...draft, glazing: { ...draft.glazing, hardware: draft.glazing.hardware.map((h) => h.id === hardware.id ? { ...h, name } : h) } })} />)}
            <button type="button" onClick={() => update({ ...draft, glazing: { ...draft.glazing, hardware: [...draft.glazing.hardware,
              { id: crypto.randomUUID(), name: 'Новая фурнитура', material: 'pvc', status: 'active' }] } })}>Добавить фурнитуру</button>
          </details>}
        </section>)}
        <section aria-label="Отделка"><h2>Отделка</h2>
          <p>Калькулятор выбирает самую узкую подходящую ширину материала по фактической глубине замера. Припуски не влияют на этот выбор.</p>
          <NumberField label="Наценка отделки, %" value={draft.finish.finishMarkupPercent} hint="Применяется к себестоимости материалов с запасом и оплате монтажника. Так формируется клиентская цена отделки."
            onChange={(finishMarkupPercent) => update({ ...draft, finish: { ...draft.finish, finishMarkupPercent } })} />
          {draft.finish.materials.map((m) => <article key={m.id} className="measurement-card"><h3>{m.name}</h3>
            <NameField label="Название материала" value={m.name} onChange={(name) => finish({ ...m, name })} />
            <label>Вид отделки<select value={`${m.side}:${m.element}`} onChange={(e) => {
              const [side, element] = e.target.value.split(':') as [FinishMaterialConfiguration['side'], FinishMaterialConfiguration['element']];
              finish({ ...m, side, element });
            }}><option value="interior:slope">Внутренние откосы</option><option value="interior:sill">Подоконник</option><option value="exterior:slope">Наружные откосы</option><option value="exterior:drip">Отлив</option></select></label>
            {m.widthVariants.map((variant, index) => <section className="settings-group" key={variant.id} aria-label={`Вариант ширины ${index + 1}`}>
              <h4>Вариант ширины {index + 1}</h4>
              {([['physicalWidthMm', 'Ширина материала, мм'], ['maxUsableActualDepthMm', 'Подходит для глубины до, мм'], ['purchaseCostPerRunningMeter', 'Закупочная цена за пог. м, ₽']] as const).map(([key, label]) =>
                <NumberField key={key} label={label} positive={key !== 'purchaseCostPerRunningMeter'} value={variant[key]}
                  onChange={(value) => finish({ ...m, widthVariants: m.widthVariants.map((v) => v.id === variant.id ? { ...v, [key]: value } : v) })} />)}
              <button type="button" disabled={m.widthVariants.length === 1} onClick={() => finish({ ...m, widthVariants: m.widthVariants.filter((v) => v.id !== variant.id) })}>Удалить вариант ширины</button>
            </section>)}
            <button type="button" onClick={() => finish({ ...m, widthVariants: [...m.widthVariants, { id: crypto.randomUUID(), physicalWidthMm: NaN, maxUsableActualDepthMm: NaN, purchaseCostPerRunningMeter: NaN }] })}>Добавить ширину</button>
            <NumberField label="Оплата монтажнику за установленный пог. м, ₽" value={m.installerRatePerRunningMeter}
              hint="Оплата монтажника входит в себестоимость. Клиентская цена формируется после наценки отделки."
              onChange={(installerRatePerRunningMeter) => finish({ ...m, installerRatePerRunningMeter })} />
            <button type="button" onClick={() => update({ ...draft, finish: { ...draft.finish, materials: draft.finish.materials.filter((item) => item.id !== m.id) } })}>Удалить материал</button>
          </article>)}
          <button type="button" onClick={() => update({ ...draft, finish: { ...draft.finish, materials: [...draft.finish.materials,
            { id: crypto.randomUUID(), name: 'Новый материал', status: 'active', side: 'interior', element: 'slope', installerRatePerRunningMeter: NaN,
              widthVariants: [{ id: crypto.randomUUID(), physicalWidthMm: NaN, maxUsableActualDepthMm: NaN, purchaseCostPerRunningMeter: NaN }] }] } })}>Добавить материал отделки</button>
          <h3>Базовая оплата монтажнику</h3>
          {Object.entries(workLabels).map(([key, label]) => <NumberField key={key} label={`${label}, ₽`} value={draft.finish.baseInstallerPayByWorkType[key as keyof typeof workLabels]}
            onChange={(value) => update({ ...draft, finish: { ...draft.finish, baseInstallerPayByWorkType: { ...draft.finish.baseInstallerPayByWorkType, [key]: value } } })} />)}
          <details><summary>Дополнительные параметры — припуски</summary>
            <p>Припуски меняют закупочное количество, но не установленную длину для оплаты работы. Технологический запас 20% фиксирован правилами расчёта.</p>
            {(['slope', 'sill', 'drip'] as const).map((element) => <section key={element}><h4>{elementLabels[element]}</h4>
              {(['lengthMm', 'depthMm'] as const).map((key) => <NumberField key={key} label={key === 'lengthMm' ? 'Припуск длины, мм' : 'Припуск глубины, мм'} value={draft.finish.allowances[element][key]}
                onChange={(value) => update({ ...draft, finish: { ...draft.finish, allowances: { ...draft.finish.allowances, [element]: { ...draft.finish.allowances[element], [key]: value } } } })} />)}
            </section>)}
          </details>
        </section>
        <section aria-label="Дополнительные работы"><h2>Дополнительные работы</h2>
          <p>Цена работы = цена за единицу × количество. При добавлении в расчёт сохраняется снимок цены. Изменение каталога не меняет ранее добавленные работы.</p>
          {draft.additionalWorks.map((work) => <article className="measurement-card" key={work.id}>
            <NameField label="Название работы" value={work.name} onChange={(name) => update(putWork(draft, { ...work, name }))} />
            <NumberField label="Цена за единицу, ₽" value={work.unitPriceMinor} minor onChange={(unitPriceMinor) => update(putWork(draft, { ...work, unitPriceMinor }))} />
            <label>Единица<select value={work.unit ?? ''} onChange={(e) => update({ ...draft, additionalWorks: draft.additionalWorks.map((w) => {
              if (w.id !== work.id) return w;
              const { unit: _unit, ...rest } = w;
              return e.target.value ? { ...rest, unit: e.target.value as AdditionalWorkUnit } : rest;
            }) })}><option value="">Не указана</option>{Object.entries(units).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <button type="button" onClick={() => update(removeWork(draft, work.id))}>Удалить работу</button>
          </article>)}
          <button type="button" onClick={() => update(putWork(draft, { id: crypto.randomUUID(), name: '', status: 'active', unitPriceMinor: NaN, unit: 'unit' }))}>Добавить работу</button>
        </section>
        <section aria-label="Общие настройки расчёта"><h2>Общие настройки расчёта</h2>
          <label>Округление цены<select value={draft.commercialRoundingStepRub} onChange={(e) => update({ ...draft, commercialRoundingStepRub: Number(e.target.value) as 10 | 50 | 100 })}>
            {[10, 50, 100].map((step) => <option value={step} key={step}>{step} ₽</option>)}</select>
            <span className="muted">Клиентские цены округляются до выбранного шага там, где это предусмотрено расчётом.</span></label>
          <details><summary>Дополнительные параметры — каталог цветов</summary>
            <p>Создайте вариант цвета или ламинации, затем добавьте его в нужные профили и задайте процент отдельно для каждого профиля.</p>
            {draft.glazing.colors.map((color) => <section className="settings-group" key={color.id}>
              <NameField label="Название цвета / ламинации" value={color.name} onChange={(name) => update({ ...draft, glazing: { ...draft.glazing,
                colors: draft.glazing.colors.map((c) => c.id === color.id ? { ...c, name } : c) } })} />
              <label>Ламинация<select value={color.lamination} onChange={(e) => update({ ...draft, glazing: { ...draft.glazing,
                colors: draft.glazing.colors.map((c) => c.id === color.id ? { ...c, lamination: e.target.value as typeof c.lamination } : c) } })}>
                <option value="none">Без ламинации</option><option value="one_side">С одной стороны</option><option value="two_sides">С двух сторон</option>
              </select></label>
              <p className="muted">Материалы: {color.materials.map((m) => m === 'pvc' ? 'ПВХ' : 'алюминий').join(', ')}.</p>
            </section>)}
            {(['pvc', 'aluminium'] as const).map((material) => <button type="button" key={material} onClick={() => update({ ...draft, glazing: { ...draft.glazing,
              colors: [...draft.glazing.colors, { id: crypto.randomUUID(), name: '', status: 'active', materials: [material], lamination: 'none' }] } })}>
              Добавить цвет для {material === 'pvc' ? 'ПВХ' : 'алюминия'}</button>)}
          </details>
          <details><summary>Дополнительные параметры — выбор по умолчанию</summary>
            <label>Материал по умолчанию<select value={draft.defaults.material} onChange={(e) => update({ ...draft, defaults: { ...draft.defaults, material: e.target.value as 'pvc' | 'aluminium' } })}>
              <option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label>
            {(['pvcProfileId', 'aluminiumSystemId', 'hardwareId', 'colorId'] as const).map((key) => {
              const options = key === 'hardwareId' ? draft.glazing.hardware : key === 'colorId' ? draft.glazing.colors.filter((c) => c.materials.includes(draft.defaults.material))
                : draft.glazing.profiles.filter((p) => p.material === (key === 'pvcProfileId' ? 'pvc' : 'aluminium'));
              return <label key={key}>{{ pvcProfileId: 'Профиль ПВХ', aluminiumSystemId: 'Алюминиевая система', hardwareId: 'Фурнитура', colorId: 'Цвет' }[key]}
                <select value={draft.defaults[key]} onChange={(e) => update({ ...draft, defaults: { ...draft.defaults, [key]: e.target.value } })}>
                  {options.map((o) => <option key={o.id} value={o.id} disabled={o.status === 'hidden'}>{o.name}</option>)}
                </select></label>;
            })}
            {validation.startsWith('Default') && <p className="field-error">Выберите доступные профиль, совместимую с ним фурнитуру и цвет. При необходимости добавьте их в профиль выше.</p>}
          </details>
        </section>
      </fieldset>
      {validation && <p className="validation" role="alert">{validation}</p>}
      <div className="calculation-actions">
        <button disabled={busy || !!validation}>Сохранить настройки</button>
        {!draft.pricesConfirmed && <button type="button" disabled={busy || !!validation} onClick={() => void save(true)}>Цены проверены</button>}
        <button type="button" disabled={busy} onClick={onClose}>К расчётам без сохранения</button>
      </div>
      <p role="status">{message}</p>
    </form>
  </main>;
}
