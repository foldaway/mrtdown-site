import {
  ArrowUturnLeftIcon,
  ChartBarIcon,
  HomeIcon,
  MapIcon,
} from '@heroicons/react/24/outline';
import type React from 'react';
import { Link } from 'react-router';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';

type NotFoundProps = {
  label?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  primaryCtaLabel?: React.ReactNode;
  secondaryCtaLabel?: React.ReactNode;
  systemMapLabel?: React.ReactNode;
  statisticsLabel?: React.ReactNode;
};

const defaultCopy = {
  label: '404 error',
  title: "We couldn't find that page",
  description:
    'It might have been moved, renamed, or the link could be outdated. Here are a few helpful places to continue exploring mrtdown.',
  primaryCtaLabel: 'Back to dashboard',
  secondaryCtaLabel: 'See disruption history',
  systemMapLabel: 'Explore the MRT system map',
  statisticsLabel: 'Dive into reliability statistics',
};

export const NotFound: React.FC<NotFoundProps> = ({
  label,
  title,
  description,
  primaryCtaLabel,
  secondaryCtaLabel,
  systemMapLabel,
  statisticsLabel,
}) => {
  const copy = {
    label: label ?? defaultCopy.label,
    title: title ?? defaultCopy.title,
    description: description ?? defaultCopy.description,
    primaryCtaLabel: primaryCtaLabel ?? defaultCopy.primaryCtaLabel,
    secondaryCtaLabel: secondaryCtaLabel ?? defaultCopy.secondaryCtaLabel,
    systemMapLabel: systemMapLabel ?? defaultCopy.systemMapLabel,
    statisticsLabel: statisticsLabel ?? defaultCopy.statisticsLabel,
  };

  const homeHref = buildLocaleAwareLink('/');
  const historyHref = buildLocaleAwareLink('/history');
  const systemMapHref = buildLocaleAwareLink('/system-map');
  const statisticsHref = buildLocaleAwareLink('/statistics');

  return (
    <section className="relative isolate mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center overflow-hidden rounded-3xl border border-gray-200/60 bg-white/80 px-6 py-16 text-center shadow-black/5 shadow-lg backdrop-blur-sm sm:px-10 dark:border-gray-800/60 dark:bg-gray-950/80 dark:shadow-white/5">
      <div className="-top-48 -translate-x-1/2 pointer-events-none absolute left-1/2 h-72 w-72 rounded-full bg-accent-light/20 blur-3xl" />
      <div className="-bottom-56 -left-12 pointer-events-none absolute h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl dark:bg-emerald-500/20" />
      <div className="-bottom-40 -right-24 pointer-events-none absolute h-64 w-64 rounded-full bg-blue-400/10 blur-3xl dark:bg-blue-500/15" />

      <div className="mx-auto flex max-w-xl flex-col items-center">
        <span className="rounded-full bg-accent-light/10 px-4 py-1 font-semibold text-accent-light text-xs uppercase tracking-[0.35em]">
          {copy.label}
        </span>
        <h1 className="mt-6 text-balance font-bold text-3xl text-gray-900 leading-tight sm:text-4xl dark:text-gray-100">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-lg text-pretty text-base text-gray-600 leading-relaxed dark:text-gray-400">
          {copy.description}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to={homeHref}
            className="hover:-translate-y-0.5 inline-flex items-center gap-x-2 rounded-xl bg-accent-light px-5 py-3 font-semibold text-sm text-white shadow-accent-light/30 shadow-lg transition-all duration-200 hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-950"
          >
            <HomeIcon className="size-5" />
            {copy.primaryCtaLabel}
          </Link>
          <Link
            to={historyHref}
            className="hover:-translate-y-0.5 inline-flex items-center gap-x-2 rounded-xl border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-700 text-sm transition-all duration-200 hover:border-accent-light hover:text-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 focus:ring-offset-white dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:focus:ring-offset-gray-950 dark:hover:border-accent-light dark:hover:text-accent-light"
          >
            <ArrowUturnLeftIcon className="size-5" />
            {copy.secondaryCtaLabel}
          </Link>
        </div>

        <div className="mt-10 grid w-full gap-3 text-left font-medium text-sm sm:grid-cols-2">
          <Link
            to={systemMapHref}
            className="group hover:-translate-y-0.5 flex items-center justify-between rounded-2xl border border-transparent bg-gray-100 px-4 py-3 text-gray-700 transition-all duration-200 hover:border-accent-light hover:bg-white hover:text-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 focus:ring-offset-white dark:bg-gray-800/80 dark:text-gray-300 dark:focus:ring-offset-gray-950 dark:hover:border-accent-light dark:hover:text-accent-light"
          >
            {copy.systemMapLabel}
            <MapIcon className="size-5 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
          <Link
            to={statisticsHref}
            className="group hover:-translate-y-0.5 flex items-center justify-between rounded-2xl border border-transparent bg-gray-100 px-4 py-3 text-gray-700 transition-all duration-200 hover:border-accent-light hover:bg-white hover:text-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light focus:ring-offset-2 focus:ring-offset-white dark:bg-gray-800/80 dark:text-gray-300 dark:focus:ring-offset-gray-950 dark:hover:border-accent-light dark:hover:text-accent-light"
          >
            {copy.statisticsLabel}
            <ChartBarIcon className="size-5 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default NotFound;
