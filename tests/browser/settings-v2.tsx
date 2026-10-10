// Dev-only UI verification fixture. No production storage or auth is accessed.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { createStarterCalculatorSettings } from '../../src/domain/configuration/vnext/settings';
import { SettingsV2Form } from '../../src/ui/SettingsV2Form';
import '../../src/ui/styles.css';
function Fixture() {
  const [saved, setSaved] = useState('Нет сохранений');
  return <><output aria-label="Сохранённое подтверждение">{saved}</output><SettingsV2Form initial={createStarterCalculatorSettings()}
    onClose={() => {}} onSave={async (value) => setSaved(`pricesConfirmed=${value.pricesConfirmed}`)} /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
