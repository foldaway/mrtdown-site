import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import type React from 'react';
import { useEffect, useState } from 'react';

interface Props {
  svgRef: SVGElement | null;
  initialZoom?: number;
}

export const ZoomControls: React.FC<Props> = (props) => {
  const { svgRef, initialZoom = 1 } = props;

  const [zoomLevel, setZoomLevel] = useState(initialZoom);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [showZoomInfo, setShowZoomInfo] = useState(false);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4;
  const ZOOM_STEP = 0.2;
  const ZOOM_INFO_TIMEOUT = 2000; // milliseconds

  // Apply transform to SVG
  useEffect(() => {
    if (svgRef == null) {
      return;
    }

    const svgElement = svgRef as SVGSVGElement;
    svgElement.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    svgElement.style.transformOrigin = 'center center';
    svgElement.style.transition = 'transform 0.2s ease-out';
  }, [svgRef, zoomLevel, panOffset]);

  // Auto-hide zoom info label after timeout
  useEffect(() => {
    if (!showZoomInfo) {
      return;
    }

    const timer = setTimeout(() => {
      setShowZoomInfo(false);
    }, ZOOM_INFO_TIMEOUT);

    return () => clearTimeout(timer);
  }, [showZoomInfo]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
    setShowZoomInfo(true);
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
    setShowZoomInfo(true);
  };

  const handleReset = () => {
    setZoomLevel(initialZoom);
    setPanOffset({ x: 0, y: 0 });
    setShowZoomInfo(false);
  };

  // Handle pan (drag to move)
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (zoomLevel <= 1) {
      return;
    }

    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPanning) {
      return;
    }

    const newOffsetX = e.clientX - panStart.x;
    const newOffsetY = e.clientY - panStart.y;

    // Constrain panning to reasonable bounds
    const maxPanX = (zoomLevel - 1) * 200;
    const maxPanY = (zoomLevel - 1) * 200;

    setPanOffset({
      x: Math.max(-maxPanX, Math.min(maxPanX, newOffsetX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, newOffsetY)),
    });
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  const handleDoubleTap = () => {
    if (zoomLevel < (MIN_ZOOM + MAX_ZOOM) / 2) {
      setZoomLevel(2);
    } else {
      handleReset();
    }
  };

  return (
    <div className="relative w-full md:hidden">
      {/* SVG wrapper with pointer events and overflow visible */}
      <div
        className="relative overflow-auto"
        style={{
          width: '100%',
        }}
      >
        {svgRef && (
          <button
            type="button"
            className="inline-block origin-top-left"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onDoubleClick={handleDoubleTap}
            style={{
              cursor: isPanning ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
            }}
          />
        )}
      </div>

      {/* Mobile Zoom Controls - Positioned relative to container, not fixed */}
      <div className="absolute right-2 bottom-2 z-50 flex flex-col gap-2">
        {/* Zoom In Button */}
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoomLevel >= MAX_ZOOM}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white shadow-lg transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
          aria-label="Zoom in"
          title={`Zoom in (${Math.round(zoomLevel * 100)}%)`}
        >
          <PlusIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        </button>

        {/* Reset Button */}
        <button
          type="button"
          onClick={handleReset}
          disabled={
            zoomLevel === initialZoom && panOffset.x === 0 && panOffset.y === 0
          }
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white font-bold text-xs shadow-lg transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="Reset zoom"
          title="Reset"
        >
          100%
        </button>

        {/* Zoom Out Button */}
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoomLevel <= MIN_ZOOM}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-white shadow-lg transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
          aria-label="Zoom out"
          title={`Zoom out (${Math.round(zoomLevel * 100)}%)`}
        >
          <MinusIcon className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        </button>
      </div>

      {/* Zoom info label (optional, shown during zoom, auto-dismisses) */}
      {zoomLevel !== initialZoom && showZoomInfo && (
        <div className="-translate-x-1/2 absolute left-1/2 z-50 rounded bg-gray-900 px-3 py-1 font-medium text-sm text-white transition-opacity duration-300 dark:bg-gray-100 dark:text-gray-900">
          {Math.round(zoomLevel * 100)}%
        </div>
      )}
    </div>
  );
};
