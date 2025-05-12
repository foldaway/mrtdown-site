import type React from 'react';
import { createIntl, FormattedMessage } from 'react-intl';
import type { Route } from './+types/($lang).about';
import type { SitemapFunction } from 'remix-sitemap';
import { LANGUAGES_NON_DEFAULT } from '~/constants';

export function headers() {
  return {
    'Cache-Control': 'max-age=60, s-maxage=60',
  };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { lang = 'en-SG' } = params;
  const rootUrl = context.cloudflare.env.ROOT_URL;
  const { default: messages } = await import(`../../lang/${lang}.json`);

  const intl = createIntl({
    locale: lang,
    messages,
  });

  const title = `${intl.formatMessage({
    id: 'general.about',
    defaultMessage: 'About',
  })} | mrtdown`;

  return {
    title,
    rootUrl,
  };
}

export const meta: Route.MetaFunction = ({ data, location }) => {
  const { title, rootUrl } = data;

  const ogUrl = new URL(location.pathname, rootUrl).toString();
  const ogImage = new URL('/og_image.png', rootUrl).toString();

  return [
    {
      title,
    },
    {
      property: 'og:title',
      content: title,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      property: 'og:url',
      content: ogUrl,
    },
    {
      property: 'og:image',
      content: ogImage,
    },
  ];
};

export const sitemap: SitemapFunction = async ({ config }) => {
  return [
    {
      loc: '/about',
      alternateRefs: LANGUAGES_NON_DEFAULT.map((lang) => {
        return {
          href: new URL(`/${lang}`, config.siteUrl).toString(),
          hreflang: lang,
        };
      }),
    },
  ];
};

const AboutPage: React.FC = () => (
  <div className="flex w-full flex-col items-center py-8">
    <div className="flex w-full flex-col">
      <h2 className="mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
        <FormattedMessage id="about.our_mission" defaultMessage="Our Mission" />
      </h2>

      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="about.mission_1"
          defaultMessage="mrtdown is dedicated to providing objective, data-driven insights into public transportation reliability and performance patterns. We believe that transparent data can contribute to meaningful conversations about infrastructure, maintenance, and investment in Singapore's public transport network."
        />
      </p>
      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="about.mission_2"
          defaultMessage="Our goal is not to criticise but to inform, enabling fact-based discussions that can ultimately lead to improvements benefitting all commuters."
        />
      </p>

      <h2 className="mt-4 mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
        <FormattedMessage
          id="about.how_we_collect_data"
          defaultMessage="How We Collect Data"
        />
      </h2>

      <h3 className="mb-1 font-bold text-gray-600 text-lg dark:text-gray-400">
        <FormattedMessage
          id="about.data_sources"
          defaultMessage="Data Sources"
        />
      </h3>

      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="about.data_sources_1"
          defaultMessage="Our incident data is collected by monitoring official SMRT and SBS Transit Twitter accounts for service announcements and updates."
        />
      </p>

      <h3 className="mb-1 font-bold text-gray-600 text-lg dark:text-gray-400">
        <FormattedMessage
          id="about.processing_methodology"
          defaultMessage="Processing Methodology"
        />
      </h3>

      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        <FormattedMessage
          id="about.processing_methodology_1"
          defaultMessage="We employ a hybrid approach combining machine learning (GPT-4o mini) for initial data extraction and human verification to ensure accuracy. Every incident is reviewed before being published to our platform."
        />
      </p>

      <h2 className="mt-4 mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
        <FormattedMessage
          id="about.faq"
          defaultMessage="Frequently Asked Questions"
        />
      </h2>

      <div className="flex flex-col gap-y-3">
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            <FormattedMessage
              id="about.qn_1_title"
              defaultMessage="Is this an official SMRT or SBS Transit website?"
            />
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            <FormattedMessage
              id="about.qn_1_answer"
              defaultMessage="No, this is an independent platform created for data analytics purposes. We are not affiliated with, endorsed by, or connected to SMRT, SBS Transit, or any other public transport operator in Singapore."
            />
          </p>
        </details>
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            <FormattedMessage
              id="about.qn_2_title"
              defaultMessage="How accurate is the data?"
            />
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            <FormattedMessage
              id="about.qn_2_answer"
              defaultMessage="All incident data is sourced from official operator announcements and processed on a best-effort basis. While human verification is conducted, we cannot guarantee 100% accuracy or completeness of the information. Users may utilize our data for real-time planning, but we are not responsible for any inaccuracies or decisions made based on this information."
            />
          </p>
        </details>
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            <FormattedMessage
              id="about.qn_3_title"
              defaultMessage="Can I use this data for my own research or projects?"
            />
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            <FormattedMessage
              id="about.qn_3_answer"
              defaultMessage="Yes, all data is available on GitHub."
            />
            <a
              className="text-blue-500 underline"
              href="https://github.com/foldaway/mrtdown-data"
            >
              GitHub
            </a>
          </p>
        </details>
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            <FormattedMessage
              id="about.qn_4_title"
              defaultMessage="How can I report an error in the data?"
            />
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            <FormattedMessage
              id="about.qn_4_answer"
              defaultMessage="Please file an issue on GitHub."
            />
            <a
              className="text-blue-500 underline"
              href="https://github.com/foldaway/mrtdown-data"
            >
              GitHub
            </a>
          </p>
        </details>
      </div>
    </div>
  </div>
);

export default AboutPage;
