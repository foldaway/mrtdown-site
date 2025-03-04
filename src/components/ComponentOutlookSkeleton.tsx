export const ComponentOutlookSkeleton: React.FC = () => (
  <div className="flex animate-pulse flex-col rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-x-1.5">
        <div className="w-12 animate-pulse rounded bg-gray-300 px-2 py-0.5 text-transparent text-xs dark:bg-gray-600">
          _
        </div>
        <div className="w-36 animate-pulse rounded bg-gray-700 px-2 py-0.5 text-transparent text-xs dark:bg-gray-200">
          _
        </div>
      </div>
      <div className="w-20 animate-pulse rounded bg-operational-light px-2 py-0.5 text-transparent text-xs dark:bg-operational-dark">
        _
      </div>
    </div>
    <div className="flex items-center justify-between">
      {Array.from({ length: 90 }, (_, x) => x).map((i) => (
        <div
          key={i}
          className="h-5 w-1.5 shrink-0 rounded-xs bg-gray-400 dark:bg-gray-600"
        />
      ))}
    </div>
    <div className="mt-1 flex items-center justify-between">
      <div className="w-12 animate-pulse rounded bg-gray-300 text-transparent text-xs dark:bg-gray-600">
        _
      </div>
      <div className="w-12 animate-pulse rounded bg-gray-300 text-transparent text-xs dark:bg-gray-600">
        _
      </div>
    </div>
  </div>
);
