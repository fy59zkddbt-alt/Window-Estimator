import type { Calculation } from '../domain/calculation';

type Geometry = Calculation['geometry'];

/** SVG consumes millimetre coordinates verbatim. The SVG viewport performs one uniform scale. */
export function WindowPreview({ geometry }: { geometry: Geometry }) {
  const { bounds, sections, transom } = geometry;
  return <figure className="window-preview">
    <svg role="img" aria-label="Технический эскиз окна, вид из помещения" viewBox={`${bounds.xMm} ${bounds.yMm} ${bounds.widthMm} ${bounds.heightMm}`} preserveAspectRatio="xMidYMid meet">
      <title>{`Окно ${bounds.widthMm} × ${bounds.heightMm} мм, вид из помещения`}</title>
      {transom && <rect className="glazing transom" x={transom.xMm} y={transom.yMm} width={transom.widthMm} height={transom.heightMm} vectorEffect="non-scaling-stroke" />}
      {sections.map((section) => <g key={section.id}>
        <rect className="glazing section" x={section.xMm} y={section.yMm} width={section.widthMm} height={section.heightMm} vectorEffect="non-scaling-stroke" />
        {section.symbols.map((symbol, index) => <polyline key={index} className={`opening-symbol ${symbol.kind}`} points={symbol.points.map((point) => `${point.xMm},${point.yMm}`).join(' ')} vectorEffect="non-scaling-stroke" />)}
      </g>)}
    </svg>
    <figcaption>
      <strong>{bounds.widthMm.toLocaleString('ru-RU')} × {bounds.heightMm.toLocaleString('ru-RU')} мм</strong>
      <span>Вид из помещения. Толстые отметки — петли; пунктир — откидывание. Толщина профиля условная.</span>
      <span>Секции слева направо: {sections.map((section) => section.widthMm.toLocaleString('ru-RU', { maximumFractionDigits: 6 })).join(' / ')} мм.</span>
      {transom && <span>Глухая фрамуга: {transom.heightMm.toLocaleString('ru-RU')} мм.</span>}
    </figcaption>
  </figure>;
}
