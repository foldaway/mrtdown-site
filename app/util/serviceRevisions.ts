type ServiceRevisionRecencyFields = {
  id: string;
  start_at?: string | null;
  end_at: string | null;
  updated_at: Date | string;
};

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function compareServiceRevisionsByRecency<
  T extends ServiceRevisionRecencyFields,
>(a: T, b: T) {
  if (a.end_at == null && b.end_at != null) {
    return -1;
  }
  if (a.end_at != null && b.end_at == null) {
    return 1;
  }

  if (a.end_at != null && b.end_at != null && a.end_at !== b.end_at) {
    return b.end_at.localeCompare(a.end_at);
  }

  const updatedAtDiff = toTimestamp(b.updated_at) - toTimestamp(a.updated_at);
  if (updatedAtDiff !== 0) {
    return updatedAtDiff;
  }

  return b.id.localeCompare(a.id);
}

export function sortServiceRevisionsByRecency<
  T extends ServiceRevisionRecencyFields,
>(revisions: readonly T[]) {
  return [...revisions].sort(compareServiceRevisionsByRecency);
}

function startAtOrLegacy(value: ServiceRevisionRecencyFields) {
  return value.start_at ?? '0000-01-01';
}

function compareByEffectiveStartDesc<T extends ServiceRevisionRecencyFields>(
  a: T,
  b: T,
) {
  const startDiff = startAtOrLegacy(b).localeCompare(startAtOrLegacy(a));
  if (startDiff !== 0) {
    return startDiff;
  }
  return compareServiceRevisionsByRecency(a, b);
}

function compareByEffectiveStartAsc<T extends ServiceRevisionRecencyFields>(
  a: T,
  b: T,
) {
  const startDiff = startAtOrLegacy(a).localeCompare(startAtOrLegacy(b));
  if (startDiff !== 0) {
    return startDiff;
  }
  return compareServiceRevisionsByRecency(a, b);
}

export function serviceRevisionHasEnded(
  revision: Pick<ServiceRevisionRecencyFields, 'end_at'>,
  referenceDate: string,
) {
  return revision.end_at != null && revision.end_at < referenceDate;
}

export function serviceRevisionHasStarted(
  revision: Pick<ServiceRevisionRecencyFields, 'start_at'>,
  referenceDate: string,
) {
  return revision.start_at == null || revision.start_at <= referenceDate;
}

export function serviceRevisionIsActiveOn(
  revision: Pick<ServiceRevisionRecencyFields, 'start_at' | 'end_at'>,
  referenceDate: string,
) {
  return (
    serviceRevisionHasStarted(revision, referenceDate) &&
    !serviceRevisionHasEnded(revision, referenceDate)
  );
}

export function selectServiceRevisionForReferenceDate<
  T extends ServiceRevisionRecencyFields,
>(revisions: readonly T[], referenceDate: string): T | undefined {
  const active = revisions
    .filter((revision) => serviceRevisionIsActiveOn(revision, referenceDate))
    .sort(compareByEffectiveStartDesc)[0];
  if (active != null) {
    return active;
  }

  const future = revisions
    .filter(
      (revision) =>
        revision.start_at != null && revision.start_at > referenceDate,
    )
    .sort(compareByEffectiveStartAsc)[0];
  if (future != null) {
    return future;
  }

  return revisions
    .filter((revision) => serviceRevisionHasEnded(revision, referenceDate))
    .sort(compareServiceRevisionsByRecency)[0];
}
