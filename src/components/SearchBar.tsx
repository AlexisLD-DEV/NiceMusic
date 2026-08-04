import { CloseIcon, SearchIcon } from './icons'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = 'Rechercher un titre, un artiste…' }: Props) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-surface2 px-4 py-2.5">
      <SearchIcon width={18} height={18} className="shrink-0 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type="search"
        enterKeyHint="search"
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
      />
      {value && (
        <button onClick={() => onChange('')} className="shrink-0 text-muted" aria-label="Effacer la recherche">
          <CloseIcon width={16} height={16} />
        </button>
      )}
    </div>
  )
}
