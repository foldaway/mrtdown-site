# Crowd-Reported Arrivals

## Goal

Overlay fresh commuter-reported arrival times on the first station/service
arrival estimate. Reports are operational, short-lived signals: they are not
canonical evidence, community disruption reports, or historical records.

## Design

- Keep arrival reports in site-local tables separate from `crowd_reports`.
- Accept a report after the existing public abuse gate; use server receipt time
  as its observation time.
- Require an active service that calls at the selected station. The service id
  supplies the direction and destination scope.
- Query only recent accepted reports and supply them to
  `estimateNextStationArrivals`; let core resolve agreement and confidence.
- Refresh only the arrival widget through an uncached endpoint. Do not purge
  the public page cache for a three-minute signal.
- Present crowd values as community-reported arrivals, never live tracking or
  official predictions.

## Delivery

1. Add schema, generated migration, validation, and isolated write/read helper
   tests.
2. Overlay the reports in the station arrival read model and expose an
   uncached station-arrivals server function.
3. Add a compact report action on each active station/service row and refresh
   the hydrated arrival widget every 30 seconds.
4. Launch behind the existing deployment safeguards; monitor expiry,
   disagreement, and abuse-rejection rates before widening the report limits.
