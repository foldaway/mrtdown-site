import { createFileRoute } from '@tanstack/react-router';
import { createIntl, FormattedMessage } from 'react-intl';
import { buildSeoMetadata } from '~/helpers/seo';

export const Route = createFileRoute('/{-$lang}/about')({
  component: AboutPage,
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;
    const { default: messages } = await import(`../../../lang/${lang}.json`);

    const rootUrl = import.meta.env.VITE_ROOT_URL;

    const seo = buildSeoMetadata({ lang, path: '/about', rootUrl });

    const intl = createIntl({
      locale: lang,
      messages,
    });

    const title = intl.formatMessage({
      id: 'site.about.page_title',
      defaultMessage: 'About mrtdown: Data Sources and Methodology',
    });
    const description = intl.formatMessage({
      id: 'site.about.page_description',
      defaultMessage:
        'Learn how mrtdown processes canonical Singapore MRT and LRT data, separates community reports from official advisories, and maintains its independent service record.',
    });

    return {
      links: seo.links,
      meta: [
        {
          title,
        },
        {
          name: 'description',
          content: description,
        },
        {
          property: 'og:title',
          content: title,
        },
        {
          property: 'og:description',
          content: description,
        },
        {
          property: 'og:type',
          content: 'website',
        },
        {
          property: 'og:url',
          content: seo.ogUrl,
        },
        {
          property: 'og:image',
          content: seo.ogImage,
        },
        {
          name: 'twitter:title',
          content: title,
        },
        {
          name: 'twitter:description',
          content: description,
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'AboutPage',
            name: title,
            description,
            url: seo.canonicalUrl,
            image: seo.ogImage,
            inLanguage: lang,
          },
        },
      ],
    };
  },
});

function AboutPage() {
  return (
    <div className="flex flex-col space-y-8">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-bold text-gray-900 text-xl leading-tight sm:text-2xl dark:text-gray-100">
          <FormattedMessage id="general.about" defaultMessage="About" />
        </h1>
        <p className="mx-auto max-w-2xl text-gray-600 text-xs leading-4 sm:text-sm sm:leading-5 dark:text-gray-400">
          <FormattedMessage
            id="site.about.subtitle"
            defaultMessage="Independent, data-driven tracking of Singapore MRT and LRT service reliability."
          />
        </p>
      </header>
      <div className="flex w-full flex-col">
        <h2 className="mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
          <FormattedMessage
            id="about.our_mission"
            defaultMessage="Our Mission"
          />
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
            defaultMessage="How the Data Works"
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
            defaultMessage="mrtdown reads service status, disruption, maintenance, and rail-network data from canonical mrtdown data archives. Singapore public-holiday data from data.gov.sg is also used when calculating operating schedules."
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
            defaultMessage="Scheduled workflows fetch each archive, validate and stage its records, then promote changes into a normalized PostgreSQL/PostGIS read model. The site serves its pages from this local database."
          />
        </p>

        <h3 className="mb-1 font-bold text-gray-600 text-lg dark:text-gray-400">
          <FormattedMessage
            id="about.community_reports"
            defaultMessage="Community Reports"
          />
        </h3>

        <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
          <FormattedMessage
            id="about.community_reports_1"
            defaultMessage="Community reports remain separate from official operator advisories. Automated moderation may merge, accept, or reject submissions before eligible evidence is sent to the canonical data workflow."
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
                defaultMessage="Canonical incident records are maintained on a best-effort basis, and the site may lag behind source updates. Community reports are displayed separately and should not be treated as official alerts. We cannot guarantee accuracy or completeness; confirm time-sensitive travel decisions with the relevant operator."
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
}
