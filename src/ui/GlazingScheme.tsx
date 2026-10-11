import { customerConstruction, customerSchemeLayout, glazingPrimitives, type GlazingDrawing } from './glazing-drawing';

/** Shared drawing only: ready coordinates, never editor state or geometry functions. */
export function GlazingScheme({ geometry, label, customer = false }: { geometry: GlazingDrawing; label: string; customer?: boolean }) {
  const { bounds } = geometry;
  const drawing = glazingPrimitives(geometry, customer);
  const marks = customer ? customerSchemeLayout(geometry, 620, 440) : undefined;
  const construction = marks ? customerConstruction(geometry, marks) : undefined;
  const rectangles = drawing.rectangles.map(({ rectangle: r, className }, index) => <rect key={index} className={className} x={r.xMm} y={r.yMm} width={r.widthMm} height={r.heightMm} style={customer ? { fill: '#ffffff', strokeWidth: 3.2 } : undefined} vectorEffect="non-scaling-stroke" />);
  const symbols = drawing.lines.map((line, index) => <polyline key={index} className={`opening-symbol ${line.kind}`} points={line.points.map((p) => `${p.xMm},${p.yMm}`).join(' ')} vectorEffect="non-scaling-stroke" />);
  const viewBox = `${bounds.xMm} ${bounds.yMm} ${bounds.widthMm} ${bounds.heightMm}`;
  return <svg role="img" aria-label={label} viewBox={customer ? '0 0 620 440' : viewBox} preserveAspectRatio="xMidYMid meet">
    <title>{customer ? label : `${label} · ${bounds.widthMm} × ${bounds.heightMm} мм`}</title>
    {marks ? <>
      <svg x={marks.plot.x} y={marks.plot.y} width={marks.plot.width} height={marks.plot.height} viewBox={viewBox} preserveAspectRatio="xMidYMid meet" overflow="visible">{rectangles}</svg>
      {construction!.contours.map((r, index) => <rect key={index} className={`customer-${r.kind}`} x={r.x} y={r.y} width={r.width} height={r.height} fill={r.fill} stroke="#53706e" strokeWidth={r.weight} />)}
      {construction!.lines.map((line, index) => <polyline key={index} className={`customer-opening ${line.kind}`} points={line.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#65817b" strokeWidth="1.1" strokeDasharray={line.dashed ? '3 3' : undefined} />)}
      {marks.dimensions.map((d, index) => {
        const horizontal = d.axis === 'width';
        const x1 = horizontal ? d.start : d.cross; const y1 = horizontal ? d.cross : d.start;
        const x2 = horizontal ? d.end : d.cross; const y2 = horizontal ? d.cross : d.end;
        const tx = horizontal ? (d.start + d.end) / 2 : d.cross + 17;
        const ty = horizontal ? d.cross + 20 : (d.start + d.end) / 2;
        return <g className="scheme-dimension" key={index}>
          <path d={`M${x1},${y1} L${x2},${y2} M${x1 - 3},${y1 - 3} L${x1 + 3},${y1 + 3} M${x2 - 3},${y2 - 3} L${x2 + 3},${y2 + 3}`} fill="none" stroke="#9aa9a3" strokeWidth="0.6" />
          <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontFamily="Arial, sans-serif" fontSize={d.primary ? 22 : 18} fill={d.primary ? '#536b62' : '#7b8d85'} transform={horizontal ? undefined : `rotate(-90 ${tx} ${ty})`}>{d.text}</text>
        </g>;
      })}
    </> : <>{rectangles}{symbols}</>}
  </svg>;
}
