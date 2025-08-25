import { createContext, useContext } from 'react';
import type { IncludedEntities } from '~/client';
import { assert } from '~/util/assert';

export const IncludedEntitiesContext = createContext<IncludedEntities | null>(
  null,
);

export function useIncludedEntities() {
  const value = useContext(IncludedEntitiesContext);
  assert(value != null, 'IncludedEntitiesContext must be provided');
  return value;
}
