import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { EstimatorDatabase } from './infrastructure/storage/database';
import { DexieCalculationRepository } from './infrastructure/storage/dexie-calculation-repository';
import { App } from './ui/App';
import { DexieCalculatorSettingsRepository } from './infrastructure/storage/dexie-calculator-settings-repository';
import { DexieDocumentSettingsRepository } from './infrastructure/storage/dexie-document-settings-repository';
import { AuthController, type AuthUser } from './application/auth/auth';
import { createSupabaseAuthProvider } from './infrastructure/auth/supabase-auth-provider';
import { claimAnonymousData } from './infrastructure/storage/local-ownership';
import { AuthGate } from './ui/AuthGate';

// Composition root: the only place wiring UI to a concrete storage adapter.
const database = new EstimatorDatabase();
const renderProposalPdf: import('./application/documents/proposal-pdf').ProposalPdfRenderer = async (document) => {
  const renderer = await import('./infrastructure/pdf/render-proposal-pdf');
  return renderer.renderProposalPdf(document);
};
function UserApp({ user }: { user: AuthUser }) {
  const repositories = useMemo(() => ({
    repository: new DexieCalculationRepository(database, user.id),
    settingsRepository: new DexieCalculatorSettingsRepository(database, user.id),
    documentSettingsRepository: new DexieDocumentSettingsRepository(database, user.id),
  }), [user.id]);
  return <App {...repositories} renderProposalPdf={renderProposalPdf} />;
}

function bootstrap() {
  try {
    const provider = createSupabaseAuthProvider(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    const controller = new AuthController(provider, (userId) => claimAnonymousData(database, userId));
    return <AuthGate controller={controller}>{(user) => <UserApp key={user.id} user={user} />}</AuthGate>;
  } catch {
    return <main><h1>Window Estimator</h1><p role="alert">Auth не настроен. Задайте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY, затем перезапустите приложение.</p></main>;
  }
}
createRoot(document.getElementById('root')!).render(<StrictMode>{bootstrap()}</StrictMode>);
