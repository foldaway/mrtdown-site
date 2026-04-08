import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import type { IncludedEntities, Issue } from '~/client';

interface UseDayIssuesReturn {
  issues: Issue[];
  included: IncludedEntities | null;
  isLoading: boolean;
  error: Error | null;
}

export const useDayIssues = (dateString: string | null): UseDayIssuesReturn => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [included, setIncluded] = useState<IncludedEntities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!dateString) {
      setIssues([]);
      setIncluded(null);
      return;
    }

    const fetchIssues = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const date = DateTime.fromISO(dateString);
        const year = date.toFormat('yyyy');
        const month = date.toFormat('MM');
        const day = date.toFormat('dd');

        const params = new URLSearchParams({
          year,
          month,
          day,
        });

        const response = await fetch(`/api/issues-day?${params}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data?.issueIds) {
          const issueList: Issue[] = result.data.issueIds
            .map((issueId: string) => result.included?.issues?.[issueId])
            .filter((issue: Issue | undefined): issue is Issue => issue != null)
            .filter((issue: Issue) => issue.type === 'disruption');

          setIssues(issueList);
          setIncluded(result.included ?? null);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchIssues();
  }, [dateString]);

  return { issues, included, isLoading, error };
};
