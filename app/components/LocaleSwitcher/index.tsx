import classNames from 'classnames';
import type React from 'react';
import { useIntl } from 'react-intl';
import { NavLink, type NavLinkProps, useLocation } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { LOCALES } from './constants';

const navLinkClassNameFunction: NavLinkProps['className'] = ({ isActive }) => {
  return classNames('text-xs hover:text-blue-400', {
    'text-blue-400 font-medium': isActive,
    'text-gray-300': !isActive,
  });
};

export const LocaleSwitcher: React.FC = () => {
  const location = useLocation();
  const intl = useIntl();

  return (
    <div className="flex flex-col items-start justify-center gap-y-2">
      {LOCALES.map((locale) => (
        <NavLink
          key={locale}
          to={buildLocaleAwareLink(
            location.pathname.replace(`/${intl.locale}`, ''),
            locale,
          )}
          className={navLinkClassNameFunction}
        >
          {new Intl.DisplayNames(locale, {
            type: 'language',
          }).of(locale)}
        </NavLink>
      ))}
    </div>
  );
};
