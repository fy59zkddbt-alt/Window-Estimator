import type { BalconyMeasurement } from '../domain/measurements/vnext';
import { GlazingEditor, type GlazingEditorProps } from './GlazingEditor';

export function BalconyScreen(props: Omit<GlazingEditorProps, 'kind' | 'initial' | 'onSave'> & {
  initial?: BalconyMeasurement; onSave: (value: BalconyMeasurement) => Promise<void>;
}) {
  return <GlazingEditor {...props} kind="Balcony" onSave={async (value) => {
    if (value.kind !== 'Balcony') throw new Error('Ожидается балкон.');
    await props.onSave(value);
  }} />;
}
