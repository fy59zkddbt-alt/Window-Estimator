import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { CheckoutDenied } from '../../../src/application/access/checkout.ts';
import { checkoutHandler } from '../_shared/checkout-handler.ts';
import { RobokassaProvider } from '../_shared/robokassa.ts';

const required = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } });
const appOrigin = new URL(required('CHECKOUT_APP_ORIGIN')).origin;
if (!appOrigin.startsWith('https://') && !appOrigin.startsWith('http://localhost:')) throw new Error('HTTPS origin required');
Deno.serve(checkoutHandler({ appOrigin,
  authenticate: async (token) => {
    const { data, error } = await client.auth.getUser(token);
    return !error && data.user?.email_confirmed_at ? data.user.id : null;
  },
  repository: { prepare: async (userId) => {
    const { data, error } = await client.rpc('prepare_subscription_checkout', { p_user_id: userId });
    if (error) {
      if (error.code === 'P0001') throw new CheckoutDenied('Checkout forbidden');
      throw new Error('Payment attempt unavailable');
    }
    return data;
  } },
  provider: new RobokassaProvider({ merchantLogin: required('ROBOKASSA_MERCHANT_LOGIN'),
    password1: required('ROBOKASSA_PASSWORD_1'), isTest: required('ROBOKASSA_TEST_MODE') === 'true' }),
}));
