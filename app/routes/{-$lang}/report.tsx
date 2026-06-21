import { usePostHog } from '@posthog/react';
import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ForwardIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
  MapIcon,
  MapPinIcon,
  NoSymbolIcon,
  PaperAirplaneIcon,
  QuestionMarkCircleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import {
  IngestContentCrowdReportEffects,
  type IngestContentCrowdReportEffect,
} from '@mrtdown/ingest-contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import classNames from 'classnames';
import { DateTime } from 'luxon';
import {
  type ComponentType,
  type FormEvent,
  type SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createIntl,
  defineMessages,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';
import { z } from 'zod';
import { buildLocaleAwareLink } from '~/helpers/buildLocaleAwareLink';
import { getLocalizedTranslation } from '~/helpers/getLocalizedTranslation';
import { assert } from '~/util/assert';
import { getCrowdReportFormOptionsFn } from '~/util/report.functions';

type ReportSearch = {
  lineId?: string;
  stationId?: string;
};

type ReportScope = 'line' | 'station' | 'train';
type ReportContextBase = {
  observedAt: string;
  effect: IngestContentCrowdReportEffect | '';
  delayMinutes: string;
  isStillHappening: boolean;
};
type EmptyReportContext = ReportContextBase & { scope: '' };
type LineReportContext = ReportContextBase & {
  scope: 'line';
  lineIds: string[];
};
type StationReportContext = ReportContextBase & {
  scope: 'station';
  stationId: string | null;
  lineIds: string[];
};
type TrainReportContext = ReportContextBase & {
  scope: 'train';
  lineId: string | null;
  directionChoice: string;
  stationId: string | null;
};
type ReportContext =
  | EmptyReportContext
  | LineReportContext
  | StationReportContext
  | TrainReportContext;
type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type FieldErrorKey =
  | 'scope'
  | 'station'
  | 'line'
  | 'effect'
  | 'affectedStops'
  | 'direction'
  | 'observedAt';

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

const EFFECT_LABEL_MESSAGES = defineMessages({
  delay: { id: 'report.effect.delay', defaultMessage: 'Delay' },
  noService: {
    id: 'report.effect.no_service',
    defaultMessage: 'No service',
  },
  crowding: { id: 'report.effect.crowding', defaultMessage: 'Crowding' },
  skippedStop: {
    id: 'report.effect.skipped_stop',
    defaultMessage: 'Train skipped stop',
  },
  unknown: { id: 'report.effect.unknown', defaultMessage: 'Not sure' },
});

const EFFECT_LABELS = {
  delay: EFFECT_LABEL_MESSAGES.delay,
  'no-service': EFFECT_LABEL_MESSAGES.noService,
  crowding: EFFECT_LABEL_MESSAGES.crowding,
  'skipped-stop': EFFECT_LABEL_MESSAGES.skippedStop,
  unknown: EFFECT_LABEL_MESSAGES.unknown,
} satisfies Record<IngestContentCrowdReportEffect, MessageDescriptor>;

const EFFECT_ICONS = {
  delay: ClockIcon,
  'no-service': NoSymbolIcon,
  crowding: UserGroupIcon,
  'skipped-stop': ForwardIcon,
  unknown: QuestionMarkCircleIcon,
} satisfies Record<IngestContentCrowdReportEffect, IconComponent>;

const REPORT_SCOPE_MESSAGES = defineMessages({
  lineTitle: { id: 'report.scope.line', defaultMessage: 'Line issue' },
  lineBody: {
    id: 'report.scope.line_body',
    defaultMessage: 'A whole line, branch, or service pattern is affected.',
  },
  stationTitle: {
    id: 'report.scope.station',
    defaultMessage: 'Station issue',
  },
  stationBody: {
    id: 'report.scope.station_body',
    defaultMessage: 'Something is happening at a station or platform.',
  },
  trainTitle: { id: 'report.scope.train', defaultMessage: 'On-train issue' },
  trainBody: {
    id: 'report.scope.train_body',
    defaultMessage: 'You are on a train and can report direction or stops.',
  },
});

const REPORT_SCOPE_LABELS = {
  line: {
    icon: MapIcon,
    title: REPORT_SCOPE_MESSAGES.lineTitle,
    body: REPORT_SCOPE_MESSAGES.lineBody,
  },
  station: {
    icon: MapPinIcon,
    title: REPORT_SCOPE_MESSAGES.stationTitle,
    body: REPORT_SCOPE_MESSAGES.stationBody,
  },
  train: {
    icon: ArrowsRightLeftIcon,
    title: REPORT_SCOPE_MESSAGES.trainTitle,
    body: REPORT_SCOPE_MESSAGES.trainBody,
  },
} satisfies Record<
  ReportScope,
  { icon: IconComponent; title: MessageDescriptor; body: MessageDescriptor }
>;

const REPORT_SCOPES = Object.keys(REPORT_SCOPE_LABELS) as ReportScope[];
const MAX_REPORT_STATION_IDS = 16;

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

function getReportContextLineIds(context: ReportContext) {
  if (context.scope === 'line' || context.scope === 'station') {
    return context.lineIds;
  }
  if (context.scope === 'train' && context.lineId != null) {
    return [context.lineId];
  }
  return [];
}

function getReportContextStationId(context: ReportContext) {
  if (context.scope === 'station' || context.scope === 'train') {
    return context.stationId;
  }
  return null;
}

function ReportPage() {
  const { lineDirections, lineStationPaths, lines, stations } =
    Route.useLoaderData();
  const search = Route.useSearch() as ReportSearch;
  const intl = useIntl();
  const posthog = usePostHog();
  const errorRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const stationSearchRef = useRef<HTMLInputElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<HTMLDivElement>(null);
  const affectedStopsRef = useRef<HTMLDivElement>(null);
  const directionSelectRef = useRef<HTMLSelectElement>(null);
  const observedAtRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | undefined>(undefined);
  const prefilledLineId =
    search.lineId != null && lines.some((line) => line.id === search.lineId)
      ? search.lineId
      : undefined;
  const prefilledStationId =
    search.stationId != null &&
    stations.some((station) => station.id === search.stationId)
      ? search.stationId
      : undefined;
  const [reportContext, setReportContext] = useState<ReportContext>(() => {
    const base: ReportContextBase = {
      observedAt: toSgDatetimeLocal(DateTime.now()),
      effect: '',
      delayMinutes: '',
      isStillHappening: true,
    };
    if (prefilledStationId != null) {
      const prefilledStation = stations.find(
        (station) => station.id === prefilledStationId,
      );
      const lineIds =
        prefilledLineId != null
          ? [prefilledLineId]
          : prefilledStation?.lineIds.length === 1
            ? [prefilledStation.lineIds[0]]
            : [];
      return {
        ...base,
        scope: 'station',
        stationId: prefilledStationId,
        lineIds,
      };
    }
    if (prefilledLineId != null) {
      return { ...base, scope: 'line', lineIds: [prefilledLineId] };
    }
    return { ...base, scope: '' };
  });
  const [stationSearch, setStationSearch] = useState('');
  const [rangeStartStationId, setRangeStartStationId] = useState('');
  const [rangeEndStationId, setRangeEndStationId] = useState('');
  const [rangeStartStationSearch, setRangeStartStationSearch] = useState('');
  const [rangeEndStationSearch, setRangeEndStationSearch] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldErrorKey, string>>
  >({});
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

  const lineById = useMemo(
    () => Object.fromEntries(lines.map((line) => [line.id, line])),
    [lines],
  );
  const stationById = useMemo(
    () => Object.fromEntries(stations.map((station) => [station.id, station])),
    [stations],
  );
  const reportScope = reportContext.scope;
  const selectedLineIds = getReportContextLineIds(reportContext);
  const selectedStationId = getReportContextStationId(reportContext);
  const selectedStation = selectedStationId
    ? stationById[selectedStationId]
    : undefined;
  const selectedStationIds = selectedStationId ? [selectedStationId] : [];
  const observedAt = reportContext.observedAt;
  const effect = reportContext.effect;
  const delayMinutes = reportContext.delayMinutes;
  const isStillHappening = reportContext.isStillHappening;
  const directionChoice =
    reportContext.scope === 'train' ? reportContext.directionChoice : '';
  const setObservedAt = (observedAtValue: string) => {
    setReportContext((current) => ({
      ...current,
      observedAt: observedAtValue,
    }));
  };
  const setEffect = (effectValue: IngestContentCrowdReportEffect) => {
    setReportContext((current) => ({
      ...current,
      effect: effectValue,
    }));
  };
  const setDelayMinutes = (delayMinutesValue: string) => {
    setReportContext((current) => ({
      ...current,
      delayMinutes: delayMinutesValue,
    }));
  };
  const setIsStillHappening = (isStillHappeningValue: boolean) => {
    setReportContext((current) => ({
      ...current,
      isStillHappening: isStillHappeningValue,
    }));
  };
  const setDirectionChoice = useCallback((directionChoiceValue: string) => {
    setReportContext((current) =>
      current.scope === 'train'
        ? { ...current, directionChoice: directionChoiceValue }
        : current,
    );
  }, []);
  const setSelectedLineIds = useCallback(
    (value: string[] | ((current: string[]) => string[])) => {
      setReportContext((current) => {
        const nextLineIds =
          typeof value === 'function'
            ? value(getReportContextLineIds(current))
            : value;
        if (current.scope === 'line' || current.scope === 'station') {
          return { ...current, lineIds: nextLineIds };
        }
        if (current.scope === 'train') {
          return { ...current, lineId: nextLineIds[0] ?? null };
        }
        return current;
      });
    },
    [],
  );
  const selectedStationLineIds =
    selectedStation?.lineIds.filter((lineId) => lineById[lineId] != null) ?? [];
  const rangeStartStation = rangeStartStationId
    ? stationById[rangeStartStationId]
    : undefined;
  const rangeEndStation = rangeEndStationId
    ? stationById[rangeEndStationId]
    : undefined;
  const selectedLineSet = useMemo(
    () => new Set(selectedLineIds),
    [selectedLineIds],
  );
  const selectedLineDirectionOptions =
    selectedLineIds.length === 1
      ? (lineDirections[selectedLineIds[0]] ?? [])
      : [];
  const supportsAffectedStopRange =
    effect === 'skipped-stop' || effect === 'no-service';
  const affectedStopSearchLineIds =
    selectedLineIds.length > 0 ? selectedLineIds : undefined;
  const expandedAffectedStopStationIds = useMemo(() => {
    if (
      !supportsAffectedStopRange ||
      rangeStartStationId.length === 0 ||
      rangeEndStationId.length === 0 ||
      rangeStartStationId === rangeEndStationId
    ) {
      return [];
    }

    const candidateLineIds = selectedLineIds.filter(
      (lineId) =>
        rangeStartStation?.lineIds.includes(lineId) &&
        rangeEndStation?.lineIds.includes(lineId),
    );
    for (const lineId of candidateLineIds) {
      for (const path of lineStationPaths[lineId] ?? []) {
        const startIndex = path.indexOf(rangeStartStationId);
        const endIndex = path.indexOf(rangeEndStationId);
        if (startIndex === -1 || endIndex === -1) {
          continue;
        }
        const [fromIndex, toIndex] =
          startIndex < endIndex
            ? [startIndex, endIndex]
            : [endIndex, startIndex];
        return path.slice(fromIndex, toIndex + 1);
      }
    }

    return [];
  }, [
    lineStationPaths,
    rangeEndStation,
    rangeEndStationId,
    rangeStartStation,
    rangeStartStationId,
    selectedLineIds,
    supportsAffectedStopRange,
  ]);
  const affectedStopStationIds = useMemo(() => {
    if (!supportsAffectedStopRange) {
      return [];
    }
    if (rangeStartStationId.length > 0 && rangeEndStationId.length > 0) {
      return expandedAffectedStopStationIds;
    }
    return [rangeStartStationId, rangeEndStationId].filter(
      (stationId) => stationId.length > 0,
    );
  }, [
    expandedAffectedStopStationIds,
    rangeEndStationId,
    rangeStartStationId,
    supportsAffectedStopRange,
  ]);
  const submittedStationIds = useMemo(
    () => [...new Set([...selectedStationIds, ...affectedStopStationIds])],
    [affectedStopStationIds, selectedStationIds],
  );
  const stationSearchQuery = stationSearch.trim();
  const primaryContextComplete =
    reportScope === 'line'
      ? selectedLineIds.length > 0
      : reportScope === 'station'
        ? selectedStationIds.length > 0 &&
          (selectedStationLineIds.length <= 1 || selectedLineIds.length > 0)
        : reportScope === 'train'
          ? selectedLineIds.length > 0 && directionChoice.length > 0
          : false;
  const getStationSearchResults = (
    searchValue: string,
    filterLineIds?: string[],
  ) => {
    const query = searchValue.trim().toLocaleLowerCase();
    return stations
      .filter((station) => {
        if (
          filterLineIds != null &&
          filterLineIds.length > 0 &&
          !station.lineIds.some((lineId) => filterLineIds.includes(lineId))
        ) {
          return false;
        }
        if (!query) {
          return true;
        }
        const stationName = getLocalizedTranslation(
          station.name,
          intl.locale,
        ).toLocaleLowerCase();
        return (
          station.id.toLocaleLowerCase().includes(query) ||
          stationName.includes(query) ||
          station.codes.some((code) => code.toLocaleLowerCase().includes(query))
        );
      })
      .slice(0, 8);
  };
  const getLineStationSuggestions = (filterLineIds?: string[]) => {
    if (filterLineIds == null || filterLineIds.length === 0) {
      return [];
    }

    const stationIds: string[] = [];
    for (const lineId of filterLineIds) {
      for (const path of lineStationPaths[lineId] ?? []) {
        for (const stationId of path) {
          if (!stationIds.includes(stationId)) {
            stationIds.push(stationId);
          }
        }
      }
    }

    const orderedStations = stationIds
      .map((stationId) => stationById[stationId])
      .filter((station): station is (typeof stations)[number] => {
        return station != null;
      });
    if (orderedStations.length > 0) {
      return orderedStations.slice(0, 12);
    }

    return getStationSearchResults('', filterLineIds).slice(0, 12);
  };
  const stationSearchResults = getStationSearchResults(stationSearch);
  const mainStationSuggestionLineIds =
    reportScope === 'train' && selectedLineIds.length > 0
      ? selectedLineIds
      : undefined;
  const mainStationSuggestions = getLineStationSuggestions(
    mainStationSuggestionLineIds,
  );

  useEffect(() => {
    if (
      reportScope !== 'station' ||
      selectedStation == null ||
      selectedStation.lineIds.length !== 1 ||
      selectedLineIds.length > 0
    ) {
      return;
    }
    setSelectedLineIds([selectedStation.lineIds[0]]);
  }, [
    reportScope,
    selectedLineIds.length,
    selectedStation,
    setSelectedLineIds,
  ]);

  useEffect(() => {
    if (reportScope !== 'train') {
      if (directionChoice !== '') {
        setDirectionChoice('');
      }
      return;
    }

    if (selectedLineIds.length === 0) {
      if (directionChoice !== '') {
        setDirectionChoice('');
      }
      return;
    }

    if (
      directionChoice === 'not-sure' ||
      directionChoice === '' ||
      selectedLineDirectionOptions.some(
        (option) => option.stationId === directionChoice,
      )
    ) {
      return;
    }
    setDirectionChoice('');
  }, [
    directionChoice,
    reportScope,
    selectedLineDirectionOptions,
    selectedLineIds.length,
    setDirectionChoice,
  ]);

  useEffect(() => {
    if (selectedLineIds.length === 0) {
      return;
    }

    if (
      rangeStartStation != null &&
      !rangeStartStation.lineIds.some((lineId) =>
        selectedLineIds.includes(lineId),
      )
    ) {
      setRangeStartStationId('');
    }
    if (
      rangeEndStation != null &&
      !rangeEndStation.lineIds.some((lineId) =>
        selectedLineIds.includes(lineId),
      )
    ) {
      setRangeEndStationId('');
    }
  }, [rangeEndStation, rangeStartStation, selectedLineIds]);

  const clearFieldError = (field: FieldErrorKey) => {
    setClientError(null);
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const toggleLine = (lineId: string) => {
    clearFieldError('line');
    clearFieldError('direction');
    setSelectedLineIds((current) => {
      if (current.includes(lineId)) {
        return current.filter((id) => id !== lineId);
      }
      if (reportScope === 'train') {
        return [lineId];
      }
      return [...current, lineId];
    });
  };

  const showClientError = (message: string) => {
    setClientError(message);
    window.requestAnimationFrame(() => {
      errorRef.current?.focus();
    });
  };

  const focusField = (field: FieldErrorKey) => {
    window.requestAnimationFrame(() => {
      if (field === 'scope') {
        scopeRef.current?.focus();
        return;
      }
      if (field === 'station') {
        stationSearchRef.current?.focus();
        return;
      }
      if (field === 'line') {
        lineRef.current?.focus();
        return;
      }
      if (field === 'effect') {
        effectRef.current?.focus();
        return;
      }
      if (field === 'affectedStops') {
        affectedStopsRef.current?.focus();
        return;
      }
      if (field === 'direction') {
        directionSelectRef.current?.focus();
        return;
      }
      observedAtRef.current?.focus();
    });
  };

  const showFieldError = (
    field: FieldErrorKey,
    message: string,
    reason: string,
  ) => {
    setFieldErrors({ [field]: message });
    setClientError(message);
    posthog.capture('crowd_report_validation_failed', { reason });
    focusField(field);
  };

  const selectStation = (stationId: string) => {
    const station = stationById[stationId];
    clearFieldError('station');
    setStationSearch('');
    setReportContext((current) => {
      if (current.scope === 'train') {
        return { ...current, stationId };
      }

      const selectedStationLineIds = station?.lineIds ?? [];
      const lineIds =
        selectedStationLineIds.length === 1
          ? [selectedStationLineIds[0]]
          : getReportContextLineIds(current).filter((lineId) =>
              selectedStationLineIds.includes(lineId),
            );
      return {
        ...current,
        scope: 'station',
        stationId,
        lineIds,
      };
    });
  };

  const clearStation = () => {
    setReportContext((current) => {
      if (current.scope === 'station') {
        return { ...current, stationId: null, lineIds: [] };
      }
      if (current.scope === 'train') {
        return { ...current, stationId: null };
      }
      return current;
    });
  };

  const chooseReportScope = (scope: ReportScope) => {
    clearFieldError('scope');
    setStationSearch('');
    setReportContext((current) => {
      if (scope === 'line') {
        return {
          ...current,
          scope: 'line',
          lineIds: getReportContextLineIds(current),
        };
      }

      if (scope === 'station') {
        const stationId = getReportContextStationId(current);
        if (stationId == null) {
          return { ...current, scope: 'station', stationId: null, lineIds: [] };
        }
        const station = stationById[stationId];
        const lineIds = getReportContextLineIds(current).filter((lineId) =>
          station?.lineIds.includes(lineId),
        );
        return { ...current, scope: 'station', stationId, lineIds };
      }

      const lineIds = getReportContextLineIds(current);
      return {
        ...current,
        scope: 'train',
        lineId: lineIds.length === 1 ? lineIds[0] : null,
        directionChoice:
          current.scope === 'train' ? current.directionChoice : '',
        stationId: null,
      };
    });
  };

  const resetTurnstile = () => {
    setTurnstileToken('');
    window.turnstile?.reset(turnstileWidgetIdRef.current);
  };

  const getDirectionStationId = () => {
    if (reportScope !== 'train') {
      return undefined;
    }
    if (directionChoice === 'not-sure' || directionChoice === '') {
      return undefined;
    }
    const directionOption = selectedLineDirectionOptions.find(
      (option) => option.stationId === directionChoice,
    );
    return directionOption?.stationId;
  };

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState === 'submitting') {
      return;
    }

    setFieldErrors({});
    setClientError(null);

    if (!reportScope) {
      const message = intl.formatMessage({
        id: 'report.error.report_scope_required',
        defaultMessage: 'Choose what kind of issue you are reporting.',
      });
      showFieldError('scope', message, 'report_scope_required');
      return;
    }

    if (reportScope === 'line' && selectedLineIds.length === 0) {
      const message = intl.formatMessage({
        id: 'report.error.line_required',
        defaultMessage: 'Select the affected line.',
      });
      showFieldError('line', message, 'line_required');
      return;
    }

    if (reportScope === 'station' && selectedStationIds.length === 0) {
      const message = intl.formatMessage({
        id: 'report.error.station_required',
        defaultMessage: 'Select the affected station.',
      });
      showFieldError('station', message, 'station_required');
      return;
    }

    if (
      reportScope === 'station' &&
      selectedStationLineIds.length > 1 &&
      selectedLineIds.length === 0
    ) {
      const message = intl.formatMessage({
        id: 'report.error.station_line_required',
        defaultMessage: 'Select the affected line at this interchange.',
      });
      showFieldError('line', message, 'station_line_required');
      return;
    }

    if (reportScope === 'train' && selectedLineIds.length === 0) {
      const message = intl.formatMessage({
        id: 'report.error.train_line_required',
        defaultMessage: 'Select the line you are travelling on.',
      });
      showFieldError('line', message, 'train_line_required');
      return;
    }

    if (reportScope === 'train' && selectedLineIds.length > 1) {
      const message = intl.formatMessage({
        id: 'report.error.train_single_line_required',
        defaultMessage: 'Select one line you are travelling on.',
      });
      showFieldError('line', message, 'train_single_line_required');
      return;
    }

    if (reportScope === 'train' && directionChoice === '') {
      const message = intl.formatMessage({
        id: 'report.error.train_direction_required',
        defaultMessage: 'Choose a direction, destination, or Not sure.',
      });
      showFieldError('direction', message, 'train_direction_required');
      return;
    }

    if (!effect) {
      const message = intl.formatMessage({
        id: 'report.error.effect_required',
        defaultMessage: 'Choose what is happening.',
      });
      showFieldError('effect', message, 'effect_required');
      return;
    }

    if (
      supportsAffectedStopRange &&
      (rangeStartStationId.length > 0 || rangeEndStationId.length > 0)
    ) {
      if (selectedLineIds.length === 0) {
        const message = intl.formatMessage({
          id: 'report.error.affected_stops_line_required',
          defaultMessage:
            'Select the affected line before choosing affected stops.',
        });
        showFieldError('line', message, 'affected_stops_line_required');
        return;
      }

      const affectedStopEndpointStations = [
        rangeStartStation,
        rangeEndStation,
      ].filter((station): station is (typeof stations)[number] => {
        return station != null;
      });
      if (
        affectedStopEndpointStations.some(
          (station) =>
            !station.lineIds.some((lineId) => selectedLineIds.includes(lineId)),
        )
      ) {
        const message = intl.formatMessage({
          id: 'report.error.affected_stops_not_on_selected_line',
          defaultMessage:
            'Choose affected stops that are served by the selected line.',
        });
        showFieldError(
          'affectedStops',
          message,
          'affected_stops_not_on_selected_line',
        );
        return;
      }

      if (
        rangeStartStationId.length > 0 &&
        rangeEndStationId.length > 0 &&
        rangeStartStationId === rangeEndStationId
      ) {
        const message = intl.formatMessage({
          id: 'report.error.affected_stops_same_station',
          defaultMessage: 'Choose two different affected stops.',
        });
        showFieldError('affectedStops', message, 'affected_stops_same_station');
        return;
      }

      if (
        rangeStartStationId.length > 0 &&
        rangeEndStationId.length > 0 &&
        expandedAffectedStopStationIds.length === 0
      ) {
        const message = intl.formatMessage({
          id: 'report.error.affected_stops_not_on_selected_line',
          defaultMessage:
            'Choose affected stops that are served by the selected line.',
        });
        showFieldError(
          'affectedStops',
          message,
          'affected_stops_not_on_selected_line',
        );
        return;
      }

      if (submittedStationIds.length > MAX_REPORT_STATION_IDS) {
        const message = intl.formatMessage(
          {
            id: 'report.error.affected_stops_too_many_stations',
            defaultMessage:
              'Choose a shorter affected stop range. Reports can include up to {maxStationCount} stations.',
          },
          { maxStationCount: MAX_REPORT_STATION_IDS },
        );
        showFieldError(
          'affectedStops',
          message,
          'affected_stops_too_many_stations',
        );
        return;
      }
    }

    const observedAtIso = datetimeLocalToSgIso(observedAt);
    if (observedAtIso == null) {
      const message = intl.formatMessage({
        id: 'report.error.observed_at_invalid',
        defaultMessage: 'Choose a valid observed time.',
      });
      showFieldError('observedAt', message, 'observed_at_invalid');
      return;
    }

    const directionStationId = getDirectionStationId();

    setSubmitState('submitting');

    let response: Response;
    try {
      response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          reportScope,
          observedAt: observedAtIso,
          lineIds: selectedLineIds,
          stationIds: submittedStationIds,
          directionStationId,
          directionUnknown:
            reportScope === 'train' && directionChoice === 'not-sure'
              ? true
              : undefined,
          effect: effect || undefined,
          delayMinutes: delayMinutes ? Number(delayMinutes) : undefined,
          isStillHappening,
          turnstileToken: turnstileToken || undefined,
        }),
      });
    } catch (error) {
      posthog.capture('crowd_report_submit_failed', {
        error: error instanceof Error ? error.message : String(error),
        status: 'network_error',
      });
      showClientError(
        intl.formatMessage({
          id: 'report.error.submit_failed',
          defaultMessage: 'Report submission failed. Please try again.',
        }),
      );
      resetTurnstile();
      setSubmitState('idle');
      return;
    }

    if (response.ok) {
      posthog.capture('crowd_report_submit_success', {
        line_count: selectedLineIds.length,
        station_count: submittedStationIds.length,
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
    showClientError(error);
    resetTurnstile();
    setSubmitState('idle');
  };

  const allLineIds = lines.map((line) => line.id);
  const primaryLineIds =
    selectedStationLineIds.length > 0 ? selectedStationLineIds : allLineIds;
  const additionalLineIds =
    selectedStationLineIds.length > 0
      ? allLineIds.filter((lineId) => !selectedStationLineIds.includes(lineId))
      : [];

  const renderLineButton = (lineId: string) => {
    const line = lineById[lineId];
    if (line == null) {
      return null;
    }

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
  };

  const renderStationCodePills = (station: (typeof stations)[number]) => (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {station.codePills.map((codePill) => {
        const line = lineById[codePill.lineId];
        return (
          <span
            key={`${codePill.lineId}:${codePill.code}`}
            className="rounded px-2 py-0.5 font-bold text-white text-xs leading-5"
            style={{ backgroundColor: line?.color ?? '#2563eb' }}
          >
            {codePill.code}
          </span>
        );
      })}
    </span>
  );

  const renderStationIdentity = (station: (typeof stations)[number]) => (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 truncate font-semibold text-gray-900 text-sm dark:text-gray-100">
        {getLocalizedTranslation(station.name, intl.locale)}
      </span>
      {station.codePills.length > 0 && renderStationCodePills(station)}
    </span>
  );

  const renderAffectedStopPicker = ({
    id,
    label,
    selectedStation,
    searchValue,
    filterLineIds,
    onSearchChange,
    onSelect,
    onClear,
  }: {
    id: string;
    label: string;
    selectedStation: (typeof stations)[number] | undefined;
    searchValue: string;
    filterLineIds?: string[];
    onSearchChange: (value: string) => void;
    onSelect: (stationId: string) => void;
    onClear: () => void;
  }) => {
    const stationSuggestions = getLineStationSuggestions(filterLineIds);

    return (
      <div className="flex flex-col gap-2">
        <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
          {label}
        </span>
        {selectedStation != null && (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
            {renderStationIdentity(selectedStation)}
            <button
              type="button"
              onClick={onClear}
              className="ms-auto shrink-0 rounded-md px-2 py-1 font-medium text-accent-light text-xs hover:bg-white dark:hover:bg-gray-800"
            >
              <FormattedMessage id="report.change" defaultMessage="Change" />
            </button>
          </div>
        )}
        <label className="relative">
          <span className="sr-only">{label}</span>
          <MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-gray-400" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={intl.formatMessage({
              id: 'report.affected_stop_search_placeholder',
              defaultMessage: 'Search by station name or code',
            })}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        {searchValue.trim().length > 0 && (
          <div className="grid gap-2">
            {getStationSearchResults(searchValue, filterLineIds).map(
              (station) => (
                <button
                  key={`${id}:${station.id}`}
                  type="button"
                  onClick={() => onSelect(station.id)}
                  className="flex min-h-12 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-start text-sm transition-colors hover:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900"
                >
                  {renderStationIdentity(station)}
                </button>
              ),
            )}
          </div>
        )}
        {searchValue.trim().length === 0 &&
          selectedStation == null &&
          stationSuggestions.length > 0 && (
            <div className="grid gap-2">
              <p className="text-gray-500 text-xs leading-5 dark:text-gray-400">
                <FormattedMessage
                  id="report.affected_stop_quick_pick"
                  defaultMessage="Stops on the selected line"
                />
              </p>
              {stationSuggestions.map((station) => (
                <button
                  key={`${id}:${station.id}`}
                  type="button"
                  onClick={() => onSelect(station.id)}
                  className="flex min-h-12 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-start text-sm transition-colors hover:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900"
                >
                  {renderStationIdentity(station)}
                </button>
              ))}
            </div>
          )}
        {searchValue.trim().length === 0 &&
          selectedStation == null &&
          stationSuggestions.length === 0 && (
            <p className="text-gray-500 text-xs leading-5 dark:text-gray-400">
              <FormattedMessage
                id="report.affected_stop_search_hint"
                defaultMessage="Search when you want to add a specific stop or range."
              />
            </p>
          )}
      </div>
    );
  };

  const renderEffectButton = (effectValue: IngestContentCrowdReportEffect) => {
    const selected = effect === effectValue;
    const Icon = EFFECT_ICONS[effectValue];
    return (
      <button
        key={effectValue}
        type="button"
        onClick={() => {
          clearFieldError('effect');
          setEffect(effectValue);
        }}
        className={classNames(
          'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-light/30',
          selected
            ? 'border-accent-light bg-accent-light/10 text-gray-950 dark:text-white'
            : 'border-gray-300 bg-white text-gray-700 hover:border-accent-light dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200',
        )}
        aria-pressed={selected}
      >
        <Icon className="size-4 shrink-0" />
        <span>{intl.formatMessage(EFFECT_LABELS[effectValue])}</span>
      </button>
    );
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
          <div
            ref={errorRef}
            className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 text-sm dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
            tabIndex={-1}
          >
            <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" />
            <span>{clientError}</span>
          </div>
        )}

        <section
          className="flex flex-col gap-3"
          ref={scopeRef}
          tabIndex={-1}
          aria-describedby={
            fieldErrors.scope ? 'report-scope-error' : undefined
          }
        >
          <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
            <FormattedMessage
              id="report.scope"
              defaultMessage="What are you reporting?"
            />
          </span>
          <div className="grid gap-2 sm:grid-cols-3">
            {REPORT_SCOPES.map((scope) => {
              const selected = reportScope === scope;
              const Icon = REPORT_SCOPE_LABELS[scope].icon;
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => chooseReportScope(scope)}
                  className={classNames(
                    'min-h-24 rounded-lg border p-3 text-start transition-colors focus:outline-none focus:ring-2 focus:ring-accent-light/30',
                    selected
                      ? 'border-accent-light bg-accent-light/10'
                      : 'border-gray-300 bg-white hover:border-accent-light dark:border-gray-600 dark:bg-gray-900',
                  )}
                  aria-pressed={selected}
                >
                  <span className="flex items-center gap-2 font-semibold text-gray-900 text-sm dark:text-gray-100">
                    <span
                      className={classNames(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg',
                        selected
                          ? 'bg-accent-light text-white'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <FormattedMessage {...REPORT_SCOPE_LABELS[scope].title} />
                    </span>
                  </span>
                  <span className="mt-1 block text-gray-600 text-xs leading-5 dark:text-gray-300">
                    <FormattedMessage {...REPORT_SCOPE_LABELS[scope].body} />
                  </span>
                </button>
              );
            })}
          </div>
          {fieldErrors.scope != null && (
            <p
              className="text-red-700 text-sm dark:text-red-300"
              id="report-scope-error"
            >
              {fieldErrors.scope}
            </p>
          )}
        </section>

        {reportScope &&
          (selectedStation != null || selectedLineIds.length > 0) && (
            <section className="flex flex-wrap gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/30">
              <span className="font-semibold text-gray-800 dark:text-gray-100">
                <FormattedMessage
                  id="report.context_summary"
                  defaultMessage="Reporting:"
                />
              </span>
              {selectedStation != null && (
                <span className="text-gray-700 dark:text-gray-200">
                  {getLocalizedTranslation(selectedStation.name, intl.locale)}
                </span>
              )}
              {selectedLineIds.map((lineId) => {
                const line = lineById[lineId];
                if (line == null) {
                  return null;
                }
                return (
                  <span
                    key={lineId}
                    className="rounded px-2 py-0.5 font-bold text-white text-xs"
                    style={{ backgroundColor: line.color }}
                  >
                    {line.id}
                  </span>
                );
              })}
            </section>
          )}

        {(reportScope === 'station' || reportScope === 'train') && (
          <section className="flex flex-col gap-3">
            <div>
              <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                {reportScope === 'train' ? (
                  <FormattedMessage
                    id="report.train_station"
                    defaultMessage="Next station or destination"
                  />
                ) : (
                  <FormattedMessage
                    id="report.station"
                    defaultMessage="Affected station"
                  />
                )}
              </span>
              {reportScope === 'train' && (
                <span className="ms-2 text-gray-500 text-xs dark:text-gray-400">
                  <FormattedMessage
                    id="report.optional"
                    defaultMessage="Optional"
                  />
                </span>
              )}
            </div>
            {selectedStation != null && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                {renderStationIdentity(selectedStation)}
                <button
                  type="button"
                  onClick={clearStation}
                  className="ms-auto shrink-0 rounded-md px-2 py-1 font-medium text-accent-light text-xs hover:bg-white dark:hover:bg-gray-800"
                >
                  <FormattedMessage
                    id="report.change"
                    defaultMessage="Change"
                  />
                </button>
              </div>
            )}
            <label className="relative">
              <span className="sr-only">
                {reportScope === 'train' ? (
                  <FormattedMessage
                    id="report.train_station_search"
                    defaultMessage="Search next station or destination"
                  />
                ) : (
                  <FormattedMessage
                    id="report.station_search"
                    defaultMessage="Search station"
                  />
                )}
              </span>
              <MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-gray-400" />
              <input
                ref={stationSearchRef}
                type="search"
                value={stationSearch}
                onChange={(event) => {
                  clearFieldError('station');
                  setStationSearch(event.target.value);
                }}
                placeholder={intl.formatMessage({
                  id:
                    reportScope === 'train'
                      ? 'report.train_station_search_placeholder'
                      : 'report.station_search_placeholder',
                  defaultMessage:
                    reportScope === 'train'
                      ? 'Search by next station, destination, or code'
                      : 'Search by station name or code',
                })}
                aria-invalid={fieldErrors.station != null}
                aria-describedby={
                  fieldErrors.station ? 'report-station-error' : undefined
                }
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-3 pl-9 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            {fieldErrors.station != null && (
              <p
                className="text-red-700 text-sm dark:text-red-300"
                id="report-station-error"
              >
                {fieldErrors.station}
              </p>
            )}
            {stationSearchQuery.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {stationSearchResults.map((station) => (
                  <button
                    key={station.id}
                    type="button"
                    onClick={() => selectStation(station.id)}
                    className="flex min-h-12 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-start text-sm transition-colors hover:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900"
                  >
                    {renderStationIdentity(station)}
                  </button>
                ))}
              </div>
            )}
            {stationSearchQuery.length === 0 &&
              selectedStation == null &&
              mainStationSuggestions.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="text-gray-500 text-xs leading-5 sm:col-span-2 dark:text-gray-400">
                    <FormattedMessage
                      id="report.station_quick_pick"
                      defaultMessage="Stations on the selected line"
                    />
                  </p>
                  {mainStationSuggestions.map((station) => (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => selectStation(station.id)}
                      className="flex min-h-12 items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-start text-sm transition-colors hover:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900"
                    >
                      {renderStationIdentity(station)}
                    </button>
                  ))}
                </div>
              )}
            {stationSearchQuery.length === 0 &&
              selectedStation == null &&
              mainStationSuggestions.length === 0 && (
                <p className="text-gray-500 text-xs leading-5 dark:text-gray-400">
                  <FormattedMessage
                    id={
                      reportScope === 'train'
                        ? 'report.train_station_search_hint'
                        : 'report.station_search_hint'
                    }
                    defaultMessage={
                      reportScope === 'train'
                        ? 'Add this only if it helps describe where you are headed.'
                        : 'Start typing a station name or station code.'
                    }
                  />
                </p>
              )}
          </section>
        )}

        {reportScope &&
          (reportScope !== 'station' || selectedStation != null) && (
            <section
              className="flex flex-col gap-2"
              ref={lineRef}
              tabIndex={-1}
              aria-describedby={
                fieldErrors.line ? 'report-line-error' : undefined
              }
            >
              <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                {reportScope === 'train' ? (
                  <FormattedMessage
                    id="report.train_line"
                    defaultMessage="Line you are travelling on"
                  />
                ) : (
                  <FormattedMessage
                    id="report.lines"
                    defaultMessage="Affected lines"
                  />
                )}
              </span>
              {selectedStationLineIds.length > 0 && (
                <p className="text-gray-500 text-xs leading-5 dark:text-gray-400">
                  <FormattedMessage
                    id="report.station_lines_hint"
                    defaultMessage="Lines serving the selected station are shown first."
                  />
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {primaryLineIds.map(renderLineButton)}
              </div>
              {additionalLineIds.length > 0 && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
                  <summary className="cursor-pointer font-medium text-gray-700 text-sm dark:text-gray-200">
                    <FormattedMessage
                      id="report.additional_lines"
                      defaultMessage="Use a different line"
                    />
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {additionalLineIds.map(renderLineButton)}
                  </div>
                </details>
              )}
              {fieldErrors.line != null && (
                <p
                  className="text-red-700 text-sm dark:text-red-300"
                  id="report-line-error"
                >
                  {fieldErrors.line}
                </p>
              )}
            </section>
          )}

        {reportScope && !primaryContextComplete && (
          <section className="flex gap-3 rounded-lg border border-gray-300 border-dashed bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <InformationCircleIcon className="mt-0.5 size-5 shrink-0 text-gray-400" />
            <p className="text-gray-600 leading-5 dark:text-gray-300">
              <FormattedMessage
                id="report.primary_context_hint"
                defaultMessage="Add the affected line, station, or train direction before choosing what is happening."
              />
            </p>
          </section>
        )}

        {primaryContextComplete && (
          <section className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <div
              className="flex flex-col gap-2"
              ref={effectRef}
              tabIndex={-1}
              aria-describedby={
                fieldErrors.effect ? 'report-effect-error' : undefined
              }
            >
              <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                <FormattedMessage
                  id="report.effect"
                  defaultMessage="What is happening?"
                />
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {IngestContentCrowdReportEffects.map(renderEffectButton)}
              </div>
              {fieldErrors.effect != null && (
                <p
                  className="text-red-700 text-sm dark:text-red-300"
                  id="report-effect-error"
                >
                  {fieldErrors.effect}
                </p>
              )}
            </div>
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
          </section>
        )}

        {supportsAffectedStopRange && (
          <section
            className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
            ref={affectedStopsRef}
            tabIndex={-1}
            aria-describedby={
              fieldErrors.affectedStops
                ? 'report-affected-stops-error'
                : undefined
            }
          >
            <div>
              <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                <FormattedMessage
                  id="report.affected_stops"
                  defaultMessage="Affected stops"
                />
              </span>
              <span className="ms-2 text-gray-500 text-xs dark:text-gray-400">
                <FormattedMessage
                  id="report.optional"
                  defaultMessage="Optional"
                />
              </span>
              <p className="mt-1 text-gray-500 text-xs leading-5 dark:text-gray-400">
                <FormattedMessage
                  id="report.affected_stops_hint"
                  defaultMessage="Add a stop or range only if this is about skipped stops or no service between stations."
                />
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {renderAffectedStopPicker({
                id: 'range-start',
                label: intl.formatMessage({
                  id: 'report.affected_stop_from',
                  defaultMessage: 'From station',
                }),
                selectedStation: rangeStartStation,
                searchValue: rangeStartStationSearch,
                filterLineIds: affectedStopSearchLineIds,
                onSearchChange: setRangeStartStationSearch,
                onSelect: (stationId) => {
                  clearFieldError('affectedStops');
                  setRangeStartStationId(stationId);
                  setRangeStartStationSearch('');
                },
                onClear: () => {
                  clearFieldError('affectedStops');
                  setRangeStartStationId('');
                },
              })}
              {renderAffectedStopPicker({
                id: 'range-end',
                label: intl.formatMessage({
                  id: 'report.affected_stop_to',
                  defaultMessage: 'To station',
                }),
                selectedStation: rangeEndStation,
                searchValue: rangeEndStationSearch,
                filterLineIds: affectedStopSearchLineIds,
                onSearchChange: setRangeEndStationSearch,
                onSelect: (stationId) => {
                  clearFieldError('affectedStops');
                  setRangeEndStationId(stationId);
                  setRangeEndStationSearch('');
                },
                onClear: () => {
                  clearFieldError('affectedStops');
                  setRangeEndStationId('');
                },
              })}
            </div>
            {fieldErrors.affectedStops != null && (
              <p
                className="text-red-700 text-sm dark:text-red-300"
                id="report-affected-stops-error"
              >
                {fieldErrors.affectedStops}
              </p>
            )}
          </section>
        )}

        {reportScope === 'train' && selectedLineIds.length > 0 && (
          <section className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                <FormattedMessage
                  id="report.direction"
                  defaultMessage="Direction or destination"
                />
              </span>
              <select
                ref={directionSelectRef}
                value={directionChoice}
                onChange={(event) => {
                  clearFieldError('direction');
                  setDirectionChoice(event.target.value);
                }}
                aria-invalid={fieldErrors.direction != null}
                aria-describedby={
                  fieldErrors.direction ? 'report-direction-error' : undefined
                }
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">
                  {intl.formatMessage({
                    id: 'report.direction_placeholder',
                    defaultMessage: 'Choose if known',
                  })}
                </option>
                {selectedLineDirectionOptions.map((option) => (
                  <option key={option.stationId} value={option.stationId}>
                    {intl.formatMessage(
                      {
                        id: 'report.direction_towards',
                        defaultMessage: 'Towards {stationName}',
                      },
                      {
                        stationName: getLocalizedTranslation(
                          option.name,
                          intl.locale,
                        ),
                      },
                    )}
                  </option>
                ))}
                <option value="not-sure">
                  {intl.formatMessage({
                    id: 'report.direction_not_sure',
                    defaultMessage: 'Not sure',
                  })}
                </option>
              </select>
            </label>
            {fieldErrors.direction != null && (
              <p
                className="text-red-700 text-sm sm:col-span-2 dark:text-red-300"
                id="report-direction-error"
              >
                {fieldErrors.direction}
              </p>
            )}
          </section>
        )}

        {primaryContextComplete && (
          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
            <summary className="cursor-pointer font-medium text-gray-700 text-sm dark:text-gray-200">
              <FormattedMessage
                id="report.more_details"
                defaultMessage="More details"
              />
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="font-semibold text-gray-800 text-sm dark:text-gray-100">
                  <FormattedMessage
                    id="report.observed_at"
                    defaultMessage="Observed time"
                  />
                </span>
                <input
                  ref={observedAtRef}
                  type="datetime-local"
                  value={observedAt}
                  max={toSgDatetimeLocal(DateTime.now().plus({ minutes: 15 }))}
                  onChange={(event) => {
                    clearFieldError('observedAt');
                    setObservedAt(event.target.value);
                  }}
                  aria-invalid={fieldErrors.observedAt != null}
                  aria-describedby={
                    fieldErrors.observedAt
                      ? 'report-observed-at-error'
                      : undefined
                  }
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 text-sm shadow-sm focus:border-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light/30 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
                  required
                />
                {fieldErrors.observedAt != null && (
                  <p
                    className="text-red-700 text-sm dark:text-red-300"
                    id="report-observed-at-error"
                  >
                    {fieldErrors.observedAt}
                  </p>
                )}
              </label>
            </div>
          </details>
        )}

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
