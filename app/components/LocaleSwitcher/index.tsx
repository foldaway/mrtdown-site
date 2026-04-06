import { Link } from '@tanstack/react-router';
import classNames from 'classnames';
import type React from 'react';
import { LOCALES } from './constants';

export const LocaleSwitcher: React.FC = () => {
  return (
    <div className="flex flex-col items-start justify-center gap-y-2">
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          to="."
          params={{ lang: locale }}
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
