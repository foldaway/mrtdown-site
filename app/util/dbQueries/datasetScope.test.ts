import { describe, expect, it } from 'vitest';
import { completeLineIdsFromInputs, type DatasetInputs } from './dataset';

type TopologyRows = Pick<DatasetInputs, 'linesRows' | 'serviceRows'>;

describe('completeLineIdsFromInputs', () => {
  it('does not promote a partially selected line to entire-line coverage', () => {
    const full = {
      linesRows: [{ id: 'L1' }, { id: 'L2' }],
      serviceRows: [
        { id: 'A', line_id: 'L1' },
        { id: 'B', line_id: 'L1' },
        { id: 'C', line_id: 'L2' },
        { id: 'D', line_id: 'L2' },
      ],
    } as TopologyRows;
    const selected = {
      linesRows: full.linesRows,
      serviceRows: full.serviceRows.filter((service) => service.id !== 'D'),
    };

    expect(completeLineIdsFromInputs(full, selected)).toEqual(['L1']);
  });

  it('does not claim coverage for a line without services', () => {
    const full = {
      linesRows: [{ id: 'empty' }, { id: 'active' }],
      serviceRows: [{ id: 'A', line_id: 'active' }],
    } as TopologyRows;

    expect(completeLineIdsFromInputs(full, full)).toEqual(['active']);
  });
});
