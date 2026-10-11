import type { WindowEstimate } from '../domain/measurement-estimate';
import { GlazingScheme } from './GlazingScheme';

type Geometry = WindowEstimate['geometry'];

/** SVG consumes millimetre coordinates verbatim. The SVG viewport performs one uniform scale. */
export function WindowPreview({ geometry, label = 'Окно' }: { geometry: Geometry; label?: string }) {
  const { bounds, sections, transom } = geometry;
  return <figure className="window-preview">
    <GlazingScheme geometry={geometry} label={`Технический эскиз: ${label}, вид из помещения`} />
    <figcaption>
      <strong>Габарит эскиза: {bounds.widthMm.toLocaleString('ru-RU')} × {bounds.heightMm.toLocaleString('ru-RU')} мм</strong>
      <span>Вид из помещения. Толстые отметки — петли; пунктир — откидывание; стрелка — раздвижная створка. Толщина профиля условная.</span>
      <span>{geometry.splitLine ? 'Размеры элементов (верхний, затем нижний ярус)' : 'Элементы слева направо'}: {sections.map((section) => `${section.widthMm.toLocaleString('ru-RU', { maximumFractionDigits: 6 })} × ${section.heightMm.toLocaleString('ru-RU', { maximumFractionDigits: 6 })}`).join(' / ')} мм.</span>
      {transom && <span>Глухая фрамуга: {transom.heightMm.toLocaleString('ru-RU')} мм.</span>}
    </figcaption>
  </figure>;
}
