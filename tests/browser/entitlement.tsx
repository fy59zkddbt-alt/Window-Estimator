// Dev-server-only browser fixture; never imported by the production entrypoint.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthController, type AuthProvider } from '../../src/application/auth/auth';
import { AccessController } from '../../src/application/access/entitlement';
import { SupabaseEntitlementProvider } from '../../src/infrastructure/auth/supabase-entitlement-provider';
import { BrowserEntitlementCache } from '../../src/infrastructure/auth/entitlement-cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthGate } from '../../src/ui/AuthGate';
import { AccessGate } from '../../src/ui/AccessGate';
import { App } from '../../src/ui/App';
import { EstimatorDatabase } from '../../src/infrastructure/storage/database';
import { DexieCalculationRepository } from '../../src/infrastructure/storage/dexie-calculation-repository';
import { DexieCalculatorSettingsRepository } from '../../src/infrastructure/storage/dexie-calculator-settings-repository';
import { DexieDocumentSettingsRepository } from '../../src/infrastructure/storage/dexie-document-settings-repository';

const user = { id: 'browser-fixture', email: 'fixture@example.com' };
const auth: AuthProvider = {
  restore: async () => sessionStorage.getItem('fixture-session') ? user : null,
  login: async () => { sessionStorage.setItem('fixture-session', 'yes'); return user; },
  register: async () => ({ needsEmailConfirmation: true }),
  logout: async () => { sessionStorage.removeItem('fixture-session'); }, subscribe: () => () => {},
};
const controller = new AuthController(auth, async () => {});
const client = { rpc: async () => {
  const status = sessionStorage.getItem('fixture-status') ?? 'trial';
  const remaining = status === 'expired' ? -1000 : 3 * 86_400_000;
  return { data: { user_id: user.id, status, server_now: new Date().toISOString(), valid_until: new Date(Date.now() + remaining).toISOString() }, error: null, status: 200 };
} } as unknown as SupabaseClient;
const access = new AccessController(user.id, new SupabaseEntitlementProvider(client, () => true),
  new BrowserEntitlementCache(localStorage), { wallNow: () => Date.now(), monotonicNow: () => performance.now() });
const db = new EstimatorDatabase('entitlement-browser-fixture');
const props = { repository: new DexieCalculationRepository(db, user.id), settingsRepository: new DexieCalculatorSettingsRepository(db, user.id),
  documentSettingsRepository: new DexieDocumentSettingsRepository(db, user.id), renderProposalPdf: async () => new Blob() };
createRoot(document.getElementById('root')!).render(<StrictMode>
  <p>Тестовый сервер доступа:</p>{['trial', 'expired', 'blocked', 'active'].map((status) => <button key={status} onClick={() => {
    sessionStorage.setItem('fixture-status', status); void access.check();
  }}>{status}</button>)}
  <AuthGate controller={controller}>{() => <AccessGate controller={access}><App {...props} /></AccessGate>}</AuthGate>
</StrictMode>);
