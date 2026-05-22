type ServiceRevisionRecencyFields = {
  id: string;
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
