export function segmentText(text: string, locale = 'en-SG'): string[] {
  if ('Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(locale, {
      granularity: 'word',
    });
    const segments = Array.from(segmenter.segment(text));
    return segments.map((segment) => segment.segment);
  }

  return text.split(' ');
}
