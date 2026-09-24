import { describe, expect, it } from 'vitest';
import { createEditorState, changeWindowType, changeBlockWindowCount, estimateDraft, type WindowEditorState } from '../src/application/estimate/window-editor';
import { blockInput, input, active, fixed, configuration } from './fixtures';

describe('block editor draft preservation', () => {
  it('new block has no inferred dimensions or position', () => {
    const state = changeWindowType(createEditorState(input), 'balconyBlock');
    expect(state.input.windowType).toBe('balconyBlock');
    if (state.input.windowType !== 'balconyBlock') throw new Error('Expected block');
    expect(state.input.doorPosition).toBe('');
    expect(state.input.doorWidthMm).toBeNaN();
    expect(state.input.doorHeightMm).toBeNaN();
    expect(state.input.windowHeightMm).toBeNaN();
    expect(state.input.sections[0]!.widthMm).toBeNaN();
    expect(() => estimateDraft(state.input, configuration)).toThrow();
  });
  it('adding a second window preserves the first and requires its own width', () => {
    const state = changeBlockWindowCount(createEditorState(blockInput), 2);
    expect(state.input.sections[0]).toEqual(blockInput.sections[0]);
    expect(state.input.sections[1]!.widthMm).toBeNaN();
    expect(() => estimateDraft(state.input, configuration)).toThrow();
  });
  it('2 → 1 → 2 restores second width, opening, hinges and hardware without altering other inputs', () => {
    const initial = createEditorState({ ...blockInput, sections: [fixed(500, 'w1'), active(1000, 'w2', 'tilt_turn', 'right')], doorPosition: 'right' });
    const reduced = changeBlockWindowCount(initial, 1);
    expect(reduced.input.sections).toHaveLength(1);
    const restored = changeBlockWindowCount(reduced, 2);
    expect(restored.input).toEqual(initial.input);
    expect(initial.input.sections).toHaveLength(2);
  });
  it('middle is not silently changed when reducing to one window', () => {
    const initial = createEditorState({ ...blockInput, sections: [fixed(500, 'w1'), active(1000, 'w2')], doorPosition: 'middle' });
    const reduced = changeBlockWindowCount(initial, 1);
    expect(reduced.input).toHaveProperty('doorPosition', 'middle');
    expect(() => estimateDraft(reduced.input, configuration)).toThrow('При одном окне');
    expect(changeBlockWindowCount(reduced, 2).input).toEqual(initial.input);
  });
  it('moving the door retains both window identities and all entered values', () => {
    const initial = { ...blockInput, sections: [active(500, 'w1'), active(1000, 'w2', 'tilt_turn', 'right')] };
    for (const doorPosition of ['left', 'middle', 'right'] as const) {
      const result = estimateDraft({ ...initial, doorPosition }, configuration);
      expect(result.measurement.plane.sections).toEqual(initial.sections);
      expect(result.measurement).toMatchObject({ door: initial.door, doorWidthMm: 700, doorHeightMm: 2200, windowHeightMm: 1500 });
    }
  });
  it('switching between a rectangular window and block retains their separate dimensions and openings', () => {
    const initial = createEditorState({ ...input, sections: [active(1000)] });
    const blockState: WindowEditorState = { ...changeWindowType(initial, 'balconyBlock'), input: { ...blockInput, id: input.id, room: input.room, name: input.name } };
    const rectangular = changeWindowType(blockState, 'single');
    expect(rectangular.input).toEqual(initial.input);
    expect(changeWindowType(rectangular, 'balconyBlock').input).toEqual(blockState.input);
  });
  it('new second section never collides with an existing id loaded from storage', () => {
    const state = changeBlockWindowCount(createEditorState({ ...blockInput, sections: [fixed(1400, 'block-window-2')] }), 2);
    expect(state.input.sections[0]!.id).not.toBe(state.input.sections[1]!.id);
  });
});
