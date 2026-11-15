# Station arrivals API v2

`GET /api/stations/{stationId}/arrivals/v2?lineId={lineId}&serviceId={serviceId}&destinationStationId={destinationStationId}`

The IDs identify one canonical service direction at a station. Use
`platformId` to narrow the query to a boarding platform. With `loop=true`,
use the loop’s common start and end station as the destination. That query
includes the timetable termini served by the loop direction.

The server chooses the request time and returns up to 20 scheduled departures
in the next 60 minutes, excluding the end of the window. Responses are
`Cache-Control: no-store`. See the
[route](../../app/routes/api.stations.$stationId.arrivals.v2.tsx) for input
validation and the [serializer](../../app/util/stationArrivalsV2.ts) for the
response fields.

## Reading the result

- **Complete.** An empty result is authoritative for the query window. A
  complete result can still hit the result limit. It cannot establish the
  first or last train of the service day.
- **Incomplete.** Display the scheduled departures provided. Untimed counts
  describe the selected service dates and scope because those rows have no
  instant to compare with the window.
- **Unavailable.** Use the coverage reasons to explain why a schedule could
  not be supplied. Frequency metadata supplies no fallback estimates.

Alternative platforms describe one departure. An approximate time is still
scheduled. A recent rider report is a separate branch-level observation and
never changes scheduled times. Platform-specific reads omit the rider report.
A failed report lookup leaves the timetable result usable.

Invalid syntax or canonical scope returns HTTP 400. Unexpected failures return
HTTP 500. The legacy frequency endpoint at
`GET /api/stations/{stationId}/arrivals` returns HTTP 410.

## Reporting an arrival

`POST /api/arrival-reports` accepts the canonical branch IDs and an integer
`minutesToArrival` from 0 through 30. HTTP 201 confirms receipt. HTTP 429
indicates the reporter cooldown. A report expires five minutes after receipt
or one minute after its reported arrival, whichever comes first. See the
[submission route](../../app/routes/api.arrival-reports.tsx) and
[report storage](../../app/util/crowdArrivalReports.ts).
