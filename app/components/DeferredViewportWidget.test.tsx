import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeferredViewportWidget } from './DeferredViewportWidget';

describe('DeferredViewportWidget', () => {
  it('renders its content during server rendering', () => {
    const html = renderToString(
      <DeferredViewportWidget
        className="col-span-6"
        fallback={<span>Loading graph</span>}
      >
        <section>Issue Count by Line</section>
      </DeferredViewportWidget>,
    );

    expect(html).toContain('Issue Count by Line');
    expect(html).not.toContain('Loading graph');
  });
});
