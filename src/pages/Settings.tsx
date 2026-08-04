import { ImportDeezer } from '../components/ImportDeezer'
import { InstanceStatus } from '../components/InstanceStatus'

export default function Settings() {
  return (
    <div className="safe-top flex flex-col gap-4 px-4 pb-6 pt-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Réglages</h1>
        <p className="text-sm text-muted">Import, instances et informations.</p>
      </header>

      <ImportDeezer />
      <InstanceStatus />

      <section className="rounded-2xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
        <h2 className="mb-1 text-sm font-semibold text-text">À propos</h2>
        <p>
          <strong className="text-text">NiceMusic</strong> est un remplaçant Deezer gratuit, sans VPS : frontend
          statique sur Cloudflare Pages, API sur Cloudflare Workers, données dans KV.
        </p>
        <p className="mt-2">
          La lecture utilise <strong className="text-text">YouTube</strong> via des instances{' '}
          <strong className="text-text">Invidious</strong> publiques (flux audio seul) ; la recherche passe par le
          relais Jina Reader. Cette dépendance est assumée : si tout est hors ligne, la recherche et la lecture
          s'arrêtent.
        </p>
        <p className="mt-2">
          Quotas du free tier Cloudflare : 100 000 lectures KV/jour et 1 000 écritures/jour — largement suffisant en
          usage personnel (les données sont stockées par lots, pas titre par titre).
        </p>
      </section>
    </div>
  )
}
