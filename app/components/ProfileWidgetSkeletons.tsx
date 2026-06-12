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
