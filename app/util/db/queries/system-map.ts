import { getOverviewData } from './overview';

export async function getSystemMapData() {
  const overview = await getOverviewData(30);
  return {
    overview: overview.data,
    included: overview.included,
  };
}
