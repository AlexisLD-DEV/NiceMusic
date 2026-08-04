import { ImportDeezer } from '../components/ImportDeezer'
import { AddByLink } from '../components/AddByLink'

export default function Settings() {
  return (
    <div className="safe-top flex flex-col gap-4 px-4 pb-6 pt-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Réglages</h1>
        <p className="text-sm text-muted">Import, liens YouTube et informations.</p>
      </header>

      <AddByLink />

      <ImportDeezer />

      <section className="rounded-2xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
        <h2 className="mb-1 text-sm font-semibold text-text">À propos</h2>
        <p>
          <strong className="text-text">NiceMusic</strong> est un remplaçant Deezer gratuit, sans VPS : frontend
          statique sur Cloudflare Pages, API sur Cloudflare Workers, données dans KV.
        </p>
        <p className="mt-2">
          La lecture et la recherche utilisent <strong className="text-text">YouTube</strong> (lecteur officiel
          intégré, vidéo masquée par défaut — bouton « Vidéo » dans le player pour l'afficher).
        </p>
        <p className="mt-2">
          Quotas du free tier Cloudflare : 100 000 lectures KV/jour et 1 000 écritures/jour — largement suffisant en
          usage personnel (les données sont stockées par lots, pas titre par titre).
        </p>
      </section>
    </div>
  )
}
