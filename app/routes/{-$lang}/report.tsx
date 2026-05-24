import { usePostHog } from '@posthog/react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import {
  IngestContentCrowdReportEffects,
  type IngestContentCrowdReportEffect,
} from '@mrtdown/ingest-contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createIntl, FormattedMessage, useIntl } from 'react-intl';
import { z } from 'zod';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { assert } from '~/util/assert';
import { getCrowdReportFormOptionsFn } from '~/util/report.functions';

type ReportSearch = {
  lineId?: string;
  stationId?: string;
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SearchParamsSchema = z.object({
  lineId: z.string().optional(),
  stationId: z.string().optional(),
});

const EFFECT_LABELS: Record<IngestContentCrowdReportEffect, ReactNode> = {
  delay: <FormattedMessage id="report.effect.delay" defaultMessage="Delay" />,
  'no-service': (
    <FormattedMessage
      id="report.effect.no_service"
      defaultMessage="No service"
    />
  ),
  crowding: (
    <FormattedMessage id="report.effect.crowding" defaultMessage="Crowding" />
  ),
  'skipped-stop': (
    <FormattedMessage
      id="report.effect.skipped_stop"
      defaultMessage="Train skipped stop"
    />
  ),
  unknown: (
    <FormattedMessage id="report.effect.unknown" defaultMessage="Not sure" />
  ),
};

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;
const turnstileSiteKey = import.meta.env.VITE_CROWD_REPORT_TURNSTILE_SITE_KEY;

function loadTurnstileScript() {
  if (window.turnstile != null) {
    return Promise.resolve(window.turnstile);
  }
  turnstileScriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]',
    );
    if (existing != null) {
      existing.addEventListener('load', () => {
        if (window.turnstile == null) {
          reject(new Error('Turnstile failed to load'));
          return;
        }
        resolve(window.turnstile);
      });
      existing.addEventListener('error', () => {
        reject(new Error('Turnstile failed to load'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      if (window.turnstile == null) {
        reject(new Error('Turnstile failed to load'));
        return;
      }
      resolve(window.turnstile);
    });
    script.addEventListener('error', () => {
      reject(new Error('Turnstile failed to load'));
    });
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

export const Route = createFileRoute('/{-$lang}/report')({
  component: ReportPage,
  validateSearch: SearchParamsSchema,
  loader: () => getCrowdReportFormOptionsFn(),
  async head(ctx) {
    const { lang = 'en-SG' } = ctx.params;
    const { default: messages } = await import(`../../../lang/${lang}.json`);
    const intl = createIntl({ locale: lang, messages });
    const rootUrl = import.meta.env.VITE_ROOT_URL;
    assert(rootUrl != null, 'VITE_ROOT_URL is not set');

    const title = intl.formatMessage({
      id: 'report.page_title',
      defaultMessage: 'Submit a community train report',
    });
    const description = intl.formatMessage({
      id: 'report.page_description',
      defaultMessage:
        'Share a concise community report about MRT or LRT delays, crowding, skipped stops, or service issues.',
    });

    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        {
          property: 'og:url',
          content: new URL(
            buildLocaleAwareLink('/report', lang),
            rootUrl,
          ).toString(),
        },
      ],
    };
  },
});

function toSgDatetimeLocal(value: DateTime) {
  return value.setZone('Asia/Singapore').toFormat("yyyy-MM-dd'T'HH:mm");
}

function datetimeLocalToSgIso(value: string) {
  return DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm", {
    zone: 'Asia/Singapore',
  }).toISO();
}

function ReportPage() {
  const { lines, stations } = Route.useLoaderData();
  const search = Route.useSearch() as ReportSearch;
  const intl = useIntl();
  const posthog = usePostHog();
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | undefined>(undefined);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>(
    search.lineId ? [search.lineId] : [],
  );
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>(
    search.stationId ? [search.stationId] : [],
  );
  const [observedAt, setObservedAt] = useState(() =>
    toSgDatetimeLocal(DateTime.now()),
  );
  const [text, setText] = useState('');
  const [directionText, setDirectionText] = useState('');
  const [effect, setEffect] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [isStillHappening, setIsStillHappening] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<
    'idle' | 'submitting' | 'success'
  >('idle');

  useEffect(() => {
    if (!turnstileSiteKey || turnstileRef.current == null) {
      return;
    }

    let didCancel = false;
    loadTurnstileScript()
      .then((turnstile) => {
        if (didCancel || turnstileRef.current == null) {
          return;
        }
        turnstileWidgetIdRef.current = turnstile.render(turnstileRef.current, {
          sitekey: turnstileSiteKey,
          action: 'crowd-report',
          callback: setTurnstileToken,
          'expired-callback': () => setTurnstileToken(''),
          'error-callback': () => setTurnstileToken(''),
        });
      })
      .catch(() => {
        setClientError(
          intl.formatMessage({
            id: 'report.turnstile_unavailable',
            defaultMessage:
              'Verification could not load. Please refresh and try again.',
          }),
        );
      });

    return () => {
      didCancel = true;
      if (turnstileWidgetIdRef.current != null && window.turnstile != null) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
    };
  }, [intl]);

  const selectedLineSet = useMemo(
    () => new Set(selectedLineIds),
    [selectedLineIds],
  );

  const toggleLine = (lineId: string) => {
    setSelectedLineIds((current) => {
      if (current.includes(lineId)) {
        return current.filter((id) => id !== lineId);
      }
      return [...current, lineId];
    });
  };

  const handleStationChange = (value: string) => {
    setSelectedStationIds(value ? [value] : []);
  };

  const resetTurnstile = () => {
    setTurnstileToken('');
    window.turnstile?.reset(turnstileWidgetIdRef.current);
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState === 'submitting') {
      return;
    }

    if (selectedLineIds.length === 0 && selectedStationIds.length === 0) {
      const message = intl.formatMessage({
        id: 'report.error.scope_required',
        defaultMessage: 'Select at least one affected line or station.',
      });
      setClientError(message);
      posthog.capture('crowd_report_validation_failed', {
        reason: 'scope_required',
      });
      return;
    }

    const observedAtIso = datetimeLocalToSgIso(observedAt);
    if (observedAtIso == null) {
      setClientError(
        intl.formatMessage({
          id: 'report.error.observed_at_invalid',
          defaultMessage: 'Choose a valid observed time.',
        }),
      );
      posthog.capture('crowd_report_validation_failed', {
        reason: 'observed_at_invalid',
      });
      return;
    }

    setSubmitState('submitting');
    setClientError(null);

    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        observedAt: observedAtIso,
        lineIds: selectedLineIds,
        stationIds: selectedStationIds,
        text,
        directionText: directionText || undefined,
        effect: effect || undefined,
        delayMinutes: delayMinutes ? Number(delayMinutes) : undefined,
        isStillHappening,
        turnstileToken: turnstileToken || undefined,
      }),
    });

    if (response.ok) {
      posthog.capture('crowd_report_submit_success', {
        line_count: selectedLineIds.length,
        station_count: selectedStationIds.length,
        has_effect: effect.length > 0,
      });
      setSubmitState('success');
      return;
    }

    let error = intl.formatMessage({
      id: 'report.error.submit_failed',
      defaultMessage: 'Report submission failed. Please try again.',
    });
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        error = body.error;
      }
    } catch {
      // Keep the localized fallback.
    }
    posthog.capture('crowd_report_submit_failed', {
      status: response.status,
    });
    setClientError(error);
    resetTurnstile();
    setSubmitState('idle');
  };

  if (submitState === 'success') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm dark:border-emerald-900 dark:bg-gray-800">
        <CheckCircleIcon className="size-10 text-emerald-600 dark:text-emerald-400" />
        <div>
          <h1 className="font-bold text-2xl text-gray-900 dark:text-gray-100">
            <FormattedMessage
              id="report.success_title"
              defaultMessage="Community report submitted"
            />
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            <FormattedMessage
              id="report.success_body"
              defaultMessage="Thanks. The report is queued for review and will stay separate from official service status unless it is verified."
            />
          </p>
        </div>
        <Link
          to="/{-$lang}"
          className="inline-flex w-fit items-center rounded-lg bg-accent-light px-4 py-2 font-semibold text-sm text-white transition-colors hover:bg-accent-dark"
        >
          <FormattedMessage
            id="report.return_home"
            defaultMessage="Return home"
          />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="font-bold text-3xl text-gray-900 tracking-normal dark:text-gray-100">
          <FormattedMessage
            id="report.heading"
            defaultMessage="Submit a community train report"
          />
        </h1>
        <p className="mt-2 max-w-2xl text-gray-600 text-sm leading-6 dark:text-gray-300">
          <FormattedMessage
            id="report.intro"
            defaultMessage="Share what you are seeing on the MRT or LRT. Community reports are reviewed separately from official operator advisories."
          />
        </p>
      </header>

      <form
        className="flex flex-col gap-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 dark:border-gray-700 dark:bg-gray-800"
        onSubmit={submitReport}
      >
        {clientError != null && (
          <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 text-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" />
            <span>{clientError}</span>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
              <FormattedMessage
                id="report.observed_at"
                defaultMessage="Observed time"
              />
            </span>
            <input
              type="datetime-local"
              value={observedAt}
              max={toSgDatetimeLocal(DateTime.now().plus({ minutes: 15 }))}
              onChange={(event) => setObservedAt(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              required
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
              <FormattedMessage
                id="report.station"
                defaultMessage="Affected station"
              />
            </span>
            <select
              value={selectedStationIds[0] ?? ''}
              onChange={(event) => handleStationChange(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">
                {intl.formatMessage({
                  id: 'report.station_placeholder',
                  defaultMessage: 'No specific station',
                })}
              </option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {getLocalizedTranslation(station.name, intl.locale)}
                  {station.codes.length > 0
                    ? ` (${station.codes.join(' / ')})`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
            <FormattedMessage
              id="report.lines"
              defaultMessage="Affected lines"
            />
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {lines.map((line) => {
              const selected = selectedLineSet.has(line.id);
              return (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => toggleLine(line.id)}
                  className={classNames(
                    'flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-light/30',
                    selected
                      ? 'border-accent-light bg-accent-light/10 text-gray-950 dark:text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-accent-light dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200',
                  )}
                  aria-pressed={selected}
                >
                  <span
                    className="rounded px-2 py-1 font-bold text-white text-xs"
                    style={{ backgroundColor: line.color }}
                  >
                    {line.id}
                  </span>
                  <span className="min-w-0 truncate">
                    {getLocalizedTranslation(line.name, intl.locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
              <FormattedMessage
                id="report.effect"
                defaultMessage="What is happening?"
              />
            </span>
            <select
              value={effect}
              onChange={(event) => setEffect(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">
                {intl.formatMessage({
                  id: 'report.effect_placeholder',
                  defaultMessage: 'Choose if known',
                })}
              </option>
              {IngestContentCrowdReportEffects.map((effectValue) => (
                <option key={effectValue} value={effectValue}>
                  {EFFECT_LABELS[effectValue]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
              <FormattedMessage
                id="report.delay_minutes"
                defaultMessage="Estimated delay"
              />
            </span>
            <input
              type="number"
              min={0}
              max={180}
              inputMode="numeric"
              value={delayMinutes}
              onChange={(event) => setDelayMinutes(event.target.value)}
              placeholder={intl.formatMessage({
                id: 'report.delay_placeholder',
                defaultMessage: 'Minutes, if known',
              })}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </section>

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
            <FormattedMessage
              id="report.direction"
              defaultMessage="Direction or destination"
            />
          </span>
          <input
            type="text"
            value={directionText}
            onChange={(event) => setDirectionText(event.target.value)}
            maxLength={120}
            placeholder={intl.formatMessage({
              id: 'report.direction_placeholder',
              defaultMessage: 'Example: towards Jurong East',
            })}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
            <FormattedMessage
              id="report.description"
              defaultMessage="Short description"
            />
          </span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            minLength={8}
            maxLength={1000}
            rows={5}
            placeholder={intl.formatMessage({
              id: 'report.description_placeholder',
              defaultMessage:
                'Describe the delay, crowding, skipped stop, or service issue.',
            })}
            className="resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            required
          />
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <input
            type="checkbox"
            checked={isStillHappening}
            onChange={(event) => setIsStillHappening(event.target.checked)}
            className="mt-1 size-4"
          />
          <span className="text-gray-700 dark:text-gray-200">
            <FormattedMessage
              id="report.still_happening"
              defaultMessage="This is still happening now"
            />
          </span>
        </label>

        {turnstileSiteKey && (
          <div
            ref={turnstileRef}
            className="min-h-16"
            role="group"
            aria-label={intl.formatMessage({
              id: 'report.verification',
              defaultMessage: 'Submission verification',
            })}
          />
        )}

        <div className="flex flex-col gap-3 border-gray-200 border-t pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
          <p className="text-gray-500 text-xs leading-5 dark:text-gray-400">
            <FormattedMessage
              id="report.disclaimer"
              defaultMessage="Submitting does not create an official alert. Reports may be reviewed, merged, or rejected before any public community signal is shown."
            />
          </p>
          <button
            type="submit"
            disabled={submitState === 'submitting'}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent-light px-4 py-2 font-semibold text-sm text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            <PaperAirplaneIcon className="size-5" />
            {submitState === 'submitting' ? (
              <FormattedMessage
                id="report.submitting"
                defaultMessage="Submitting"
              />
            ) : (
              <FormattedMessage
                id="report.submit"
                defaultMessage="Submit report"
              />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
