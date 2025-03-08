import { DateTime } from 'luxon';
import type { IssuesHistoryPage } from '../../types';
import { IssueRefViewer } from './components/IssueRefViewer';

interface Props {
  page: IssuesHistoryPage;
}

export const IssuesHistoryPageViewer: React.FC<Props> = (props) => {
  const { page } = props;

  return (
    <div className="flex flex-col gap-y-8">
      {page.sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-y-2">
          <span className="font-bold text-gray-700 text-lg dark:text-gray-50">
            {DateTime.fromISO(section.sectionStartAt).toFormat('MMMM yyyy')}
          </span>
          {section.issueRefs.map((issueRef) => (
            <IssueRefViewer key={issueRef.id} issueRef={issueRef} />
          ))}
        </div>
      ))}
    </div>
  );
};
