import { NavLink } from 'react-router-dom'
import { HistoryIcon, HeartIcon, ArtistIcon, SearchIcon, SettingsIcon } from './icons'

const items = [
  { to: '/', label: 'Favoris', icon: HeartIcon, end: true },
  { to: '/search', label: 'Recherche', icon: SearchIcon, end: true },
  { to: '/artists', label: 'Artistes', icon: ArtistIcon, end: false },
  { to: '/history', label: 'Historique', icon: HistoryIcon, end: false },
  { to: '/settings', label: 'Réglages', icon: SettingsIcon, end: false }
]

export function BottomNav() {
  return (
    <nav className="safe-bottom border-t border-border bg-surface">
      <div className="flex">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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

export default BottomNav
