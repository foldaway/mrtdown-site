import { defineMessages } from 'react-intl';

export const weeklyMessages = defineMessages({
  title: {
    id: 'weekly.title',
    defaultMessage: 'MRT Weekly Report: {week} | mrtdown',
  },
  description: {
    id: 'weekly.description',
    defaultMessage:
      'Weekly disruption totals, affected lines and maintenance on Singapore’s MRT and LRT network for {dates}.',
  },
  nav: { id: 'weekly.nav', defaultMessage: 'Report weeks' },
  prev: { id: 'weekly.prev', defaultMessage: '← Previous week' },
  latest: { id: 'weekly.latest', defaultMessage: 'Latest complete week' },
  next: { id: 'weekly.next', defaultMessage: 'Next week →' },
  current: { id: 'weekly.current', defaultMessage: 'Current week' },
  choose: { id: 'weekly.choose', defaultMessage: 'Choose a date in the week' },
  view: { id: 'weekly.view', defaultMessage: 'View report' },
  eyebrow: {
    id: 'weekly.eyebrow',
    defaultMessage: 'mrtdown · The weekly brief',
  },
  heading: { id: 'weekly.heading', defaultMessage: 'Your week on the rails.' },
  subtitle: {
    id: 'weekly.subtitle',
    defaultMessage: '{dates}',
  },
  partial: {
    id: 'weekly.partial',
    defaultMessage:
      'This week is still underway. We compare it with the same point last week.',
  },
  recap: { id: 'weekly.recap', defaultMessage: 'The week at a glance' },
  quiet: {
    id: 'weekly.quiet',
    defaultMessage:
      'No disruptions were recorded on Singapore’s MRT and LRT network from {dates}.',
  },
  summary: {
    id: 'weekly.summary',
    defaultMessage:
      'From {dates}, we recorded {count, plural, one {# disruption} other {# disruptions}} on Singapore’s MRT and LRT network, lasting {duration} in total.',
  },
  longest: {
    id: 'weekly.longest',
    defaultMessage:
      'The longest disruption was “{title}”, lasting {duration} within the week.',
  },
  countComparison: {
    id: 'weekly.countComparison',
    defaultMessage:
      '{direction, select, same {The disruption count matched the previous week.} more {{count, plural, one {There was # more disruption than the previous week.} other {There were # more disruptions than the previous week.}}} other {{count, plural, one {There was # fewer disruption than the previous week.} other {There were # fewer disruptions than the previous week.}}}}',
  },
  timeComparison: {
    id: 'weekly.timeComparison',
    defaultMessage:
      '{direction, select, same {Total disruption time was unchanged.} more {Total disruption time rose by {duration}.} other {Total disruption time fell by {duration}.}}',
  },
  partialComparison: {
    id: 'weekly.partialComparison',
    defaultMessage:
      'Compared with the same point last week: {countChange}; {timeChange}.',
  },
  maintenance: {
    id: 'weekly.maintenance',
    defaultMessage:
      'The week also included {count, plural, one {# planned maintenance event} other {# planned maintenance events}}.',
  },
  infra: {
    id: 'weekly.infra',
    defaultMessage:
      '{count, plural, one {# infrastructure issue was} other {# infrastructure issues were}} active during the week.',
  },
  disruptions: { id: 'weekly.disruptions', defaultMessage: 'Disruptions' },
  totalTime: {
    id: 'weekly.totalTime',
    defaultMessage: 'Total disruption time',
  },
  affected: { id: 'weekly.affected', defaultMessage: 'Lines affected' },
  countChange: {
    id: 'weekly.countChange',
    defaultMessage:
      '{direction, select, same {Unchanged from last week} more {{count, number} more than last week} other {{count, number} fewer than last week}}',
  },
  timeChange: {
    id: 'weekly.timeChange',
    defaultMessage:
      '{direction, select, same {Unchanged from last week} more {{duration} more than last week} other {{duration} less than last week}}',
  },
  daily: { id: 'weekly.daily', defaultMessage: 'How the week unfolded' },
  byDay: { id: 'weekly.byDay', defaultMessage: 'Disruptions by day' },
  network: { id: 'weekly.network', defaultMessage: 'Across the network' },
  noLines: {
    id: 'weekly.noLines',
    defaultMessage: 'No disruptions were recorded on any line this week.',
  },
  caption: {
    id: 'weekly.caption',
    defaultMessage:
      'Lines affected by recorded disruptions, longest total duration first',
  },
  line: { id: 'weekly.line', defaultMessage: 'Line' },
  duration: { id: 'weekly.duration', defaultMessage: 'Duration' },
  happened: { id: 'weekly.happened', defaultMessage: 'What happened' },
  order: { id: 'weekly.order', defaultMessage: 'Longest disruptions first' },
  empty: {
    id: 'weekly.empty',
    defaultMessage: 'No disruptions were recorded this week.',
  },
  note: {
    id: 'weekly.note',
    defaultMessage:
      'Monday–Sunday, Singapore time. Based on recorded incidents; missing reports may leave gaps. Maintenance is counted separately.',
  },
  about: { id: 'weekly.about', defaultMessage: 'About these numbers' },
  method: {
    id: 'weekly.method',
    defaultMessage:
      'Each disruption counts once per week, even if it spans several days. We add up the time each disruption lasted within the week, so overlapping disruptions count separately. A disruption affecting several lines appears under each one. Total disruption time is not passenger delay. Past reports may change when records are corrected.',
  },
  updated: {
    id: 'weekly.updated',
    defaultMessage: 'Updated {date} (Singapore time).',
  },
  how: { id: 'weekly.how', defaultMessage: 'How we count' },
  link: { id: 'weekly.link', defaultMessage: 'Read the weekly MRT report →' },
  minutes: {
    id: 'weekly.minutes',
    defaultMessage: '{minutes, plural, one {# minute} other {# minutes}}',
  },
  hours: {
    id: 'weekly.hours',
    defaultMessage:
      '{hours, plural, one {# hour} other {# hours}} {minutes, plural, one {# minute} other {# minutes}}',
  },
  underMinute: {
    id: 'weekly.underMinute',
    defaultMessage: 'less than a minute',
  },
  archiveTitle: {
    id: 'weekly.archiveTitle',
    defaultMessage: 'MRT Weekly Reports | mrtdown',
  },
  archiveHeading: {
    id: 'weekly.archiveHeading',
    defaultMessage: 'The weekly archive',
  },
  archiveDescription: {
    id: 'weekly.archiveDescription',
    defaultMessage:
      'Browse weekly reports on Singapore’s MRT and LRT disruptions, maintenance and affected lines.',
  },
  archiveIntro: {
    id: 'weekly.archiveIntro',
    defaultMessage:
      'A week-by-week look at Singapore’s MRT and LRT network. Choose a report for disruption totals, incident details and comparisons with the week before.',
  },
  archiveLink: {
    id: 'weekly.archiveLink',
    defaultMessage: 'All weekly reports',
  },
  inProgress: { id: 'weekly.inProgress', defaultMessage: 'In progress' },
  archiveEmpty: {
    id: 'weekly.archiveEmpty',
    defaultMessage: 'No weekly reports are available yet.',
  },
  reportsTitle: {
    id: 'weekly.reportsTitle',
    defaultMessage: 'MRT & LRT Reports | mrtdown',
  },
  reportsHeading: { id: 'weekly.reportsHeading', defaultMessage: 'Reports' },
  reportsIntro: {
    id: 'weekly.reportsIntro',
    defaultMessage:
      'Regular reports on Singapore’s MRT and LRT disruptions, maintenance and affected lines.',
  },
  weeklyHeading: {
    id: 'weekly.weeklyHeading',
    defaultMessage: 'Weekly reports',
  },
  issueHeading: { id: 'weekly.issueHeading', defaultMessage: 'Week of {date}' },
  insightHeading: {
    id: 'weekly.insightHeading',
    defaultMessage: 'What stood out',
  },
  insightQuiet: {
    id: 'weekly.insightQuiet',
    defaultMessage: 'No disruptions were recorded this week.',
  },
  insightLonger: {
    id: 'weekly.insightLonger',
    defaultMessage:
      'Fewer disruptions were recorded than last week, but they lasted longer in total.',
  },
  insightShorter: {
    id: 'weekly.insightShorter',
    defaultMessage:
      'More disruptions were recorded than last week, but their total duration was shorter.',
  },
  insightLongerPartial: {
    id: 'weekly.insightLongerPartial',
    defaultMessage:
      'By this point in the week, fewer disruptions were recorded than at the same point last week, but their total duration was longer.',
  },
  insightShorterPartial: {
    id: 'weekly.insightShorterPartial',
    defaultMessage:
      'By this point in the week, more disruptions were recorded than at the same point last week, but their total duration was shorter.',
  },
  insightSingle: {
    id: 'weekly.insightSingle',
    defaultMessage: 'All recorded disruption time came from one incident.',
  },
  insightConcentrated: {
    id: 'weekly.insightConcentrated',
    defaultMessage:
      'One incident accounted for {percent, number}% of recorded disruption time.',
  },
  insightSpread: {
    id: 'weekly.insightSpread',
    defaultMessage:
      'Disruptions were recorded on {days, number} days, rather than being confined to one day.',
  },
  insightRecent: {
    id: 'weekly.insightRecent',
    defaultMessage:
      '{direction, select, above {The disruption count was above} below {The disruption count was below} other {The disruption count was close to}} the previous four-week average of {average} per week.',
  },
  readerSuspension: {
    id: 'weekly.readerSuspension',
    defaultMessage:
      'Recorded disruptions included suspended service on parts of {lines}.',
  },
  readerPeak: {
    id: 'weekly.readerPeak',
    defaultMessage:
      '{count, plural, one {One recorded disruption overlapped} other {# recorded disruptions overlapped}} weekday peak hours (7–9 am or 5–7 pm, Singapore time).',
  },
  readerLine: {
    id: 'weekly.readerLine',
    defaultMessage: 'Recorded disruptions were confined to {line}.',
  },
  readerNetwork: {
    id: 'weekly.readerNetwork',
    defaultMessage:
      'Disruptions reached {count, number} lines across the network.',
  },
  readerReturn: {
    id: 'weekly.readerReturn',
    defaultMessage:
      '{line} had a recorded disruption after {weeks, plural, one {# full week} other {# full weeks}} without one.',
  },
  readerRecurring: {
    id: 'weekly.readerRecurring',
    defaultMessage:
      'Separate disruptions affected {line} in each of the past three weeks.',
  },
  readerFirst: {
    id: 'weekly.readerFirst',
    defaultMessage:
      'This followed four full weeks with no recorded disruptions across the network.',
  },
  readerMaintenance: {
    id: 'weekly.readerMaintenance',
    defaultMessage: 'Planned maintenance was recorded on {lines}.',
  },
  digestInterchanges: {
    id: 'weekly.digestInterchanges',
    defaultMessage:
      'Affected sections included the interchanges at {stations}.',
  },
  digestWeekend: {
    id: 'weekly.digestWeekend',
    defaultMessage:
      '{percent, number}% of recorded disruption time fell on Saturday or Sunday.',
  },
  digestMultiDay: {
    id: 'weekly.digestMultiDay',
    defaultMessage:
      'One incident affected service on {days, number} days this week; those days do not represent separate breakdowns.',
  },
  digestMaintenanceChange: {
    id: 'weekly.digestMaintenanceChange',
    defaultMessage:
      'Planned maintenance on {lines} included service closures or changes to operating hours.',
  },
});
