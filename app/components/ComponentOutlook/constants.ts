import { defineMessage, type MessageDescriptor } from 'react-intl';
import type { ComponentStatusSummaryDayType } from '~/client';

export const DAY_TYPE_MESSAGE_DESCRIPTORS: Record<
  ComponentStatusSummaryDayType,
  MessageDescriptor
> = {
  weekday: defineMessage({
    id: 'general.weekday',
    defaultMessage: 'Weekday',
  }),
  weekend: defineMessage({
    id: 'general.weekend',
    defaultMessage: 'Weekend',
  }),
  public_holiday: defineMessage({
    id: 'general.public_holiday',
    defaultMessage: 'Public Holiday',
  }),
};
