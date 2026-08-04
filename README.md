# NiceMusic 🎧

Remplaçant **Deezer gratuit, sans VPS** : frontend statique sur **Cloudflare Pages**, API sur
**Cloudflare Workers**, données dans **Cloudflare KV**. La lecture utilise **YouTube** (flux audio
seul) via des instances **Invidious** publiques, avec bascule automatique.

PWA installable sur Android : contrôles play/pause/précédent/suivant sur l'écran verrouillé
(Media Session API), musique qui continue quand l'écran s'éteint.

## Fonctionnalités

- **Import de l'export Deezer** : fichiers `playlists.json` / `favorites.json` / `history.json`
  (demande de données personnelles), **ou le CSV « mes favoris »** (tableau exporté, favoris uniquement) →
  conversion automatique. Les titres sont cherchés sur YouTube à la lecture.
- **Lecture via le lecteur officiel YouTube** (par défaut) : fiable, la musique continue écran verrouillé
  avec les contrôles YouTube, **vidéo masquée par défaut** (bouton « Vidéo » dans le player pour l'afficher).
- **Mode « Audio seul » (Invidious)** en option (Réglages) : flux audio uniquement via instances
  Invidious (économise les données mais dépend de sources instables).
- **Recherche YouTube** : via instances Invidious publiques relayées par Jina Reader (les IP
  datacenter sont bloquées par les instances), avec bascule automatique.
- **Contrôles écran verrouillé** : fournis par le player YouTube (mode par défaut) ou par la
  Media Session API (mode audio).
- **Favoris + historique + playlists**, synchronisés entre téléphone et PC via KV.
- **PWA** : installation sur l'écran d'accueil Android, plein écran.

## Stack

React 19 · TypeScript · Vite 6 · Tailwind CSS v4 · React Router 7 · Zustand · TanStack Query ·
vite-plugin-pwa (Workbox) · Cloudflare Workers (wrangler) · Cloudflare KV.

## Structure

```
├── src/                 # Frontend (Vite)
│   ├── api/             #   client API + hooks de données (TanStack Query)
│   ├── components/      #   UI : player bar, liste de titres, nav, import…
│   ├── lib/             #   types, import Deezer, Media Session
│   ├── pages/           #   Accueil, Favoris, Historique, Playlists, Réglages
│   └── stores/          #   store du lecteur (Zustand) + <audio> singleton
├── worker/              # API Cloudflare Workers (proxy Invidious + KV)
│   └── src/index.ts     #   routes /api/*, rotation d'instances
├── scripts/gen-icons.mjs# génération des icônes PWA (PNG natif, sans dépendance)
└── public/icons/        # icônes PWA générées
```

## Développement local

Prérequis : Node 20+, pnpm. Aucun compte Cloudflare nécessaire pour développer.

```bash
pnpm install

# Terminal 1 — API (Worker local, port 8787)
pnpm worker:dev

# Terminal 2 — frontend (Vite, port 5173 ; /api est proxifié vers 8787)
pnpm dev
```

Ouvrez http://localhost:5173. En local, la donnée KV est stockée dans `.wrangler/`
(le `id` du namespace dans `worker/wrangler.toml` peut être un placeholder).

Autres scripts : `pnpm build` (type-check + build), `pnpm gen:icons`, `pnpm preview`.

## Déploiement (Cloudflare, gratuit)

### 1. Namespace KV

```bash
npx wrangler login
npx wrangler kv namespace create NICEMUSIC_KV
```

Collez l'`id` retourné dans `worker/wrangler.toml` → `[[kv_namespaces]] id = "…"`.

### 2. API Worker

```bash
pnpm worker:deploy   # déploie nicemusic-api sur *.workers.dev
```

### 3. Frontend (Pages)

Option A — CLI :

```bash
pnpm build
pnpm deploy:pages    # crée le projet Pages « nicemusic » et publie dist/
```

Option B — intégration GitHub (recommandée pour la maintenance) :

1. Poussez le repo sur GitHub.
2. Cloudflare Pages → « Create project » → connecter le repo.
3. Build command : `pnpm build` · Output directory : `dist` · Root : `/`.

### 4. Domaine + variable d'API

- Pages : ajoutez le domaine `music.ledeunf.fr` dans les réglages Pages.
- **CNAME requis** (Cloudflare ne le crée pas via l'API) : DNS → Ajouter un enregistrement →
  type `CNAME`, nom `music`, cible `nicemusic.pages.dev`, proxied ✓.
- Frontend → Worker : définissez la variable d'environnement Pages
  `VITE_API_BASE=https://nicemusic-api.<votre-sous-domaine>.workers.dev` (rebuild requis).
  En local, l'absence de variable utilise `/api` (proxy Vite).

### 5. Installer sur Android

Ouvrez `https://music.ledeunf.fr` dans Chrome → menu ⋮ → « Ajouter à l'écran d'accueil ».

## Limites connues

- **Mode « Audio seul »** : dépend d'instances Invidious publiques hors de notre contrôle (2026 :
  écosystème dégradé, proxies de flux instables). Le mode par défaut (lecteur YouTube officiel)
  contourne ce problème. Liste maintenue dans `src/lib/invidious.ts`.
- **Mode YouTube** : la vidéo est chargée (masquée par défaut) et consomme plus de données ;
  des publicités peuvent apparaître ; sur iOS Safari la lecture en arrière-plan n'est pas garantie
  (Android OK — c'est la cible).
- **Recherche** : passe par le relais Jina Reader (`r.jina.ai`, gratuit, sans clé — limité en débit).
- **Quotas KV free tier** : 100 000 lectures/jour, 1 000 écritures/jour. Conçu pour : les données
  sont stockées par lots, l'historique n'est écrit qu'après 20 s d'écoute (max 1/30 s), les mappings
  Deezer→YouTube sont batchés.
- **Export Deezer** : le format varie selon les versions ; le parseur accepte les champs courts et
  longs, et le CSV « mes favoris ». Un titre non mappé est cherché sur YouTube à la première
  lecture (badge « Deezer », choix du meilleur résultat : titre exact, officiel de préférence).
- **Usage personnel assumé** : la lecture YouTube passe par le player officiel embarqué (usage
  personnel, à respecter les CGU YouTube).

## À faire (idées)

- Mode aléatoire / répétition, recherche dans ses favoris, export des playlists en JSON
- Mapping manuel « remplacer par un autre résultat YouTube » pour un titre Deezer mal mappé
- Préchargement du titre suivant
