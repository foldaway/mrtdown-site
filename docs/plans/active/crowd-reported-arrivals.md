# Crowd-Reported Arrivals

## Goal

Use commuter-reported arrival times to calibrate the estimated train phase for
the remainder of the service day. Reports are operational signals: they are not
canonical evidence, community disruption reports, or historical records.

## Design

- Keep arrival reports in site-local tables separate from `crowd_reports`.
- Accept a report after the existing public abuse gate; use server receipt time
  as its observation time.
- Require an active service that calls at the selected station. The service id
  supplies the direction and destination scope.
- Query accepted reports from the current service day, project their reported
  train forward through the applicable frequency windows, and supply the
  resulting next arrivals to `estimateNextStationArrivals`; let core resolve
  agreement and confidence.
- Refresh only the arrival widget through an uncached endpoint. Do not purge
  the public page cache for a service-day calibration signal.
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
