import type { Calculation } from '../../domain/calculation';
import type { UserConfiguration } from '../../domain/configuration/types';
import type { Lamination, Material, OpeningType, HingeSide, Section } from '../../domain/measurements/shared';
import { estimateWindow } from '../../application/estimate/estimate-window';

/** Storage-only description of the retired v1 record; not an alternative domain model. */
interface V1Record {
  id: string;
  schemaVersion: 1;
  configuration: UserConfiguration;
  measurement: {
    id: string; kind: 'Window'; room: string; name: string; material: Material;
    profileId: string; hardwareId: string | null; lamination: Lamination;
    plane: { sections: { id: string; widthMm: number; heightMm: number; openingType: OpeningType; hingeSide?: HingeSide }[] };
  };
}

export function migrateCalculationV1(record: V1Record): Calculation {
  if (record.schemaVersion !== 1 || record.measurement.kind !== 'Window' || record.id !== record.measurement.id) throw new Error('Некорректная запись версии 1.');
  const old = record.measurement;
  const section = old.plane.sections[0];
  if (old.plane.sections.length !== 1 || !section) throw new Error('В версии 1 должна быть одна секция.');
  if (section.openingType !== 'fixed' && (!section.hingeSide || !old.hardwareId)) throw new Error('Повреждена активная створка версии 1.');
  const migratedSection: Section = section.openingType === 'fixed'
    ? { id: section.id, widthMm: section.widthMm, openingType: 'fixed' }
    : { id: section.id, widthMm: section.widthMm, openingType: section.openingType, hingeSide: section.hingeSide!, hardwareId: old.hardwareId! };
  return estimateWindow({ id: old.id, room: old.room, name: old.name, windowType: 'single',
    widthMm: section.widthMm, heightMm: section.heightMm, material: old.material,
    profileId: old.profileId, lamination: old.lamination, sections: [migratedSection],
  }, record.configuration);
}
