export function getEntityTypeFromArchivePath(path: string) {
  if (path.startsWith('data/landmark/')) {
    return 'landmark';
  }
  if (path.startsWith('data/line/')) {
    return 'line';
  }
  if (path.startsWith('data/operator/')) {
    return 'operator';
  }
  if (path.startsWith('data/town/')) {
    return 'town';
  }
  if (path.startsWith('data/station/')) {
    return 'station';
  }
  if (path.startsWith('data/service/')) {
    return 'service';
  }
  if (path.startsWith('data/issue/')) {
    if (path.endsWith('/evidence.ndjson')) {
      return 'issue.evidence';
    } else if (path.endsWith('/impact.ndjson')) {
      return 'issue.impact';
    }
    return 'issue';
  }
  throw new Error(`Unknown entity type for path: ${path}`);
}
