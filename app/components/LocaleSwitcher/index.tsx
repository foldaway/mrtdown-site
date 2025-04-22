import classNames from 'classnames';
import type React from 'react';
import { useIntl } from 'react-intl';
import { NavLink, useLocation, type NavLinkProps } from 'react-router';
import { LOCALES } from './constants';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

const navLinkClassNameFunction: NavLinkProps['className'] = ({ isActive }) => {
  return classNames(
    'text-center rounded-md px-4 py-1 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-800',
    {
      'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-200': isActive,
      'text-gray-600 dark:text-gray-400': !isActive,
    },
  );
};

export const LocaleSwitcher: React.FC = () => {
  const location = useLocation();
  const intl = useIntl();

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:flex-row">
      {LOCALES.map((locale) => (
        <NavLink
          key={locale}
          to={buildLocaleAwareLink(
            location.pathname.replace(`/${intl.locale}`, ''),
            locale === 'en-SG' ? undefined : locale,
          )}
          className={navLinkClassNameFunction}
        >
          {new Intl.DisplayNames(locale, { type: 'language' }).of(locale)}
        </NavLink>
      ))}
    </div>
  );
};
