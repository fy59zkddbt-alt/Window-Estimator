import type { WindowMeasurement } from '../domain/measurements/vnext';
import { GlazingEditor, type GlazingEditorProps } from './GlazingEditor';

export function WindowScreen(props: Omit<GlazingEditorProps, 'kind' | 'initial' | 'onSave'> & {
  initial?: WindowMeasurement; onSave: (value: WindowMeasurement) => Promise<void>;
}) {
  return <GlazingEditor {...props} kind="Window" onSave={async (value) => {
    if (value.kind !== 'Window') throw new Error('Ожидается окно.');
    await props.onSave(value);
  }} />;
}
