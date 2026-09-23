import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WindowPreview } from '../src/ui/WindowPreview';
import { estimateWindow } from '../src/application/estimate/estimate-window';
import { active, fixed, input, configuration } from './fixtures';

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
