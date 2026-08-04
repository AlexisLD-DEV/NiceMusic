import { ImportDeezer } from '../components/ImportDeezer'
import { InstanceStatus } from '../components/InstanceStatus'
import { usePlayer, type PlaybackMode } from '../stores/player'

export default function Settings() {
  const { mode, setMode } = usePlayer()

  const modes: { id: PlaybackMode; label: string; desc: string }[] = [
    {
      id: 'youtube',
      label: 'Lecteur YouTube (recommandé)',
      desc: 'Lecteur officiel YouTube : fiable, lecture en arrière-plan, vidéo masquée par défaut (bouton « Vidéo » dans le player).'
    },
    {
      id: 'audio',
      label: 'Audio seul (Invidious)',
      desc: 'Flux audio uniquement (économise les données) mais dépend des instances Invidious, parfois instables.'
    }
  ]

  return (
    <div className="safe-top flex flex-col gap-4 px-4 pb-6 pt-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Réglages</h1>
        <p className="text-sm text-muted">Lecture, import, instances et informations.</p>
      </header>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-2 text-sm font-semibold">Mode de lecture</h2>
        <div className="flex flex-col gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                mode === m.id ? 'border-accent bg-surface2' : 'border-border'
              }`}
            >
              <p className="text-sm font-medium">
                {m.label} {mode === m.id && <span className="text-accent">✓</span>}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{m.desc}</p>
            </button>
          ))}
        </div>
      </section>

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
