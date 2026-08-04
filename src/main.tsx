import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { setupMediaSession } from './lib/mediaSession'
import { usePlayer } from './stores/player'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false }
  }
})

// Contrôles écran verrouillé (Media Session) → actions du store player
setupMediaSession({
  onPlay: () => void usePlayer.getState().toggle(),
  onPause: () => void usePlayer.getState().toggle(),
  onNext: () => usePlayer.getState().next(),
  onPrev: () => usePlayer.getState().prev(),
  onSeek: (time) => usePlayer.getState().seek(time)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
