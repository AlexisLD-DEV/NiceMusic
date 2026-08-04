import { Navigate, Route, Routes } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { PlayerBar } from './components/PlayerBar'
import Home from './pages/Home'
import Favorites from './pages/Favorites'
import History from './pages/History'
import Playlists from './pages/Playlists'
import PlaylistDetail from './pages/PlaylistDetail'
import Settings from './pages/Settings'

export default function App() {
  return (
    <div className="flex h-full flex-col bg-bg text-text">
      {/* Zone défilante */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Favorites />} />
          <Route path="/search" element={<Home />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/history" element={<History />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/playlists/:id" element={<PlaylistDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <PlayerBar />
      <BottomNav />
    </div>
  )
}
