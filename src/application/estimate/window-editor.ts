// UI entry points: no geometry or pricing implementation leaks into React.
import type { UserConfiguration } from '../../domain/configuration/types';
import type { Section } from '../../domain/measurements/shared';
import type { DoorPosition, WindowType } from '../../domain/measurements/window/types';
import { createEqualSections, getSectionCount, type WindowInput, type RectangularWindowInput, type BalconyBlockInput } from '../../domain/measurements/window/create-window';
import { estimateWindow } from './estimate-window';

export { createEqualSections, distributeSectionWidths, toWindowInput } from '../../domain/measurements/window/create-window';
export type { WindowInput } from '../../domain/measurements/window/create-window';

/** Incomplete editor state is never persisted as a valid domain measurement. NaN means an empty dimension. */
export type BlockDraft = Omit<BalconyBlockInput, 'doorPosition'> & { doorPosition: DoorPosition | '' };
export type WindowDraft = RectangularWindowInput | BlockDraft;
export interface WindowEditorState {
  input: WindowDraft;
  retainedSecond: Section | null;
  rectangular: RectangularWindowInput | null;
  block: BlockDraft | null;
}

export function createEditorState(input: WindowInput): WindowEditorState {
  return { input, retainedSecond: null, rectangular: null, block: null };
}

export function estimateDraft(input: WindowDraft, configuration: UserConfiguration) {
  if (input.windowType === 'balconyBlock') {
    if (input.doorPosition === '') throw new Error('Выберите положение двери.');
    return estimateWindow({ ...input, doorPosition: input.doorPosition }, configuration);
  }
  return estimateWindow(input, configuration);
}

export function changeBlockWindowCount(state: WindowEditorState, count: 1 | 2): WindowEditorState {
  const input = state.input;
  if (input.windowType !== 'balconyBlock') throw new Error('Количество окон задаётся только для балконного блока.');
  if (count !== 1 && count !== 2) throw new Error('Допустимо 1 или 2 окна.');
  if (input.sections.length === count) return state;
  if (count === 1) return { ...state, retainedSecond: input.sections[1] ?? null, input: { ...input, sections: [input.sections[0]!] } };
  let newId = 'block-window-2';
  while ([...input.sections.map((section) => section.id), input.door.id].includes(newId)) newId += '-new';
  const second = state.retainedSecond ?? { id: newId, widthMm: NaN, openingType: 'fixed' as const };
  return { ...state, input: { ...input, sections: [input.sections[0]!, second] } };
}

export function changeWindowType(state: WindowEditorState, windowType: WindowType): WindowEditorState {
  const current = state.input;
  if (current.windowType === windowType) return state;
  const { id, room, name, material, profileId, lamination } = current;
  const common = { id, room, name, material, profileId, lamination };
  if (windowType === 'balconyBlock') {
    if (current.windowType === 'balconyBlock') return state;
    const input: BlockDraft = state.block ? { ...state.block, ...common } : {
      ...common, windowType, doorPosition: '', doorWidthMm: NaN, doorHeightMm: NaN, windowHeightMm: NaN,
      door: { id: 'block-door', openingType: 'fixed' }, sections: [{ id: 'block-window-1', widthMm: NaN, openingType: 'fixed' }],
    };
    return { ...state, rectangular: current, input };
  }
  const previous = current.windowType === 'balconyBlock' ? state.rectangular : current;
  let input: RectangularWindowInput;
  if (previous?.windowType === windowType) input = { ...previous, ...common };
  else if (previous) input = { ...previous, ...common, windowType, sections: createEqualSections(windowType, previous.widthMm) };
  else input = { ...common, windowType, widthMm: NaN, heightMm: NaN,
    sections: Array.from({ length: getSectionCount(windowType) }, (_, i) => ({ id: `section-${i + 1}`, widthMm: NaN, openingType: 'fixed' })),
  };
  return { ...state, block: current.windowType === 'balconyBlock' ? current : state.block, input };
}
