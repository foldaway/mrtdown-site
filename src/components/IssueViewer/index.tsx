import type { Issue } from '../../types';
import { Infra } from './components/Infra';
import { Maintenance } from './components/Maintenance';
import { Disruption } from './components/Disruption';

interface Props {
  issue: Issue;
}

export const IssueViewer: React.FC<Props> = (props) => {
  const { issue } = props;

  switch (issue.type) {
    case 'disruption': {
      return <Disruption issue={issue} />;
    }
    case 'maintenance': {
      return <Maintenance issue={issue} />;
    }
    case 'infra': {
      return <Infra issue={issue} />;
    }
  }
};
