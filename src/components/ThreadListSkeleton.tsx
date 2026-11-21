import { usePrefersReducedMotion } from './SwipeableThreadRow';

function SkeletonRow({ delay = 0 }: { delay?: number }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <li
      aria-hidden="true"
      className="border-b border-[var(--hairline)] last:border-b-0 px-4 py-4.5 flex items-start gap-4"
      style={{ animationDelay: reducedMotion ? undefined : `${delay}ms` }}
    >
      <span className="w-9 h-9 rounded-full shrink-0 skeleton-shimmer" />
      <div className="flex-1 min-w-0 space-y-2.5 pt-0.5">
        <div className="flex justify-between gap-4">
          <span className="h-3 w-28 rounded-full skeleton-shimmer" />
          <span className="h-3 w-10 rounded-full skeleton-shimmer" />
        </div>
        <span className="block h-4 w-[72%] rounded-full skeleton-shimmer" />
        <span className="block h-3.5 w-full max-w-md rounded-full skeleton-shimmer opacity-80" />
      </div>
    </li>
  );
}

export function ThreadListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <ul
      className="mt-2"
      role="status"
      aria-busy="true"
      aria-label="Cargando conversaciones"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} delay={index * 55} />
      ))}
    </ul>
  );
}