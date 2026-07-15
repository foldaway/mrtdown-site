import { LANGUAGES } from '~/constants';

export function getRouteTelemetryPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const routeSegments = LANGUAGES.includes(segments[0] ?? '')
    ? segments.slice(1)
    : segments;

  if (routeSegments.length === 0) {
    return '/';
  }

  const [route, second, third] = routeSegments;

  switch (route) {
    case 'about':
    case 'report':
    case 'statistics':
    case 'system-map':
      return `/${route}`;
    case 'history':
      if (second === 'page') {
        return '/history/page/:pageNum';
      }
      if (second != null && third != null) {
        return '/history/:year/:month';
      }
      if (second != null) {
        return '/history/:year';
      }
      return '/history';
    case 'issues':
      return '/issues/:issueId';
    case 'lines':
      return '/lines/:lineId';
    case 'operators':
      return '/operators/:operatorId';
    case 'stations':
      return '/stations/:stationId';
    case 'towns':
      return second == null ? '/towns' : '/towns/:townId';
    case 'status':
      return '/status/:lineId';
    default:
      return '/404';
  }
}
