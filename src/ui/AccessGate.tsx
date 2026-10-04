import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { expiryWarning, type AccessController } from '../application/access/entitlement';
import { BillingSummary } from './BillingSummary';
import type { SubscriptionCheckout } from '../application/access/checkout';
import { CheckoutReturn, checkoutReturnState } from './CheckoutReturn';

export function AccessGate({ controller, children, checkout, redirect }: {
  controller: AccessController; children: ReactNode;
  checkout?: SubscriptionCheckout; redirect?: (url: string) => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [dismissedDay, setDismissedDay] = useState<number | null>(null);
  const [returnState, setReturnState] = useState(() => checkoutReturnState(window.location.search));
  const returnNotice = returnState && <CheckoutReturn state={returnState} refresh={() => void controller.check()}
    dismiss={() => { window.history.replaceState(null, '', window.location.pathname); setReturnState(null); }} />;
  useEffect(() => {
    void controller.check();
    const tick = window.setInterval(() => controller.tick(), 1000);
    const refresh = window.setInterval(() => { if (navigator.onLine) void controller.check(); }, 60_000);
    const check = () => { controller.tick(); void controller.check(); };
    window.addEventListener('online', check);
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      controller.stop(); window.clearInterval(tick); window.clearInterval(refresh);
      window.removeEventListener('online', check); document.removeEventListener('visibilitychange', visible);
    };
  }, [controller]);
  if (state.status !== 'allowed') return <main className="auth-screen"><h1>Window Estimator</h1>
    {returnNotice}
    {state.status === 'checking' ? <p role="status">Проверка доступа…</p> : <>
      <h2>{state.status === 'device_limit_reached' ? 'Достигнут лимит доверенных устройств'
        : state.status === 'trial_already_used_on_device' ? 'Пробный период уже использовался на этом устройстве'
        : state.status === 'expired' ? 'Срок доступа закончился' : state.status === 'blocked' ? 'Доступ заблокирован' : 'Не удалось проверить доступ'}</h2>
      <p role="alert">{state.status === 'blocked' ? 'Доступ к приложению запрещён.' : state.status === 'expired'
        ? 'Ваши расчёты и настройки сохранены. После восстановления доступа вы сможете продолжить работу.'
        : state.status === 'device_limit_reached' ? 'Для аккаунта разрешены два доверенных устройства. Войдите с ранее зарегистрированного устройства.'
        : state.status === 'trial_already_used_on_device' ? 'Новый автоматический пробный период не предоставлен. Ваши локальные данные сохранены.'
        : 'Подключитесь к интернету и повторите проверку. Offline-доступ возможен только в течение 24 часов после успешной проверки и до окончания срока доступа.'}</p>
      {state.entitlement && <BillingSummary entitlement={state.entitlement} accessStatus={state.status} offline={state.offline ?? false} checkout={checkout} redirect={redirect} />}
      <button onClick={() => void controller.check()}>Проверить доступ снова</button>
    </>}
  </main>;
  const now = state.now!;
  const currentDay = Math.floor(now / 86_400_000);
  const warning = expiryWarning(state.entitlement!.validUntil, now);
  return <>
    {returnNotice}
    <BillingSummary entitlement={state.entitlement!} accessStatus={state.status} offline={state.offline ?? false} checkout={checkout} redirect={redirect} />
    {state.entitlement!.status === 'trial' && <p className="notice" role="status">Пробный доступ на 14 дней, без карты. Доступ до {new Date(state.entitlement!.validUntil!).toLocaleString('ru-RU')}.</p>}
    {warning && dismissedDay !== currentDay && <aside role="alert" className={`access-warning${warning.urgent ? ' urgent' : ''}`}>
      <strong>{warning.urgent ? 'Доступ закончится в течение 24 часов. Сохраните текущую работу.' : `Доступ закончится через ${warning.days} ${warning.days === 5 ? 'дней' : 'дня'}`}</strong>
      <span> Оформление доступно в разделе «Тариф и подписка».</span>
      <button className="secondary" onClick={() => setDismissedDay(currentDay)} aria-label="Скрыть предупреждение до следующей сессии или дня">Скрыть временно</button>
    </aside>}
    {state.offline && <p role="status" className="muted">Offline-доступ: не более 24 часов после последней проверки сервера и до окончания срока доступа.</p>}
    {children}
  </>;
}
