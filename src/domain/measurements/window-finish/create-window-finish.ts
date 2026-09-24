import type { FinishDimensions, WindowFinishMeasurement } from './types';

export type WindowFinishInput = Omit<WindowFinishMeasurement, 'kind'>;

export function validateFinishDimensions(dimensions: FinishDimensions): void {
  for (const value of [dimensions.widthMm, dimensions.heightMm, dimensions.depthMm]) {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Ширина, высота и глубина должны быть положительными конечными числами.');
  }
}

export function createWindowFinish(input: WindowFinishInput): WindowFinishMeasurement {
  if (![input.id, input.room, input.name].every((value) => value.trim())) throw new Error('Заполните помещение и название отделки.');
  validateFinishDimensions(input);
  if (input.selections.length < 1 || input.selections.length > 2) throw new Error('Выберите откосы, подоконник или оба варианта.');
  const types = input.selections.map((selection) => selection.finishType);
  if (new Set(types).size !== types.length || types.some((type) => !['slope', 'sill'].includes(type))) throw new Error('Тип отделки не должен повторяться и должен быть slope или sill.');
  if (input.selections.some((selection) => !selection.materialId.trim())) throw new Error('Выберите материал для каждого вида отделки.');
  return { ...input, kind: 'WindowFinish', room: input.room.trim(), name: input.name.trim(), selections: input.selections.map((selection) => ({ ...selection })) };
}
