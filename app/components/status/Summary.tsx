import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  CogIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import classNames from 'classnames';
import { DateTime, Duration } from 'luxon';
import type React from 'react';
import { useMemo } from 'react';
import { FormattedMessage, FormattedNumber } from 'react-intl';
import type { Component, DateSummary, IssueRef } from '~/types';
import { assert } from '~/util/assert';
import { computeStatus } from '../ComponentOutlook/helpers/computeStatus';

interface Props {
  component: Component;
  dates: Record<string, DateSummary>;
  issuesOngoing: IssueRef[];
}

export const Summary: React.FC<Props> = (props) => {
  const { component, dates, issuesOngoing } = props;

  const now = useMemo(() => DateTime.now(), []);
  const serviceStartToday = useMemo(
    () => now.set({ hour: 5, minute: 30 }),
    [now],
  );

  const isComponentInService = useMemo(() => {
    const componentStartedAtDateTime = DateTime.fromISO(component.startedAt);
    return componentStartedAtDateTime < now;
  }, [now, component]);

  const statusToday = useMemo(() => {
    const nowIsoDate = now.toISODate();
    assert(nowIsoDate != null);

    if (!isComponentInService) {
      return 'not in service';
    }

    if (now < serviceStartToday) {
      return 'service ended';
    }

    if (issuesOngoing.length === 0) {
      return 'operational';
    }

    return computeStatus(issuesOngoing) ?? 'operational';
  }, [now, serviceStartToday, issuesOngoing, isComponentInService]);

  const uptime = useMemo(() => {
    // Account for service hours, 5:30 AM - 12 midnight
    const todayServiceHours = Duration.fromObject({
      hours: 18.5,
    }).rescale();

    const dateSummary = dates[now.toISODate()] ?? {
      issueTypesDurationMs: 0,
      issueTypesIntervalsNoOverlapMs: {},
      issues: [],
      componentIdsIssueTypesDurationMs: {},
      componentIdsIssueTypesIntervalsNoOverlapMs: {},
    };

    let downtimeDuration = Duration.fromObject({ milliseconds: 0 });

    for (const durationMs of Object.values(dateSummary.issueTypesDurationMs)) {
      downtimeDuration = downtimeDuration.plus({
        milliseconds: durationMs,
      });
    }

    const percentage =
      downtimeDuration.toMillis() / todayServiceHours.toMillis();
    return percentage;
  }, [dates, now]);

  return (
    <div
      className={classNames(
        'flex flex-col items-center justify-center rounded-lg border py-2',
        {
          'border-disruption-light/50 bg-disruption-light/20 dark:border-disruption-dark/50 dark:bg-disruption-dark/20':
            statusToday === 'disruption',
          'border-maintenance-light/50 bg-maintenance-light/20 dark:border-maintenance-dark/50 dark:bg-maintenance-dark/20':
            statusToday === 'maintenance',
          'border-infra-light/50 bg-infra-light/20 dark:border-infra-dark/50 dark:bg-infra-dark/20':
            statusToday === 'infra',
          'border-operational-light/50 bg-operational-light/20 dark:border-operational-dark/50 dark:bg-operational-dark/20':
            statusToday === 'operational',
          'border-gray-400 bg-gray-200 dark:border-gray-500 dark:bg-gray-700':
            statusToday === 'service ended' || statusToday === 'not in service',
        },
      )}
    >
      {statusToday === 'disruption' && (
        <ExclamationTriangleIcon className="size-10 text-disruption-light dark:text-disruption-dark" />
      )}
      {statusToday === 'maintenance' && (
        <CogIcon className="size-10 text-maintenance-light dark:text-maintenance-dark" />
      )}
      {statusToday === 'infra' && (
        <BuildingOffice2Icon className="size-10 text-infra-light dark:text-infra-dark" />
      )}
      {statusToday === 'operational' && (
        <CheckCircleIcon className="size-10 text-operational-light dark:text-operational-dark" />
      )}
      {statusToday === 'service ended' && (
        <ClockIcon className="size-10 text-gray-400 dark:text-gray-600" />
      )}
      {statusToday === 'not in service' && (
        <NoSymbolIcon className="size-10 text-gray-400 dark:text-gray-600" />
      )}

      <span className="font-bold text-gray-700 text-xl dark:text-gray-100">
        {statusToday === 'disruption' && (
          <FormattedMessage
            id="general.disruption"
            defaultMessage="Disruption"
          />
        )}{' '}
        {statusToday === 'maintenance' && (
          <FormattedMessage
            id="general.maintenance"
            defaultMessage="Maintenance"
          />
        )}
        {statusToday === 'infra' && (
          <FormattedMessage
            id="general.infrastructure"
            defaultMessage="Infrastructure"
          />
        )}
        {statusToday === 'operational' && (
          <FormattedMessage
            id="status.operational"
            defaultMessage="Operational"
          />
        )}
        {statusToday === 'service ended' && (
          <FormattedMessage
            id="status.service_ended"
            defaultMessage="Service Ended"
          />
        )}
        {statusToday === 'not in service' && (
          <FormattedMessage
            id="status.not_in_service"
            defaultMessage="Not in Service"
          />
        )}
      </span>

      <span
        className={classNames(
          'mt-1 rounded-lg bg-gray-100 px-2 py-0.5 text-xs',
          {
            'bg-disruption-light/20 dark:bg-disruption-dark/20':
              statusToday === 'disruption',
            'bg-maintenance-light/20 dark:bg-maintenance-dark/20':
              statusToday === 'maintenance',
            'bg-infra-light/20 dark:bg-infra-dark/20': statusToday === 'infra',
            'bg-operational-light/20 dark:bg-operational-dark/20':
              statusToday === 'operational',
            ' bg-gray-400 dark:bg-gray-700': statusToday === 'service ended',
            hidden: statusToday === 'not in service',
          },
        )}
      >
        <FormattedMessage
          id="general.uptime_percent_display_today"
          defaultMessage="{percent} uptime today"
          values={{
            percent: (
              <FormattedNumber
                value={1 - uptime}
                style="percent"
                maximumFractionDigits={2}
              />
            ),
          }}
        />
      </span>
    </div>
  );
};
