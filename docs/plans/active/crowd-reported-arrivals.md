# Crowd-Reported Arrivals

Use short-lived commuter reports to add station-display context to the timetable.
The station guide labels the latest accepted report separately for each service
and direction. Published timetable times and platform assignments retain their
source data.

- Reuse `crowd_arrival_reports` for arrival reports. Disruption reports and
  canonical ingest continue through their existing pipeline.
- Check the current service revision and destination before recording a report.
  Use server receipt time and enforce the existing reporter cooldown in the
  write transaction.
- Fetch the latest recent report with branch-level v2 arrivals. Reports have
  no platform assignment. Expire them after five minutes or one minute after
  the reported arrival, whichever comes first.
- Refresh the guide after submission and keep serving the timetable if the
  report lookup fails.
