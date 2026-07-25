import { useCallback, useEffect, useRef, useState } from 'react';

const CLOSE_DELAY_MS = 100;

export function useHoverPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimeoutRef.current != null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const openOnHover = useCallback(() => {
    cancelClose();
    setIsOpen(true);
  }, [cancelClose]);

  const closeAfterHover = useCallback(() => {
    cancelClose();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimeoutRef.current = null;
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return { closeAfterHover, isOpen, openOnHover, setIsOpen };
}
