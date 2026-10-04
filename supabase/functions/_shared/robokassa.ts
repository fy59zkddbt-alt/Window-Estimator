import { createHash } from 'node:crypto';
import type { PaymentProvider } from '../../../src/application/access/payment-provider.ts';

export interface RobokassaConfig { merchantLogin: string; password1: string; isTest: boolean }
/** Server adapter; return URLs are fixed GET URLs in merchant technical settings.
 * MD5 must be selected there. No passwords or card data leave this module.
 */
export class RobokassaProvider implements PaymentProvider {
  constructor(private readonly config: RobokassaConfig) {
    if (!config.merchantLogin.trim() || !config.password1) throw new Error('Robokassa not configured');
    // Production is intentionally unavailable until verified ResultURL lifecycle.
    if (!config.isTest) throw new Error('Only test-mode checkout is enabled in this foundation');
  }
  async createCheckout(input: Parameters<PaymentProvider['createCheckout']>[0]) {
    if (!/^[1-9]\d*$/.test(input.providerPaymentReference)
      || Number(input.providerPaymentReference) > 2147483647
      || !/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)
      || input.plan.currency !== 'RUB' || !Number.isSafeInteger(input.plan.priceMinor) || input.plan.priceMinor <= 0)
      throw new Error('Invalid checkout');
    const outSum = (input.plan.priceMinor / 100).toFixed(2);
    const signature = createHash('md5').update(
      `${this.config.merchantLogin}:${outSum}:${input.providerPaymentReference}:${this.config.password1}:Shp_attempt=${input.idempotencyKey}`,
      'utf8').digest('hex');
    const url = new URL('https://auth.robokassa.ru/Merchant/Index.aspx');
    url.search = new URLSearchParams({ MerchantLogin: this.config.merchantLogin, OutSum: outSum,
      InvId: input.providerPaymentReference, SignatureValue: signature, Shp_attempt: input.idempotencyKey,
      Description: 'Window Estimator — подписка на месяц', Culture: 'ru', Recurring: 'true', IsTest: '1' }).toString();
    return { checkoutUrl: url.href };
  }
  async cancelAtPeriodEnd(): Promise<void> { throw new Error('Provider cancellation is not implemented'); }
  async resumeSubscription(): Promise<void> { throw new Error('Provider resume is not implemented'); }
}
