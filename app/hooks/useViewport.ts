import { useLayoutEffect, useState } from 'react';
import z from 'zod';

export const ViewportSchema = z.enum(['xs', 'sm', 'md', 'lg', 'xl', '2xl']);
export type Viewport = z.infer<typeof ViewportSchema>;

function computeViewport(width: number): Viewport {
  if (width >= 1536) {
    return '2xl';
  }
  if (width >= 1280) {
    return 'xl';
  }
  if (width >= 1024) {
    return 'lg';
  }
  if (width >= 768) {
    return 'md';
  }
  if (width >= 640) {
    return 'sm';
  }
  return 'xs';
}

export function useViewport() {
  const [viewport, setViewport] = useState<Viewport>('xs');

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Initial value, set here to run this only during client hydration
    setViewport(computeViewport(window.innerWidth));

    const handleWindowSizeChange = () => {
      setViewport(computeViewport(window.innerWidth));
    };

    window.addEventListener('resize', handleWindowSizeChange);
    return () => {
      window.removeEventListener('resize', handleWindowSizeChange);
    };
  }, []);

  return viewport;
}
