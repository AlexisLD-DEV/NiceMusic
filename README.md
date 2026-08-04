# NiceMusic 🎧

Remplaçant **Deezer gratuit, sans VPS** : frontend statique sur **Cloudflare Pages**, API sur
**Cloudflare Workers**, données dans **Cloudflare KV**. La lecture utilise **YouTube** (flux audio
seul) via des instances **Invidious** publiques, avec bascule automatique.

PWA installable sur Android : contrôles play/pause/précédent/suivant sur l'écran verrouillé
(Media Session API), musique qui continue quand l'écran s'éteint.

## Fonctionnalités

- **Import de l'export Deezer** : upload de `playlists.json` / `favorites.json` / `history.json`
  (données personnelles) → conversion automatique. Les titres sont cherchés sur YouTube à la lecture.
- **Recherche YouTube** via instances Invidious publiques, avec fallback automatique et rotation.
- **Lecture audio seule** (m4a/opus, pas de vidéo), en arrière-plan.
- **Contrôles écran verrouillé** : play/pause/précédent/suivant/seek (Media Session API).
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
- Frontend → Worker : définissez la variable d'environnement Pages
  `VITE_API_BASE=https://nicemusic-api.<votre-sous-domaine>.workers.dev` (rebuild requis).
  En local, l'absence de variable utilise `/api` (proxy Vite).

### 5. Installer sur Android

Ouvrez `https://music.ledeunf.fr` dans Chrome → menu ⋮ → « Ajouter à l'écran d'accueil ».

## Limites connues

- **Dépendance à Invidious** : instances publiques, hors de notre contrôle. Si toutes tombent,
  recherche et lecture s'arrêtent (liste maintenue dans `worker/src/instances.ts` ; le Worker
  pré-valide les flux et bascule automatiquement).
- **Écosystème Invidious dégradé** (2026) : le endpoint `/api/v1/videos` est bloqué sur la plupart
  des instances ; NiceMusic utilise le repli `/latest_version?id=…&itag=140` (flux m4a direct,
  pré-validé par une requête Range).
- **Quotas KV free tier** : 100 000 lectures/jour, 1 000 écritures/jour. Conçu pour : les données
  sont stockées par lots (favoris, historique, playlists = 1 clé chacun), pas une clé par titre.
- **Export Deezer** : le format varie selon les versions ; le parseur accepte les champs courts et
  longs. Un titre non mappé est cherché sur YouTube à la première lecture (badge « Deezer »).
- **CORS / streams** : la lecture est en direct depuis l'instance (jamais via le Worker, pour ne
  pas consommer de bande passante serveur). Certains réseaux peuvent bloquer ces domaines.
- **Usage personnel assumé** : les streams YouTube proviennent de sources tierces non officielles
  (Invidious), à utiliser dans le cadre de votre usage personnel.

## À faire (idées)

- Mode aléatoire / répétition, recherche dans ses favoris, export des playlists en JSON
- Mapping manuel « remplacer par un autre résultat YouTube » pour un titre Deezer mal mappé
- Préchargement du titre suivant
