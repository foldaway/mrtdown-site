import { useLayoutEffect, useState } from 'react';

type Viewport = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

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
  const [viewport, setViewport] = useState<Viewport>(() => {
    if (typeof window === 'undefined') {
      return 'sm';
    }
    return computeViewport(window.innerWidth);
  });

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

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
