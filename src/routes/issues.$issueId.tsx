import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import type { Issue } from '../types';
import { IssueViewer } from '../components/IssueViewer';
import { IssueSkeleton } from '../components/IssueSkeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const IssuePage: React.FC = () => {
  const { issueId } = useParams();

  const { isLoading, error, data } = useQuery<Issue>({
    queryKey: ['issues', issueId],
    queryFn: () =>
      fetch(
        `https://data.mrtdown.foldaway.space/source/issue/${issueId}.json`,
      ).then((r) => r.json()),
  });

  useDocumentTitle(`${data != null ? data.title : 'Issue'} | mrtdown`);

  return (
    <div className="flex flex-col">
      {error != null && (
        <span className="text-red-500 text-sm">{error.message}</span>
      )}
      {isLoading && <IssueSkeleton />}
      {data != null && <IssueViewer issue={data} />}
    </div>
  );
};

export const Component = IssuePage;
