import type { ProposalSchemeGeometryV2, ProposalRectangleV2 } from '../domain/documents/proposal-document-v2';

/** Shared drawing only: ready coordinates, never editor state or geometry functions. */
type Drawing = Pick<ProposalSchemeGeometryV2, 'bounds' | 'transom' | 'splitLine'> & {
  sections: readonly (ProposalRectangleV2 & {
    fill?: 'glass' | 'sandwich';
    symbols: ProposalSchemeGeometryV2['sections'][number]['symbols'];
  })[];
};
export function GlazingScheme({ geometry, label }: { geometry: Drawing; label: string }) {
  const { bounds, sections, transom } = geometry;
  return <svg role="img" aria-label={label} viewBox={`${bounds.xMm} ${bounds.yMm} ${bounds.widthMm} ${bounds.heightMm}`} preserveAspectRatio="xMidYMid meet">
    <title>{`${label} · ${bounds.widthMm} × ${bounds.heightMm} мм`}</title>
    {transom && <rect className="glazing transom" x={transom.xMm} y={transom.yMm} width={transom.widthMm} height={transom.heightMm} vectorEffect="non-scaling-stroke" />}
    {sections.map((section, index) => <g key={index}>
      <rect className={`glazing section ${section.fill === 'sandwich' ? 'sandwich' : ''}`} x={section.xMm} y={section.yMm} width={section.widthMm} height={section.heightMm} vectorEffect="non-scaling-stroke" />
      {section.symbols.map((symbol, symbolIndex) => <polyline key={symbolIndex} className={`opening-symbol ${symbol.kind}`} points={symbol.points.map((point) => `${point.xMm},${point.yMm}`).join(' ')} vectorEffect="non-scaling-stroke" />)}
    </g>)}
    {geometry.splitLine && <polyline className="opening-symbol" points={geometry.splitLine.map((point) => `${point.xMm},${point.yMm}`).join(' ')} vectorEffect="non-scaling-stroke" />}
  </svg>;
}
