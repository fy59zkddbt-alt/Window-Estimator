import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EstimatorDatabase } from './infrastructure/storage/database';
import { DexieCalculationRepository } from './infrastructure/storage/dexie-calculation-repository';
import { App } from './ui/App';

// Composition root: the only place wiring UI to a concrete storage adapter.
const repository = new DexieCalculationRepository(new EstimatorDatabase());
createRoot(document.getElementById('root')!).render(<StrictMode><App repository={repository} /></StrictMode>);
