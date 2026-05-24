import { createContext, useContext } from 'react';

export const CrowdReportsFeatureContext = createContext(false);

export function useCrowdReportsFeatureEnabled() {
  return useContext(CrowdReportsFeatureContext);
}
