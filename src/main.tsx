import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { EstimatorDatabase } from './infrastructure/storage/database';
import { DexieCalculationRepository } from './infrastructure/storage/dexie-calculation-repository';
import { App } from './ui/App';
import { DexieCalculatorSettingsRepository } from './infrastructure/storage/dexie-calculator-settings-repository';
import { DexieDocumentSettingsRepository } from './infrastructure/storage/dexie-document-settings-repository';
import { AuthController, type AuthUser } from './application/auth/auth';
import { createSupabaseBrowserClient, SupabaseAuthProvider } from './infrastructure/auth/supabase-auth-provider';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CloudSettingsSync } from './application/settings/cloud-settings';
import { SupabaseSettingsRepository } from './infrastructure/auth/supabase-settings-repository';
import { copyCalculatorSettings } from './domain/configuration/calculator-settings';
import type { CalculatorSettings } from './application/settings/calculator-settings';
import { normalizeDocumentSettings } from './application/settings/document-settings';
import { decodeDocumentSettingsCache } from './application/settings/document-settings-cache';
import { claimAnonymousData } from './infrastructure/storage/local-ownership';
import { AuthGate } from './ui/AuthGate';
import { AccessController } from './application/access/entitlement';
import { SupabaseEntitlementProvider } from './infrastructure/auth/supabase-entitlement-provider';
import { BrowserEntitlementCache } from './infrastructure/auth/entitlement-cache';
import { AccessGate } from './ui/AccessGate';
import { BrowserAuthIdentityCache } from './infrastructure/auth/auth-identity-cache';
import { BrowserDeviceIdentity } from './infrastructure/auth/device-identity';
import { SupabaseSubscriptionCheckout } from './infrastructure/auth/supabase-checkout';
import { authCallbackUrl } from './infrastructure/auth/app-origin';

// Composition root: the only place wiring UI to a concrete storage adapter.
const database = new EstimatorDatabase();
const renderProposalPdf: import('./application/documents/proposal-pdf').ProposalPdfRenderer = async (document) => {
  const renderer = await import('./infrastructure/pdf/render-proposal-pdf');
  return renderer.renderProposalPdf(document);
};
function UserApp({ user, client }: { user: AuthUser; client: SupabaseClient }) {
  const repositories = useMemo(() => {
    const calculatorCache = new DexieCalculatorSettingsRepository(database, user.id);
    const documentCache = new DexieDocumentSettingsRepository(database, user.id);
    const decodeCalculator = (value: unknown) => copyCalculatorSettings(value as CalculatorSettings);
    const calculator = new CloudSettingsSync(user.id, calculatorCache,
      new SupabaseSettingsRepository(client, user.id, 'calculator_settings', decodeCalculator), decodeCalculator, () => navigator.onLine);
    const documents = new CloudSettingsSync(user.id, { load: () => documentCache.load(), save: (value) => documentCache.saveCache(value) },
      new SupabaseSettingsRepository(client, user.id, 'document_settings', decodeDocumentSettingsCache), decodeDocumentSettingsCache, () => navigator.onLine);
    return {
    repository: new DexieCalculationRepository(database, user.id),
    settingsRepository: calculator,
    documentSettingsRepository: {
      load: () => documents.load(), reload: () => documents.reload(),
      save: (value: import('./application/settings/document-settings').DocumentSettings) => documents.save(normalizeDocumentSettings(value)),
      get notice() { return documents.notice; },
    },
  }; }, [user.id, client]);
  return <App {...repositories} renderProposalPdf={renderProposalPdf} />;
}

function UserAccess({ user, client, deviceId }: { user: AuthUser; client: SupabaseClient; deviceId: string }) {
  const access = useMemo(() => new AccessController(user.id,
    new SupabaseEntitlementProvider(client, () => navigator.onLine, () => deviceId),
    new BrowserEntitlementCache(window.localStorage, deviceId),
    { wallNow: () => Date.now(), monotonicNow: () => performance.now() }), [user.id, client, deviceId]);
  const checkout = useMemo(() => new SupabaseSubscriptionCheckout(client), [client]);
  return <AccessGate controller={access} checkout={checkout} redirect={(url) => window.location.assign(url)}><UserApp user={user} client={client} /></AccessGate>;
}

function bootstrap() {
  try {
    const client = createSupabaseBrowserClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    const deviceId = new BrowserDeviceIdentity(window.localStorage).getId();
    const provider = new SupabaseAuthProvider(client, new BrowserAuthIdentityCache(window.localStorage),
      authCallbackUrl(import.meta.env.VITE_APP_ORIGIN, window.location.origin));
    const controller = new AuthController(provider, (userId) => claimAnonymousData(database, userId));
    return <AuthGate controller={controller}>{(user) => <UserAccess key={user.id} user={user} client={client} deviceId={deviceId} />}</AuthGate>;
  } catch {
    return <main><h1>Window Estimator</h1><p role="alert">Auth не настроен. Проверьте VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY и необязательный VITE_APP_ORIGIN, затем перезапустите приложение.</p></main>;
  }
}
createRoot(document.getElementById('root')!).render(<StrictMode>{bootstrap()}</StrictMode>);
