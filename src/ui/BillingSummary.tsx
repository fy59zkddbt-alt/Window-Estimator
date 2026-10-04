import { subscriptionPlan } from '../application/access/billing';
import type { AccessState, Entitlement } from '../application/access/entitlement';
import type { SubscriptionCheckout } from '../application/access/checkout';
import { useRef, useState } from 'react';

const accessLabels = { trial: 'Пробный период', active: 'Активен', expired: 'Истёк', blocked: 'Заблокирован' };
const subscriptionLabels = { active: 'Активна', past_due: 'Проблема оплаты', expired: 'Истекла', canceled: 'Отменена' };
const date = (value: string) => new Date(value).toLocaleString('ru-RU');
export function BillingSummary({ entitlement, accessStatus, offline, checkout, redirect }: {
  entitlement: Entitlement; accessStatus: AccessState['status']; offline?: boolean;
  checkout?: SubscriptionCheckout | undefined; redirect?: ((url: string) => void) | undefined;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const billing = entitlement.billing;
  const s = billing?.subscription;
  const canPurchase = checkout && billing && !offline && s?.status !== 'active' && s?.status !== 'past_due'
    && (accessStatus === 'expired' || (accessStatus === 'allowed' && entitlement.status === 'trial'));
  const purchase = async () => {
    if (inFlight.current || !canPurchase) return;
    inFlight.current = true; setLoading(true); setError('');
    try {
      const result = await checkout.createSubscriptionCheckout();
      if (!redirect) throw new Error('Переход к оплате недоступен.');
      redirect(result.checkoutUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось создать оплату. Попробуйте снова.'); }
    finally { inFlight.current = false; setLoading(false); }
  };
  const accessLabel = accessStatus === 'allowed' ? accessLabels[entitlement.status]
    : accessStatus === 'expired' ? accessLabels.expired : accessStatus === 'blocked' ? accessLabels.blocked
    : accessStatus === 'device_limit_reached' ? 'Лимит устройств'
    : accessStatus === 'trial_already_used_on_device' ? 'Пробный период недоступен'
    : 'Не удалось проверить';
  return <details className="notice">
    <summary>Тариф и подписка</summary>
    <p>Тариф: {new Intl.NumberFormat('ru-RU').format(subscriptionPlan.priceMinor / 100)} ₽/мес. Цена тестовая. Ежемесячное автопродление.</p>
    <p>Статус доступа: {accessLabel}.</p>
    {billing ? <>
      <p>Подписка: {s ? subscriptionLabels[s.status] : 'Не оформлена'}.</p>
      {s?.status === 'active' && <p>Текущий оплаченный период до {date(s.currentPeriodEnd)}.</p>}
      {s?.status === 'active' && s.cancelAtPeriodEnd && <p>Автопродление отключено. {accessStatus === 'allowed' ? 'Доступ сохранится до' : 'Окончание оплаченного периода:'} {date(s.currentPeriodEnd)}.</p>}
      {s?.status === 'past_due' && <p>Не удалось списать оплату. Льготный срок оплаты до {date(s.graceEndsAt!)}.</p>}
      {entitlement.status === 'trial' && billing.trialEndsAt && <p>Пробный период без карты до {date(billing.trialEndsAt)}.</p>}
    </> : <p>Сведения о подписке недоступны. Требуется обновление данных сервера.</p>}
    {offline && <p>Последние полученные сведения сервера; сейчас вы offline.</p>}
    {canPurchase && <button disabled={loading} onClick={() => void purchase()}>
      {loading ? 'Создание оплаты…' : 'Оформить подписку — 1290 ₽/мес'}
    </button>}
    {error && <p role="alert">{error}</p>}
    <p>Управление автопродлением будет доступно позже.</p>
  </details>;
}
