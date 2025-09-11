import classNames from 'classnames';
import { FormattedMessage } from 'react-intl';
import type { IssueSubtype, IssueType } from '~/client';
import { IssueSubtypeLabels } from '~/constants';

interface Props {
  type: IssueType;
  subtype: IssueSubtype;
}

export const IssueSubtypeBadge: React.FC<Props> = (props) => {
  const { type, subtype } = props;

  return (
    <span
      key={subtype}
      className={classNames(
        'inline-flex items-center rounded border border-dashed px-1.5 py-0.5 font-normal text-xs',
        {
          'border-disruption-light/40 bg-disruption-light/10 text-disruption-light dark:border-disruption-dark/60 dark:text-disruption-dark':
            type === 'disruption',
          'border-maintenance-light/40 bg-maintenance-light/10 text-maintenance-light dark:border-maintenance-dark/60 dark:text-maintenance-dark':
            type === 'maintenance',
          'border-infra-light/40 bg-infra-light/10 text-infra-light dark:border-infra-dark/60 dark:text-infra-dark':
            type === 'infra',
        },
      )}
    >
      <FormattedMessage {...IssueSubtypeLabels[subtype]} />
    </span>
  );
};
