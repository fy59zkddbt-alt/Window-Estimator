import type { WindowInput } from '../src/domain/measurements/window/create-window';
import type { Section, HingeSide } from '../src/domain/measurements/shared';
import type { ProfileConfiguration, UserConfiguration } from '../src/domain/configuration/types';

export const profile: ProfileConfiguration = { id: 'pvc', name: 'Test', material: 'pvc', basePricePerM2: 10000, activityPercent: 20, laminateOneSidePercent: 10, laminateTwoSidesPercent: 20, productMarkupPercent: 0 };
export const configuration: UserConfiguration = { currency: 'RUB', profiles: [profile], hardware: [{ id: 'hardware', name: 'Test', material: 'pvc' }] };
export const fixed = (widthMm: number, id = 's1'): Extract<Section, { openingType: 'fixed' }> => ({ id, widthMm, openingType: 'fixed' });
export const active = (widthMm: number, id = 's1', openingType: 'turn' | 'tilt_turn' = 'turn', hingeSide: HingeSide = 'left'): Exclude<Section, { openingType: 'fixed' }> => ({ id, widthMm, openingType, hingeSide, hardwareId: 'hardware' });
export const input: WindowInput = { id: 'test', room: 'Кухня', name: 'Окно 1', windowType: 'single', widthMm: 1000, heightMm: 1500, material: 'pvc', profileId: 'pvc', lamination: 'none', sections: [fixed(1000)] };
