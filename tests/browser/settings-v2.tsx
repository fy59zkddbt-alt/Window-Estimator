// Dev-only UI verification fixture. No production storage or auth is accessed.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { createStarterCalculatorSettings } from '../../src/domain/configuration/vnext/settings';
import { SettingsV2Form } from '../../src/ui/SettingsV2Form';
import { duplicateProfile } from '../../src/application/settings/settings-v2';
import '../../src/ui/styles.css';
function Fixture() {
  const [saved, setSaved] = useState('Нет сохранений');
  const [initial] = useState(() => new URLSearchParams(location.search).has('calibration')
    ? duplicateProfile(createStarterCalculatorSettings(), 'pvc', 'second-profile') : createStarterCalculatorSettings());
  return <><output aria-label="Сохранённое подтверждение">{saved}</output><SettingsV2Form initial={initial}
    onClose={() => {}} onSave={async (value) => {
      setSaved(`pricesConfirmed=${value.pricesConfirmed}`);
      document.getElementById('saved-settings')!.textContent = JSON.stringify(value);
    }} /><output id="saved-settings" hidden /></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
