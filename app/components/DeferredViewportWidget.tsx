import { Suspense, useEffect, useRef, useState } from 'react';
import type React from 'react';

interface DeferredViewportWidgetProps {
  children: React.ReactNode;
  className: string;
  fallback: React.ReactNode;
  rootMargin?: string;
}

export function DeferredViewportWidget(props: DeferredViewportWidgetProps) {
  const { children, className, fallback, rootMargin = '600px 0px' } = props;
  const [shouldRender, setShouldRender] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (shouldRender) {
      return;
    }

    const container = containerRef.current;
    if (container == null || !('IntersectionObserver' in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return (
    <div className={className} ref={containerRef}>
      {shouldRender ? (
        <Suspense fallback={fallback}>{children}</Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
