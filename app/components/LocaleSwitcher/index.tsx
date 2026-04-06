import { Link, useLocation } from '@tanstack/react-router';
import classNames from 'classnames';
import type React from 'react';
import { useIntl } from 'react-intl';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { LOCALES } from './constants';

const activeClassName = classNames(
  'text-xs transition-colors hover:text-blue-400 text-blue-400 font-medium',
);
const inactiveClassName = classNames(
  'text-xs transition-colors hover:text-blue-400 text-gray-300',
);

export const LocaleSwitcher: React.FC = () => {
  const location = useLocation();
  const intl = useIntl();

  return (
    <div className="flex flex-col items-start justify-center gap-y-2">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          to={buildLocaleAwareLink(
            location.pathname.replace(`/${intl.locale}`, ''),
            locale,
          )}
          activeProps={{ className: activeClassName }}
          inactiveProps={{ className: inactiveClassName }}
        >
          {new Intl.DisplayNames(locale, {
            type: 'language',
          }).of(locale)}
        </Link>
      ))}
    </div>
  );
};
