export function buildLocaleAwareLink(path: string, lang?: string) {
  if (lang == null) {
    return path;
  }
  return `/${lang}${path}`;
}
