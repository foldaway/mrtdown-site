# Combined timetable departure index

The pull verifies and retains combined releases in the same source lineage as
legacy timetables. The existing indexed reader accepts legacy versions.

## Materialize effective Singapore service days

- Reverify the retained bytes and release index against the trusted canonical
  topology before building. Use `projectCombinedTimetableServiceDay` within the
  artifact's half-open applicability range. Materialize covered days with zero
  active trips and keep dates outside the range unavailable.
- Store one occurrence per projection, service date, provider trip ID and source
  stop sequence. Keep sequences as text and preserve source occurrence order,
  precision and nullable timing.
- Store service and revision membership separately from timing. Associate
  eligible platforms with each membership and preserve the distinction between
  physical platform associations and source alternatives. For queries spanning
  multiple services, use membership to filter the occurrence and return it once.
- Index exact scope and platform coverage separately from the occurrence table.
  Keep original service dates, seconds beyond 24:00 and resolved instants.
  Record the maximum departure offset across the source calls so windows after
  midnight can look back to the prior service date, including after the final
  supported day.

## Read and verify

- Publish completed projections atomically and preserve the legacy reader
  through the versioned cutover. Use validated source lineage, explicit
  day/scope coverage and live canonical topology to select a version.
- Verify a shared journey appears once across services, including when platform
  access differs. Cover zero-active dates, untimed departures, the last day's
  overnight tail and rejected incomplete or incompatible projections.
