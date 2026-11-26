import type { Translations } from '@mrtdown/core';
import type { CrowdReportEffect } from './crowdReports';

export type CrowdReportSourceKind = 'cluster' | 'report';
type CrowdReportSourceStatus = 'pending' | 'accepted' | 'dispatched';

export type CrowdReportSourceLine = {
  id: string;
  name: Translations;
  color: string;
};

export type CrowdReportSourceStation = {
  id: string;
  name: Translations;
};

export type CrowdReportSource = {
  kind: CrowdReportSourceKind;
  id: string;
  status: CrowdReportSourceStatus;
  effect: CrowdReportEffect | null;
  reportCount: number;
  observedStartAt: string;
  observedEndAt: string;
  updatedAt: string;
  dispatchedAt: string | null;
  directionText: string | null;
  directionStation: CrowdReportSourceStation | null;
  delayMinutes: number | null;
  stillHappening: boolean | null;
  lines: CrowdReportSourceLine[];
  stations: CrowdReportSourceStation[];
};
