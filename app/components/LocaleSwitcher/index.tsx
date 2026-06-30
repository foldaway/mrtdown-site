import { Link, useRouterState } from '@tanstack/react-router';
import classNames from 'classnames';
import type React from 'react';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { LOCALES } from './constants';
import { removeLocalePrefix } from './helpers';

export const LocaleSwitcher: React.FC = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const pathWithoutLocale = removeLocalePrefix(pathname);

  return (
    <div className="flex flex-col items-start justify-center gap-y-2">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          to={buildLocaleAwareLink(pathWithoutLocale, locale)}
          className={classNames(
            'font-medium text-gray-300 text-xs transition-colors hover:text-blue-400 [&.active]:text-blue-400',
          )}
        >
          {new Intl.DisplayNames(locale, {
            type: 'language',
          }).of(locale)}
        </Link>
      ))}
    </div>
  );
};
