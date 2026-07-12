import { useEffect, useState } from 'react';

export function useRotatingLineColors(
  colors: string[],
  interval = 5000,
): string | undefined {
  const [currentIndex, setCurrentIndex] = useState(-1);
  useEffect(() => {
    function rotate() {
      setCurrentIndex((draft) => {
        const nextIndex = draft + 1;
        if (nextIndex < colors.length) {
          return nextIndex;
        }
        return 0;
      });
    }

    const handle = setInterval(rotate, interval);
    return () => clearInterval(handle);
  }, [colors.length, interval]);

  return colors.at(currentIndex);
}
