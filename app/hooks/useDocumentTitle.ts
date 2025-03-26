import { useEffect } from 'react';

export function useDocumentTitle(str: string) {
  useEffect(() => {
    document.title = str;
  }, [str]);
}
