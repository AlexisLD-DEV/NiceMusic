import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useFavorites } from './api/queries'
import { startFavoritesBackfill } from './stores/player'

// Chargement à la demande : chaque page est un chunk séparé → JS initial plus
// léger, premier affichage plus rapide sur mobile.
const Home = lazy(() => import('./pages/Home'))
const Favorites = lazy(() => import('./pages/Favorites'))
const History = lazy(() => import('./pages/History'))
const Artists = lazy(() => import('./pages/Artists'))
const Playlists = lazy(() => import('./pages/Playlists'))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail'))
const Settings = lazy(() => import('./pages/Settings'))

// PlayerBar et BottomNav sont aussi lazy pour réduire le bundle initial
const PlayerBar = lazy(() => import('./components/PlayerBar'))
const BottomNav = lazy(() => import('./components/BottomNav'))

function PageLoader() {
  return (
    <div className="safe-top flex items-center justify-center py-20 text-sm text-muted">
      <span className="eq">
        <span />
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}

/**
 * Déclenche le pré-mapping des favoris dès le démarrage de l'app (quelle que
 * soit la page ouverte), une fois les favoris chargés.
 */
function BackfillTrigger() {
  const { query } = useFavorites()
  const tracks = query.data?.tracks
  useEffect(() => {
    if (tracks && tracks.length > 0) startFavoritesBackfill(tracks)
  }, [tracks])
  return null
}

export default function App() {
  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <BackfillTrigger />
      {/* Zone défilante */}
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Favorites />} />
            <Route path="/search" element={<Home />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/history" element={<History />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/playlists/:id" element={<PlaylistDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <Suspense fallback={null}>
        <PlayerBar />
        <BottomNav />
      </Suspense>
    </div>
  )
}
