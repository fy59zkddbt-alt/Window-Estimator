import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WindowPreview } from '../src/ui/WindowPreview';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { active, fixed, input, configuration, blockInput } from './fixtures';
import { estimateBalcony } from '../src/application/estimate/estimate-balcony';
import { demoConfiguration } from '../src/domain/configuration/demo-configuration';

it('renders balcony tiers, sandwich and sliding with real proportions using the common renderer', () => {
  const result = estimateBalcony({ id: 'b', room: 'Балкон', name: 'Балкон', balconyType: 'straight', material: 'aluminium', profileId: 'aluminium', lamination: 'none', planes: [{
    id: 'facade', name: 'Фасад', position: 'facade', widthMm: 1500, heightMm: 2200, sectionCount: 2,
    levels: { mode: 'twoLevel', splitHeightMm: 700, lowerFill: 'sandwich' },
    sections: [{ id: 'a', widthMm: 500, openingType: 'sliding' }, { id: 'b', widthMm: 1000, openingType: 'fixed' }],
  }] }, demoConfiguration);
  const plane = result.geometry.planes[0]!;
  const markup = renderToStaticMarkup(<WindowPreview geometry={plane} />);
  expect(markup).toContain('viewBox="0 0 1500 2200"');
  expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
  expect(markup).toContain('x="500" y="1500" width="1000" height="700"');
  expect(markup).toContain('glazing section sandwich');
  expect(markup).toContain('opening-symbol sliding');
  expect(markup).toContain('points="0,1500 1500,1500"');
  expect(markup.match(/<rect /g)).toHaveLength(4);
});

it('renders domain rectangles with a uniform SVG scale, including unequal widths and transom', () => {
  const { geometry } = estimateWindow({ ...input, windowType: 'triple', widthMm: 2400, heightMm: 1800,
    sections: [fixed(400), active(800, 's2'), active(1200, 's3', 'tilt_turn', 'right')],
    transom: { openingType: 'fixed', heightMm: 300 },
  }, configuration);
  const markup = renderToStaticMarkup(<WindowPreview geometry={geometry} />);
  expect(markup).toContain('viewBox="0 0 2400 1800"');
  expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
  expect(markup).toContain('x="0" y="0" width="2400" height="300"');
  expect(markup).toContain('x="0" y="300" width="400" height="1500"');
  expect(markup).toContain('x="400" y="300" width="800" height="1500"');
  expect(markup).toContain('x="1200" y="300" width="1200" height="1500"');
  for (const section of geometry.sections) for (const symbol of section.symbols) {
    expect(markup).toContain(`points="${symbol.points.map((point) => `${point.xMm},${point.yMm}`).join(' ')}"`);
  }
});

it('uses the same SVG renderer for a block and draws no bounding infill', () => {
  const { geometry } = estimateWindow({ ...blockInput, doorPosition: 'middle', sections: [fixed(500, 'w1'), active(1000, 'w2', 'tilt_turn', 'right')] }, configuration);
  const markup = renderToStaticMarkup(<WindowPreview geometry={geometry} />);
  expect(markup).toContain('viewBox="0 0 2200 2200"');
  expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
  const rectangles = markup.match(/<rect[^>]+>/g)!;
  expect(rectangles).toHaveLength(3);
  expect(rectangles[0]).toContain('x="0" y="0" width="500" height="1500"');
  expect(rectangles[1]).toContain('x="500" y="0" width="700" height="2200"');
  expect(rectangles[2]).toContain('x="1200" y="0" width="1000" height="1500"');
  expect(markup).not.toContain('width="2200" height="2200"');
  for (const section of geometry.sections) for (const symbol of section.symbols) {
    expect(markup).toContain(`points="${symbol.points.map((point) => `${point.xMm},${point.yMm}`).join(' ')}"`);
  }
});
