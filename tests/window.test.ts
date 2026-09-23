import { describe, expect, it } from 'vitest';
import { createEqualSections, createWindow, distributeSectionWidths, type WindowInput } from '../src/domain/measurements/window/create-window';
import type { Section } from '../src/domain/measurements/shared';
import { active, fixed, input } from './fixtures';

describe('window invariants', () => {
  it.each([['single', 1], ['double', 2], ['triple', 3]] as const)('creates %s with %s equal unrounded sections', (windowType, count) => {
    const sections = createEqualSections(windowType, 1000);
    expect(sections).toHaveLength(count);
    expect(sections.every((section) => section.widthMm === 1000 / count && section.openingType === 'fixed')).toBe(true);
    expect(() => createWindow({ ...input, windowType, sections })).not.toThrow();
  });
  it('explicit equal distribution preserves openings, hardware and hinge side', () => {
    const sections = [fixed(400), active(600, 's2', 'tilt_turn', 'right')];
    expect(distributeSectionWidths('double', 1400, sections)).toEqual([fixed(700), active(700, 's2', 'tilt_turn', 'right')]);
    expect(sections.map((section) => section.widthMm)).toEqual([400, 600]);
  });
  it.each([999, 1001, 1000.000001])('rejects a section sum of %s without correction', (sum) => {
    const sections = [fixed(400), fixed(sum - 400, 's2')];
    expect(() => createWindow({ ...input, windowType: 'double', sections })).toThrow('Сумма ширин');
    expect(sections[1]!.widthMm).toBe(sum - 400);
  });
  it('rejects changed total width until sections are explicitly edited', () => {
    expect(() => createWindow({ ...input, widthMm: 1200 })).toThrow('Сумма ширин');
    expect(input.sections[0]!.widthMm).toBe(1000);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid dimension %s at every level', (value) => {
    expect(() => createWindow({ ...input, widthMm: value })).toThrow();
    expect(() => createWindow({ ...input, heightMm: value })).toThrow();
    expect(() => createWindow({ ...input, sections: [fixed(value)] })).toThrow();
  });
  it.each([0, -1, 1500, 1501, Infinity, NaN])('rejects transom height %s', (heightMm) => {
    expect(() => createWindow({ ...input, transom: { openingType: 'fixed', heightMm } })).toThrow();
  });
  it('rejects an active transom at the runtime boundary', () => {
    expect(() => createWindow({ ...input, transom: { openingType: 'turn', heightMm: 200 } } as unknown as WindowInput)).toThrow('Фрамуга всегда глухая');
  });
  it('rejects incorrect section count, duplicate ids and unknown type', () => {
    expect(() => createWindow({ ...input, windowType: 'double' })).toThrow('Количество');
    expect(() => createWindow({ ...input, windowType: 'double', sections: [fixed(500), fixed(500)] })).toThrow('уникальными');
    expect(() => createWindow({ ...input, windowType: 'other' } as unknown as WindowInput)).toThrow('тип окна');
  });
  it('requires hinges and hardware for every active section, forbids them for fixed', () => {
    for (const section of [
      { id: 's1', widthMm: 1000, openingType: 'turn', hardwareId: 'hardware' },
      { id: 's1', widthMm: 1000, openingType: 'tilt_turn', hingeSide: 'left' },
      { ...fixed(1000), hingeSide: 'left' }, { ...fixed(1000), hardwareId: 'hardware' },
    ]) expect(() => createWindow({ ...input, sections: [section as Section] })).toThrow();
  });
  it('snapshots mutable section and transom inputs', () => {
    const section = active(1000);
    const transom = { openingType: 'fixed' as const, heightMm: 200 };
    const result = createWindow({ ...input, sections: [section], transom });
    section.widthMm = 2000; transom.heightMm = 800;
    expect(result.plane.sections[0]!.widthMm).toBe(1000);
    expect(result.transom!.heightMm).toBe(200);
  });
});
