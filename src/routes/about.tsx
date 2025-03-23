import type React from 'react';

const AboutPage: React.FC = () => (
  <div className="flex w-full flex-col items-center py-8">
    <div className="flex w-full flex-col">
      <h2 className="mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
        Our Mission
      </h2>

      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        mrtdown is dedicated to providing objective, data-driven insights into
        public transportation reliability and performance patterns. We believe
        that transparent data can contribute to meaningful conversations about
        infrastructure, maintenance, and investment in Singapore's public
        transport network.
      </p>
      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        Our goal is not to criticise but to inform, enabling fact-based
        discussions that can ultimately lead to improvements benefitting all
        commuters.
      </p>

      <h2 className="mt-4 mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
        How We Collect Data
      </h2>

      <h3 className="mb-1 font-bold text-gray-600 text-lg dark:text-gray-400">
        Data Sources
      </h3>

      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        Our incident data is collected by monitoring official SMRT and SBS
        Transit Twitter accounts for service announcements and updates.
      </p>

      <h3 className="mb-1 font-bold text-gray-600 text-lg dark:text-gray-400">
        Processing Methodology
      </h3>

      <p className="mb-2 text-gray-600 text-sm dark:text-gray-400">
        We employ a hybrid approach combining machine learning (GPT-4o mini) for
        initial data extraction and human verification to ensure accuracy. Every
        incident is reviewed before being published to our platform.
      </p>

      <h2 className="mt-4 mb-2 font-bold text-gray-800 text-xl dark:text-gray-200">
        Frequently Asked Questions
      </h2>

      <div className="flex flex-col gap-y-3">
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            Is this an official SMRT or SBS Transit website?
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            No, this is an independent platform created for data analytics
            purposes. We are not affiliated with, endorsed by, or connected to
            SMRT, SBS Transit, or any other public transport operator in
            Singapore.
          </p>
        </details>
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            How accurate is the data?
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            All incident data is sourced from official operator announcements
            and processed on a best-effort basis. While human verification is
            conducted, we cannot guarantee 100% accuracy or completeness of the
            information. Users may utilize our data for real-time planning, but
            we are not responsible for any inaccuracies or decisions made based
            on this information.
          </p>
        </details>
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            Can I use this data for my own research or projects?
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            Yes, all data is available on{' '}
            <a
              className="text-blue-500 underline"
              href="https://github.com/foldaway/mrtdown-data"
            >
              GitHub
            </a>
            .
          </p>
        </details>
        <details>
          <summary className="text-gray-800 text-sm hover:bg-gray-300 dark:text-gray-200 dark:hover:bg-gray-800">
            How can I report an error in the data?
          </summary>
          <p className="ms-3 mt-1 mb-2 text-gray-600 text-sm dark:text-gray-400">
            Please file an issue on{' '}
            <a
              className="text-blue-500 underline"
              href="https://github.com/foldaway/mrtdown-data"
            >
              GitHub
            </a>
            .
          </p>
        </details>
      </div>
    </div>
  </div>
);

export const Component = AboutPage;
