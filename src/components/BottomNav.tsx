import { NavLink } from 'react-router-dom'
import { HistoryIcon, HeartIcon, ListIcon, SearchIcon, SettingsIcon } from './icons'

const items = [
  { to: '/', label: 'Accueil', icon: SearchIcon },
  { to: '/favorites', label: 'Favoris', icon: HeartIcon },
  { to: '/playlists', label: 'Playlists', icon: ListIcon },
  { to: '/history', label: 'Historique', icon: HistoryIcon },
  { to: '/settings', label: 'Réglages', icon: SettingsIcon }
]

export function BottomNav() {
  return (
    <nav className="safe-bottom border-t border-border bg-surface">
      <div className="flex">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] transition-colors ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <Icon width={22} height={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
