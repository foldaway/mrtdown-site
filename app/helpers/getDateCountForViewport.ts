import type { Viewport } from '~/hooks/useViewport';

/**
 * Get the number of dates to display based on the viewport size.

 * @param viewport
 * @returns
 */
export function getDateCountForViewport(viewport: Viewport): number {
  switch (viewport) {
    case 'xs': {
      return 30;
    }
    case 'sm':
    case 'md': {
      return 60;
    }
    default: {
      return 90;
    }
  }
}
