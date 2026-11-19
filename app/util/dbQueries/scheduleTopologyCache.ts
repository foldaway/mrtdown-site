import { hashBytes } from '@mrtdown/fs';
import { readCanonicalTopologyAttestation } from '~/db/canonicalTopologyPromotion';
import { recordServerTiming } from '../serverTiming';
import type { AppDb, AppDbTransaction } from './database';
import { readLiveScheduleTopology } from './readLiveScheduleTopology';

type Topology = Awaited<ReturnType<typeof readLiveScheduleTopology>>;
type Memo = { key: string; topology: Topology };
const memos = new WeakMap<AppDb, Memo>();
export const MAX_SCHEDULE_TOPOLOGY_MEMO_BYTES = 1024 * 1024;

function topologyRows(topology: Topology) {
  let rows =
    topology.operators.length +
    topology.lines.length +
    topology.stations.length +
    topology.services.length;
  for (const line of topology.lines) {
    rows += line.operators.length + line.serviceIds.length;
  }
  for (const station of topology.stations) {
    rows += station.stationCodes.length + station.platforms.length;
    for (const platform of station.platforms) {
      rows += platform.serviceIds.length;
    }
  }
  for (const service of topology.services) {
    rows += service.revisions.length;
    for (const revision of service.revisions) {
      rows += revision.stations.length;
    }
  }
  return rows;
}

/** Reuse only topology; history, eligibility, coverage and departures stay in tx. */
export async function readScheduleTopologyForSnapshot(
  db: AppDb,
  tx: AppDbTransaction,
): Promise<Topology> {
  const startedAt = performance.now();
  const memo = memos.get(db);
  const enabled = process.env.SCHEDULE_TOPOLOGY_MEMO === 'enabled';
  const identity = enabled ? await readCanonicalTopologyAttestation(tx) : null;
  const attestation = identity?.attestation;
  const key = attestation
    ? `${attestation.encodingVersion}:${attestation.projectionVersion}:${attestation.sha256}`
    : undefined;
  const report = (
    source: 'memory' | 'sql',
    reason: string,
    rows: number,
    bytes: number,
  ) => {
    const durationMs = performance.now() - startedAt;
    recordServerTiming('schedule_topology_load', durationMs, source);
    recordServerTiming('schedule_topology_rows', 0, String(rows));
    console.info(
      JSON.stringify({
        event: 'schedule_topology_read',
        source,
        reason,
        durationMs,
        rows,
        bytes,
        promotionToken: attestation?.promotionToken,
      }),
    );
  };
  if (key && memo?.key === key) {
    const topology = structuredClone(memo.topology);
    report('memory', 'hit', 0, 0);
    return topology;
  }
  // Includes the original completed-promotion gate, even with the memo disabled.
  const topology = await readLiveScheduleTopology(tx);
  const raw = JSON.stringify(topology);
  const bytes = Buffer.byteLength(raw);
  let reason = identity?.reason ?? (enabled ? 'cold' : 'disabled');
  if (attestation && key) {
    if (
      topology.projectionVersion !== attestation.projectionVersion ||
      hashBytes(Buffer.from(raw)) !== attestation.sha256
    ) {
      reason = 'digest-mismatch';
    } else if (bytes > MAX_SCHEDULE_TOPOLOGY_MEMO_BYTES) {
      reason = 'oversized';
    } else if (memos.get(db) === memo) {
      // Another pending read does not block warming. A completed fill changes
      // the slot, so an old snapshot cannot replace newly cached topology.
      memos.set(db, { key, topology: structuredClone(topology) });
    }
  }
  report('sql', reason, topologyRows(topology), bytes);
  return topology;
}
