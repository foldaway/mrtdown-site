export function buildLocaleAwareLink(path: string, lang?: string) {
  if (lang == null || lang === 'en-SG') {
    return path;
  }
  return `/${lang}${path}`;
}
