import type { Route } from './+types/($lang).stations.$stationId';
import { assert } from '../util/assert';
import type { StationManifest } from '~/types';
import { ComponentBar } from '~/components/ComponentBar';
import { FormattedMessage, useIntl } from 'react-intl';
import { IssueRefViewer } from '~/components/IssuesHistoryPageViewer/components/IssueRefViewer';
import { useMemo } from 'react';

export async function loader({ params }: Route.LoaderArgs) {
  const { stationId } = params;

  const res = await fetch(
    `https://data.mrtdown.foldaway.space/product/station_${stationId}.json`,
  );
  assert(res.ok, res.statusText);
  const stationManifest: StationManifest = await res.json();
  return stationManifest;
}

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export const meta: Route.MetaFunction = ({ params, data }) => {
  const { lang = 'en-SG' } = params;

  return [
    {
      title: `${data.station.name_translations[lang] ?? data.station.name} | mrtdown`,
    },
  ];
};

const StationPage: React.FC<Route.ComponentProps> = (props) => {
  const { loaderData } = props;
  const { station } = loaderData;

  const intl = useIntl();

  const stationName = useMemo(() => {
    return station.name_translations[intl.locale] ?? station.name;
  }, [station, intl.locale]);

  const stationCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const members of Object.values(station.componentMembers)) {
      for (const member of members) {
        codes.add(member.code);
      }
    }
    return Array.from(codes);
  }, [station.componentMembers]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-x-2">
        <ComponentBar
          componentIds={Object.keys(loaderData.station.componentMembers)}
        />
        <span className="font-bold text-gray-800 text-xl dark:text-gray-100">
          {stationName}
        </span>
      </div>

      <span className="mt-1 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="general.station_description"
          defaultMessage="{stationName} is served by {lines}, with station codes {stationCodes}."
          values={{
            stationName,
            lines: intl.formatList(
              Object.keys(loaderData.station.componentMembers),
            ),
            stationCodes: intl.formatList(stationCodes),
          }}
        />
      </span>

      <h2 className="mt-4 font-bold text-gray-800 text-lg dark:text-gray-100">
        <FormattedMessage
          id="general.issues_with_count"
          defaultMessage="Issues ({count})"
          values={{
            count: loaderData.issueRefs.length,
          }}
        />
      </h2>
      <div className="mt-1 flex flex-col gap-y-2">
        {loaderData.issueRefs.map((issueRef) => (
          <IssueRefViewer key={issueRef.id} issueRef={issueRef} />
        ))}
      </div>
    </div>
  );
};

export default StationPage;
