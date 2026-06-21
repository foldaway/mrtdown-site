import { BeakerIcon } from '@heroicons/react/24/outline';
import { FormattedMessage } from 'react-intl';

export function BetaBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800 text-xs ring-1 ring-sky-600/20 ring-inset dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-400/30">
      <BeakerIcon className="size-3" />
      <FormattedMessage id="general.beta" defaultMessage="Beta" />
    </span>
  );
}
