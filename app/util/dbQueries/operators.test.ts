import { describe, expect, it } from 'vitest';
import { mergeOperatorReadModelScope } from './operators';

describe('operator read-model scope', () => {
  it('merges all operated lines with the affected issue graph', () => {
    expect(
      mergeOperatorReadModelScope({
        lineIds: ['NSL', 'EWL'],
        serviceIds: ['nsl-main', 'ewl-main'],
        stationIds: ['NS1', 'NS2', 'EW1'],
        issueScope: {
          lineIds: ['EWL', 'TEL'],
          serviceIds: ['ewl-main', 'tel-main'],
          stationIds: ['EW1', 'TE1'],
        },
      }),
    ).toEqual({
      lineIds: ['NSL', 'EWL', 'TEL'],
      serviceIds: ['nsl-main', 'ewl-main', 'tel-main'],
      stationIds: ['NS1', 'NS2', 'EW1', 'TE1'],
    });
  });

  it('keeps a no-issue operator scoped to its planned line graph', () => {
    expect(
      mergeOperatorReadModelScope({
        lineIds: ['JRL'],
        serviceIds: ['jrl-main'],
        stationIds: ['JS1', 'JS2'],
        issueScope: { lineIds: [], serviceIds: [], stationIds: [] },
      }),
    ).toEqual({
      lineIds: ['JRL'],
      serviceIds: ['jrl-main'],
      stationIds: ['JS1', 'JS2'],
    });
  });
});
