import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubscriptionCheckout } from '../../application/access/checkout';

export class SupabaseSubscriptionCheckout implements SubscriptionCheckout {
  constructor(private readonly client: SupabaseClient) {}
  async createSubscriptionCheckout() {
    const { data, error } = await this.client.functions.invoke('subscription-checkout', { body: {} });
    if (error || typeof data?.checkoutUrl !== 'string') throw new Error('Не удалось создать оплату. Проверьте подключение и попробуйте снова.');
    const url = new URL(data.checkoutUrl);
    if (url.origin !== 'https://auth.robokassa.ru' || url.pathname !== '/Merchant/Index.aspx'
      || url.username || url.password) throw new Error('Получен некорректный адрес оплаты.');
    return { checkoutUrl: url.href };
  }
}
