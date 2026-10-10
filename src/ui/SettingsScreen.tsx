import { useState } from 'react';
import type { CalculatorSettings as LegacySettings } from '../application/settings/calculator-settings';
import { openSettingsV2, stageSettingsV2 } from '../application/settings/settings-v2';
import { SettingsV2Form } from './SettingsV2Form';

/** Existing production route and revision-checked save/reload callbacks. */
export function SettingsScreen({ initial, onSave, onClose, onReload, notice = '' }: {
  notice?: string; onReload?: () => Promise<LegacySettings>;
  initial: LegacySettings; onSave: (settings: LegacySettings) => Promise<void>; onClose: () => void;
}) {
  const [envelope, setEnvelope] = useState(initial);
  return <SettingsV2Form initial={openSettingsV2(initial)} notice={notice} onClose={onClose}
    onSave={async (value) => {
      const next = stageSettingsV2(envelope, value);
      await onSave(next); setEnvelope(next);
    }} {...(onReload ? { onReload: async () => {
      const next = await onReload(); setEnvelope(next); return openSettingsV2(next);
    } } : {})} />;
}
