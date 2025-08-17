import type { Issue } from '~/client';

interface Props {
  issue: Issue;
}

export const DescriptionCard: React.FC<Props> = () => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="font-medium text-gray-900 text-lg dark:text-gray-100">
        Description
      </h2>
      <p className="mt-4 text-gray-600 dark:text-gray-300">
        This is a placeholder for the description of the issue. Detailed
        information about the issue will be displayed here.
      </p>
    </div>
  );
};
