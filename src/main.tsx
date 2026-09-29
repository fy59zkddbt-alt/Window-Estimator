import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EstimatorDatabase } from './infrastructure/storage/database';
import { DexieCalculationRepository } from './infrastructure/storage/dexie-calculation-repository';
import { App } from './ui/App';
import { DexieCalculatorSettingsRepository } from './infrastructure/storage/dexie-calculator-settings-repository';

// Composition root: the only place wiring UI to a concrete storage adapter.
const database = new EstimatorDatabase();
const repository = new DexieCalculationRepository(database);
const settingsRepository = new DexieCalculatorSettingsRepository(database);
createRoot(document.getElementById('root')!).render(<StrictMode><App repository={repository} settingsRepository={settingsRepository} /></StrictMode>);
