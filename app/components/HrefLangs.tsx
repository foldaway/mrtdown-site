import type React from 'react';
import { useLocation, useParams } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { LOCALES } from './LocaleSwitcher/constants';

export const HrefLangs: React.FC = () => {
  const location = useLocation();
  const { lang = 'en-SG' } = useParams();

  return (
    <>
      {LOCALES.map((locale) => (
        <link
          key={locale}
          rel="alternate"
          hrefLang={locale}
          href={buildLocaleAwareLink(
            location.pathname.replace(`/${lang}`, ''),
            locale,
          )}
        />
      ))}
    </>
  );
};
