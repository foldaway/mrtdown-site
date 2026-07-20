import { describe, expect, it } from 'vitest';
import { getSchematicStationPath } from './getSchematicStationPath';

describe('getSchematicStationPath', () => {
  it('keeps repeated stations so return routes remain visible', () => {
    expect(
      getSchematicStationPath({
        stationIds: ['BP1', 'BP2', 'BP3'],
        entries: [
          { stationId: 'BP1', pathIndex: 0 },
          { stationId: 'BP2', pathIndex: 1 },
          { stationId: 'BP3', pathIndex: 2 },
          { stationId: 'BP2', pathIndex: 3 },
          { stationId: 'BP1', pathIndex: 4 },
        ],
      }),
    ).toMatchObject([
      { stationId: 'BP1' },
      { stationId: 'BP2' },
      { stationId: 'BP3' },
      { stationId: 'BP2' },
      { stationId: 'BP1' },
    ]);
  });

  it('falls back to station IDs for branches without ordered entries', () => {
    expect(
      getSchematicStationPath({
        stationIds: ['BP1', 'BP2'],
        entries: [],
      }),
    ).toMatchObject([{ stationId: 'BP1' }, { stationId: 'BP2' }]);
  });
});
