export function ProfileTrendCardSkeleton() {
  return (
    <div className="flex min-h-96 flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700">
      <div className="h-6 w-56 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      <div className="mt-3 h-10 w-40 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      <div className="mt-3 h-5 w-32 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      <div className="mt-4 h-48 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      <div className="mt-4 h-10 w-60 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}

export function ProfileSystemMapCardSkeleton() {
  return (
    <div className="flex min-h-96 flex-col rounded-lg border border-gray-300 p-6 shadow-lg dark:border-gray-700">
      <div className="mb-2 h-6 w-28 animate-pulse rounded-md bg-gray-200 dark:bg-gray-800" />
      <div className="min-h-0 flex-1 bg-gray-100 p-3 dark:bg-gray-800">
        <div className="h-full min-h-80 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}

export function CommunitySignalsSectionSkeleton() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 size-9 shrink-0 animate-pulse rounded-lg bg-amber-100 dark:bg-amber-900/70" />
        <div className="min-w-0 flex-1">
          <div className="h-5 w-40 animate-pulse rounded-md bg-amber-100 dark:bg-amber-900/70" />
          <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded-md bg-amber-100 dark:bg-amber-900/70" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="h-28 animate-pulse rounded-lg border border-amber-200 bg-white dark:border-amber-900 dark:bg-gray-900/70" />
        <div className="hidden h-28 animate-pulse rounded-lg border border-amber-200 bg-white md:block dark:border-amber-900 dark:bg-gray-900/70" />
      </div>
    </section>
  );
}

export function ProfileRecentIssuesSectionSkeleton() {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="h-6 w-36 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
      <div className="mt-4 space-y-3">
        <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" />
        <div className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" />
      </div>
    </section>
  );
}
