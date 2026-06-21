import { defineRelations } from 'drizzle-orm';
import {
  crowdReportAbuseEventsTable,
  crowdReportClusterLinesTable,
  crowdReportClustersTable,
  crowdReportClusterStationsTable,
  crowdReportLinesTable,
  crowdReportModerationEventsTable,
  crowdReportRateLimitsTable,
  crowdReportsTable,
  crowdReportStationsTable,
  evidencesTable,
  impactEventBasisEvidencesTable,
  impactEventCausesTable,
  impactEventEntityFacilitiesTable,
  impactEventEntityServicesTable,
  impactEventFacilityEffectsTable,
  impactEventPeriodsTable,
  impactEventsTable,
  impactEventServiceEffectsTable,
  impactEventServiceScopesTable,
  issueDayFactsTable,
  issuesTable,
  landmarksTable,
  lineDayFactsTable,
  lineOperatorsTable,
  linesTable,
  lineServicesTable,
  operatorsTable,
  serviceRevisionPathStationEntriesTable,
  serviceRevisionsTable,
  servicesTable,
  stationCodesTable,
  stationLandmarksTable,
  stationsTable,
  townsTable,
} from './schema';

const schema = {
  crowdReportAbuseEvents: crowdReportAbuseEventsTable,
  crowdReportClusterLines: crowdReportClusterLinesTable,
  crowdReportClusters: crowdReportClustersTable,
  crowdReportClusterStations: crowdReportClusterStationsTable,
  crowdReportLines: crowdReportLinesTable,
  crowdReportModerationEvents: crowdReportModerationEventsTable,
  crowdReportRateLimits: crowdReportRateLimitsTable,
  crowdReports: crowdReportsTable,
  crowdReportStations: crowdReportStationsTable,
  evidences: evidencesTable,
  impactEventBasisEvidences: impactEventBasisEvidencesTable,
  impactEventCauses: impactEventCausesTable,
  impactEventEntityFacilities: impactEventEntityFacilitiesTable,
  impactEventEntityServices: impactEventEntityServicesTable,
  impactEventFacilityEffects: impactEventFacilityEffectsTable,
  impactEventPeriods: impactEventPeriodsTable,
  impactEvents: impactEventsTable,
  impactEventServiceEffects: impactEventServiceEffectsTable,
  impactEventServiceScopes: impactEventServiceScopesTable,
  issueDayFacts: issueDayFactsTable,
  issues: issuesTable,
  landmarks: landmarksTable,
  lineDayFacts: lineDayFactsTable,
  lineOperators: lineOperatorsTable,
  lines: linesTable,
  lineServices: lineServicesTable,
  operators: operatorsTable,
  serviceRevisionPathStationEntries: serviceRevisionPathStationEntriesTable,
  serviceRevisions: serviceRevisionsTable,
  services: servicesTable,
  stationCodes: stationCodesTable,
  stationLandmarks: stationLandmarksTable,
  stations: stationsTable,
  towns: townsTable,
};

export const relations = defineRelations(schema, (r) => ({
  crowdReportAbuseEvents: {
    crowdReport: r.one.crowdReports({
      from: r.crowdReportAbuseEvents.report_id,
      to: r.crowdReports.id,
    }),
  },
  crowdReports: {
    crowdReportAbuseEvents: r.many.crowdReportAbuseEvents(),
    lines: r.many.lines({
      from: r.crowdReports.id.through(r.crowdReportLines.report_id),
      to: r.lines.id.through(r.crowdReportLines.line_id),
    }),
    crowdReportModerationEvents: r.many.crowdReportModerationEvents(),
    stations: r.many.stations({
      from: r.crowdReports.id.through(r.crowdReportStations.report_id),
      to: r.stations.id.through(r.crowdReportStations.station_id),
    }),
    crowdReportClusters: r.many.crowdReportClusters(),
  },
  crowdReportClusters: {
    lines: r.many.lines({
      from: r.crowdReportClusters.id.through(
        r.crowdReportClusterLines.cluster_id,
      ),
      to: r.lines.id.through(r.crowdReportClusterLines.line_id),
    }),
    stations: r.many.stations({
      from: r.crowdReportClusters.id.through(
        r.crowdReportClusterStations.cluster_id,
      ),
      to: r.stations.id.through(r.crowdReportClusterStations.station_id),
    }),
    crowdReports: r.many.crowdReports({
      from: r.crowdReportClusters.id,
      to: r.crowdReports.cluster_id,
    }),
  },
  lines: {
    crowdReportClusters: r.many.crowdReportClusters(),
    crowdReports: r.many.crowdReports({
      from: r.lines.id.through(r.crowdReportLines.line_id),
      to: r.crowdReports.id.through(r.crowdReportLines.report_id),
    }),
    impactEventEntityFacilities: r.many.impactEventEntityFacilities(),
    lineDayFacts: r.many.lineDayFacts(),
    operators: r.many.operators({
      from: r.lines.id.through(r.lineOperators.line_id),
      to: r.operators.id.through(r.lineOperators.operator_id),
    }),
    servicesViaLineServices: r.many.services({
      from: r.lines.id.through(r.lineServices.line_id),
      to: r.services.id.through(r.lineServices.service_id),
      alias: 'lines_id_services_id_via_lineServices',
    }),
    servicesLineId: r.many.services({
      alias: 'services_lineId_lines_id',
    }),
    stations: r.many.stations({
      from: r.lines.id.through(r.stationCodes.line_id),
      to: r.stations.id.through(r.stationCodes.station_id),
    }),
  },
  stations: {
    crowdReportClusters: r.many.crowdReportClusters(),
    crowdReports: r.many.crowdReports(),
    impactEventEntityFacilities: r.many.impactEventEntityFacilities(),
    impactEventServiceScopesFromStationId: r.many.impactEventServiceScopes({
      alias: 'impactEventServiceScopes_fromStationId_stations_id',
    }),
    impactEventServiceScopesStationId: r.many.impactEventServiceScopes({
      alias: 'impactEventServiceScopes_stationId_stations_id',
    }),
    impactEventServiceScopesToStationId: r.many.impactEventServiceScopes({
      alias: 'impactEventServiceScopes_toStationId_stations_id',
    }),
    lines: r.many.lines(),
    landmarks: r.many.landmarks(),
    town: r.one.towns({
      from: r.stations.townId,
      to: r.towns.id,
    }),
  },
  crowdReportModerationEvents: {
    crowdReport: r.one.crowdReports({
      from: r.crowdReportModerationEvents.report_id,
      to: r.crowdReports.id,
    }),
  },
  evidences: {
    issue: r.one.issues({
      from: r.evidences.issue_id,
      to: r.issues.id,
    }),
    impactEvents: r.many.impactEvents({
      from: r.evidences.id.through(r.impactEventBasisEvidences.evidence_id),
      to: r.impactEvents.id.through(
        r.impactEventBasisEvidences.impact_event_id,
      ),
    }),
  },
  issues: {
    evidences: r.many.evidences(),
    impactEvents: r.many.impactEvents(),
    issueDayFacts: r.many.issueDayFacts(),
  },
  impactEvents: {
    evidences: r.many.evidences(),
    impactEventCauses: r.many.impactEventCauses(),
    impactEventEntityFacilities: r.many.impactEventEntityFacilities(),
    services: r.many.services({
      from: r.impactEvents.id.through(
        r.impactEventEntityServices.impact_event_id,
      ),
      to: r.services.id.through(r.impactEventEntityServices.service_id),
    }),
    impactEventFacilityEffects: r.many.impactEventFacilityEffects(),
    impactEventPeriods: r.many.impactEventPeriods(),
    impactEventServiceEffects: r.many.impactEventServiceEffects(),
    impactEventServiceScopes: r.many.impactEventServiceScopes(),
    issue: r.one.issues({
      from: r.impactEvents.issue_id,
      to: r.issues.id,
    }),
  },
  impactEventCauses: {
    impactEvent: r.one.impactEvents({
      from: r.impactEventCauses.impact_event_id,
      to: r.impactEvents.id,
    }),
  },
  impactEventEntityFacilities: {
    impactEvent: r.one.impactEvents({
      from: r.impactEventEntityFacilities.impact_event_id,
      to: r.impactEvents.id,
    }),
    line: r.one.lines({
      from: r.impactEventEntityFacilities.line_id,
      to: r.lines.id,
    }),
    station: r.one.stations({
      from: r.impactEventEntityFacilities.station_id,
      to: r.stations.id,
    }),
  },
  services: {
    impactEvents: r.many.impactEvents(),
    lines: r.many.lines({
      alias: 'lines_id_services_id_via_lineServices',
    }),
    serviceRevisions: r.many.serviceRevisions(),
    line: r.one.lines({
      from: r.services.line_id,
      to: r.lines.id,
      alias: 'services_lineId_lines_id',
    }),
  },
  impactEventFacilityEffects: {
    impactEvent: r.one.impactEvents({
      from: r.impactEventFacilityEffects.impact_event_id,
      to: r.impactEvents.id,
    }),
  },
  impactEventPeriods: {
    impactEvent: r.one.impactEvents({
      from: r.impactEventPeriods.impact_event_id,
      to: r.impactEvents.id,
    }),
  },
  impactEventServiceEffects: {
    impactEvent: r.one.impactEvents({
      from: r.impactEventServiceEffects.impact_event_id,
      to: r.impactEvents.id,
    }),
  },
  impactEventServiceScopes: {
    stationFromStationId: r.one.stations({
      from: r.impactEventServiceScopes.from_station_id,
      to: r.stations.id,
      alias: 'impactEventServiceScopes_fromStationId_stations_id',
    }),
    impactEvent: r.one.impactEvents({
      from: r.impactEventServiceScopes.impact_event_id,
      to: r.impactEvents.id,
    }),
    stationStationId: r.one.stations({
      from: r.impactEventServiceScopes.station_id,
      to: r.stations.id,
      alias: 'impactEventServiceScopes_stationId_stations_id',
    }),
    stationToStationId: r.one.stations({
      from: r.impactEventServiceScopes.to_station_id,
      to: r.stations.id,
      alias: 'impactEventServiceScopes_toStationId_stations_id',
    }),
  },
  issueDayFacts: {
    issue: r.one.issues({
      from: r.issueDayFacts.issue_id,
      to: r.issues.id,
    }),
  },
  lineDayFacts: {
    line: r.one.lines({
      from: r.lineDayFacts.line_id,
      to: r.lines.id,
    }),
  },
  operators: {
    lines: r.many.lines(),
  },
  serviceRevisions: {
    stations: r.many.stations({
      from: [
        r.serviceRevisions.id.through(
          r.serviceRevisionPathStationEntries.service_revision_id,
        ),
        r.serviceRevisions.service_id.through(
          r.serviceRevisionPathStationEntries.service_id,
        ),
      ],
      to: r.stations.id.through(r.serviceRevisionPathStationEntries.station_id),
    }),
    service: r.one.services({
      from: r.serviceRevisions.service_id,
      to: r.services.id,
    }),
  },
  landmarks: {
    stations: r.many.stations({
      from: r.landmarks.id.through(r.stationLandmarks.landmark_id),
      to: r.stations.id.through(r.stationLandmarks.station_id),
    }),
  },
  towns: {
    stations: r.many.stations(),
  },
}));
