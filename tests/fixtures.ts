import type { SingleWindowInput } from '../src/domain/measurements/window/create-window';
import type { ProfileConfiguration, UserConfiguration } from '../src/domain/configuration/types';

export const profile: ProfileConfiguration = { id: 'pvc', name: 'Test', material: 'pvc', basePricePerM2: 10000, activityPercent: 20, laminateOneSidePercent: 10, laminateTwoSidesPercent: 20, productMarkupPercent: 0 };
export const configuration: UserConfiguration = { currency: 'RUB', profiles: [profile], hardware: [{ id: 'hardware', name: 'Test', material: 'pvc' }] };
export const input: SingleWindowInput = { id: 'test', room: 'Кухня', name: 'Окно 1', widthMm: 1000, heightMm: 1500, material: 'pvc', profileId: 'pvc', hardwareId: null, lamination: 'none', openingType: 'fixed' };
