import { useState, type FormEvent } from 'react';
import type { Calculation } from '../domain/calculation';
import { demoConfiguration } from '../domain/configuration/demo-configuration';
import type { ProfileConfiguration, UserConfiguration } from '../domain/configuration/types';
import type { HingeSide, Lamination, Material, OpeningType } from '../domain/measurements/shared';
import { estimateWindow } from '../application/estimate/estimate-window';
import type { CalculationRepository } from '../application/estimate/calculation-repository';
import './styles.css';

const draftId = 'single-window-demo';
const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value);
const rateFields = [
  ['basePricePerM2', 'Базовая цена, ₽/м²'], ['activityPercent', 'Активная створка, %'],
  ['laminateOneSidePercent', 'Ламинация с одной стороны, %'],
  ['laminateTwoSidesPercent', 'Ламинация с двух сторон, %'], ['productMarkupPercent', 'Наценка изделия, %'],
] as const;

export function App({ repository }: { repository: CalculationRepository }) {
  const [room, setRoom] = useState('Кухня');
  const [name, setName] = useState('Окно 1');
  const [widthMm, setWidth] = useState('1000');
  const [heightMm, setHeight] = useState('1500');
  const [material, setMaterial] = useState<Material>('pvc');
  const [openingType, setOpening] = useState<OpeningType>('fixed');
  const [hingeSide, setHinge] = useState<HingeSide>('left');
  const [lamination, setLamination] = useState<Lamination>('none');
  const [configuration, setConfiguration] = useState<UserConfiguration>(demoConfiguration);
  const [profileId, setProfileId] = useState('pvc');
  const [hardwareId, setHardwareId] = useState('pvc-standard');
  const [result, setResult] = useState<Calculation>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const profile = configuration.profiles.find((item) => item.id === profileId)!;

  function invalidate() { setResult(undefined); setMessage(''); }
  function changeMaterial(value: Material) {
    setMaterial(value);
    setProfileId(configuration.profiles.find((item) => item.material === value)!.id);
    setHardwareId(configuration.hardware.find((item) => item.material === value)!.id);
  }
  function changeRate(key: keyof Pick<ProfileConfiguration, typeof rateFields[number][0]>, value: string) {
    setConfiguration({ ...configuration, profiles: configuration.profiles.map((item) => item.id === profileId ? { ...item, [key]: value === '' ? NaN : Number(value) } : item) });
  }
  function calculate(event: FormEvent) {
    event.preventDefault();
    try {
      setResult(estimateWindow({ id: draftId, room, name, widthMm: Number(widthMm), heightMm: Number(heightMm), material, profileId,
        hardwareId: openingType === 'fixed' ? null : hardwareId, lamination,
        ...(openingType === 'fixed' ? { openingType } : { openingType, hingeSide }),
      }, configuration));
      setMessage('');
    } catch (error) { setResult(undefined); setMessage(error instanceof Error ? error.message : 'Ошибка расчёта.'); }
  }
  async function save() {
    if (!result) return;
    setBusy(true);
    try { await repository.save(result); setMessage('Расчёт сохранён в этом браузере. Предыдущий демо-расчёт заменён.'); }
    catch { setMessage('Не удалось сохранить расчёт. Проверьте доступность IndexedDB.'); }
    finally { setBusy(false); }
  }
  async function load() {
    setBusy(true);
    try {
      const saved = await repository.get(draftId);
      if (!saved) { setMessage('Сохранённого расчёта пока нет.'); return; }
      if (saved.schemaVersion !== 1) throw new Error('Unsupported schema');
      const w = saved.measurement;
      const s = w.plane.sections[0];
      const checked = estimateWindow({ id: saved.id, room: w.room, name: w.name, widthMm: s.widthMm, heightMm: s.heightMm,
        material: w.material, profileId: w.profileId, hardwareId: w.hardwareId, lamination: w.lamination,
        ...(s.openingType === 'fixed' ? { openingType: s.openingType } : { openingType: s.openingType, hingeSide: s.hingeSide }),
      }, saved.configuration);
      setRoom(w.room); setName(w.name); setWidth(String(s.widthMm)); setHeight(String(s.heightMm));
      setMaterial(w.material); setProfileId(w.profileId); setOpening(s.openingType); setHinge(s.hingeSide ?? 'left');
      setHardwareId(w.hardwareId ?? saved.configuration.hardware.find((item) => item.material === w.material)?.id ?? '');
      setLamination(w.lamination); setConfiguration(saved.configuration); setResult(checked);
      setMessage('Загружен локальный расчёт с сохранёнными тарифами.');
    } catch { setMessage('Не удалось загрузить расчёт: хранилище недоступно или запись повреждена.'); }
    finally { setBusy(false); }
  }

  return <main>
    <header><p className="eyebrow">ЗАМЕР → РАСЧЁТ → СМЕТА</p><h1>Window Estimator</h1><p>Первый сценарий: одностворчатое окно</p></header>
    <p className="notice">Демонстрационные тарифы. Стоимость только остекления, без монтажа и дополнительных работ.</p>
    <div className="layout"><form onSubmit={calculate} onChange={invalidate}>
      <fieldset disabled={busy}><legend>Параметры окна</legend><div className="fields">
        <label>Помещение<input required value={room} onChange={(e) => setRoom(e.target.value)} /></label>
        <label>Название<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Ширина, мм<input required type="number" min="0.01" step="any" value={widthMm} onChange={(e) => setWidth(e.target.value)} /></label>
        <label>Высота, мм<input required type="number" min="0.01" step="any" value={heightMm} onChange={(e) => setHeight(e.target.value)} /></label>
        <label>Материал<select value={material} onChange={(e) => changeMaterial(e.target.value as Material)}><option value="pvc">ПВХ</option><option value="aluminium">Алюминий</option></select></label>
        <label>Профиль<select value={profileId} onChange={(e) => setProfileId(e.target.value)}>{configuration.profiles.filter((item) => item.material === material).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Открывание<select value={openingType} onChange={(e) => setOpening(e.target.value as OpeningType)}><option value="fixed">Глухое</option><option value="turn">Поворотное</option><option value="tilt_turn">Поворотно-откидное</option></select></label>
        {openingType !== 'fixed' && <><label>Петли<select value={hingeSide} onChange={(e) => setHinge(e.target.value as HingeSide)}><option value="left">Слева</option><option value="right">Справа</option></select></label><label>Фурнитура<select value={hardwareId} onChange={(e) => setHardwareId(e.target.value)}>{configuration.hardware.filter((item) => item.material === material).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
        <label>Ламинация<select value={lamination} onChange={(e) => setLamination(e.target.value as Lamination)}><option value="none">Нет</option><option value="one_side">Одна сторона</option><option value="two_sides">Две стороны</option></select></label>
      </div></fieldset>
      <fieldset disabled={busy}><legend>Тарифы выбранного профиля</legend><div className="fields">{rateFields.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" required value={Number.isNaN(profile[key]) ? '' : profile[key]} onChange={(e) => changeRate(key, e.target.value)} /></label>)}</div></fieldset>
      <button disabled={busy} type="submit">Рассчитать окно</button>
    </form><aside><h2>Результат расчёта</h2>{result ? <>
      <p className="total">{money(result.price.totalMinor / 100)}</p>
      <dl>{[
        ['Общая площадь', `${result.geometry.totalArea.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} м²`],
        ['Активная площадь', `${result.geometry.activeArea.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} м²`],
        ['Базовая стоимость', money(result.price.baseAmount)], ['Активная створка', money(result.price.activityAmount)],
        ['Ламинация', money(result.price.colorAmount)], ['Наценка', money(result.price.markupAmount)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <button disabled={busy} onClick={() => void save()}>Сохранить в браузере</button>
    </> : <p>Введите параметры и нажмите «Рассчитать окно».</p>}
      <button className="secondary" disabled={busy} onClick={() => void load()}>Загрузить сохранённый расчёт</button>
      <p className="muted">Один локальный демо-расчёт. Данные доступны только в этом браузере и могут быть удалены при очистке его хранилища.</p>
      <p role="status" aria-live="polite">{message}</p>
    </aside></div>
  </main>;
}
