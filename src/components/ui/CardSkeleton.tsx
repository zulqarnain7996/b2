type CardSkeletonProps = {
  rows?: number;
};

export function CardSkeleton({ rows = 3 }: CardSkeletonProps) {
  return (
    <div className="app-card p-5">
      <div className="h-5 w-40 animate-pulse rounded-md bg-slate-200" />
      <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-slate-100" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
