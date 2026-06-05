import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
      <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" aria-hidden />
      {label}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-sm text-slate-400">{children}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div role="alert" className="py-16 text-center">
      <p className="text-sm text-rose-300">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-slate-200"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
