import { subscriptionPlan } from '../application/access/billing';
import type { AccessState, Entitlement } from '../application/access/entitlement';

const accessLabels = { trial: 'Пробный период', active: 'Активен', expired: 'Истёк', blocked: 'Заблокирован' };
const subscriptionLabels = { active: 'Активна', past_due: 'Проблема оплаты', expired: 'Истекла', canceled: 'Отменена' };
const date = (value: string) => new Date(value).toLocaleString('ru-RU');
export function BillingSummary({ entitlement, accessStatus, offline }: { entitlement: Entitlement; accessStatus: AccessState['status']; offline?: boolean }) {
  const billing = entitlement.billing;
  const s = billing?.subscription;
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
    <p>Оплата и управление подпиской будут доступны позже.</p>
  </details>;
}
