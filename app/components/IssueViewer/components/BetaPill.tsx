import type React from 'react';
import { FormattedMessage } from 'react-intl';

export const BetaPill: React.FC = () => (
  <div className="rounded bg-gray-300 px-2 py-1 text-gray-500 text-xs dark:bg-gray-700 dark:text-gray-400">
    <FormattedMessage id="general.beta" defaultMessage="Beta" />
  </div>
);
