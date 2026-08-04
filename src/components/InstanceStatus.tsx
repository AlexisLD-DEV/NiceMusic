import { useQuery } from '@tanstack/react-query'
import { checkInstances } from '../lib/invidious'
import { RefreshIcon } from './icons'

/** Liste des instances Invidious avec leur état de santé (page Réglages). */
export function InstanceStatus() {
  const { data, isFetching, refetch, isError } = useQuery({
    queryKey: ['instances'],
    queryFn: checkInstances,
    staleTime: 30_000
  })

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Instances Invidious</h2>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 rounded-full border border-border bg-surface2 px-3 py-1 text-xs transition active:scale-95 disabled:opacity-50"
        >
          <RefreshIcon width={14} height={14} className={isFetching ? 'animate-spin' : ''} />
          Tester
        </button>
      </div>
      <p className="mb-3 text-xs text-muted">
        La recherche et la lecture basculent automatiquement vers une instance saine. Une instance grisée est
        inaccessible depuis ce navigateur (hors ligne ou CORS refusé).
      </p>

      {isError && <p className="text-xs text-red-400">Impossible de tester les instances.</p>}

      <ul className="flex flex-col gap-1.5">
        {(data ?? []).map((inst) => (
          <li key={inst.url} className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${inst.ok ? 'bg-emerald-400' : 'bg-red-400'}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-muted">{inst.url.replace(/^https?:\/\//, '')}</span>
            {inst.ok ? (
              <span className="tabular-nums text-muted">{inst.latencyMs} ms</span>
            ) : (
              <span className="text-red-400">hors ligne</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
