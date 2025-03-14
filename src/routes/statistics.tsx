import { useDocumentTitle } from '../hooks/useDocumentTitle';

const StatisticsPage: React.FC = () => {
  useDocumentTitle('Statistics | mrtdown');

  return (
    <div className="flex flex-col">
      <span className="text-center text-gray-900 text-sm italic dark:text-gray-50">
        Work in progress, stay tuned!
      </span>
    </div>
  );
};

export const Component = StatisticsPage;
