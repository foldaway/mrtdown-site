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
A failed report lookup leaves the timetable result usable. Published schedule
reads also omit an uninitialized or unavailable report cache; see the
[published reader runbook](../operations/edge-caching.md#published-arrivals-reader).

Invalid syntax or canonical scope returns HTTP 400. Unexpected failures return
HTTP 500. The legacy frequency endpoint at
`GET /api/stations/{stationId}/arrivals` returns HTTP 410.

## Station guide directions

The station guide can add a platform-specific direction to its canonical branch
metadata. At Bukit Panjang, platform 2 serves A via Senja and B via Petir;
platform 1 serves the common return towards Choa Chu Kang. The explicit
`BKP_BPLRT_2` allocation follows `BP6_B` in the
[original GTFS capture](https://sources.mrtdown.org/blobs/schedule/ceb07f9c91de86559212eb48c1feac6455452900fad49cf009414a66c2f17efe.zip).
The hint requires the matching canonical loop legs and an active boarding
platform for that service. Alternative platform sets receive it only when all
platforms agree. It does not change scheduled departures or report scopes.

## Reporting an arrival

`POST /api/arrival-reports` accepts the canonical branch IDs and an integer
`minutesToArrival` from 0 through 30. HTTP 201 confirms receipt. HTTP 429
indicates the reporter cooldown. A report expires five minutes after receipt
or one minute after its reported arrival, whichever comes first. See the
[submission route](../../app/routes/api.arrival-reports.tsx) and
[report storage](../../app/util/crowdArrivalReports.ts).
