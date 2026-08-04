import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Svg(props: P) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  )
}

export const SearchIcon = (p: P) => (
  <Svg {...p}>
    <circle cx={11} cy={11} r={7} />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const HeartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 20.5s-7.5-4.7-9.3-9.2C1.4 8 3.4 5 6.5 5c2 0 3.4 1.1 4.2 2.4h2.6C14.1 6.1 15.5 5 17.5 5c3.1 0 5.1 3 3.8 6.3-1.8 4.5-9.3 9.2-9.3 9.2Z" />
  </Svg>
)

export const HeartFilledIcon = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M12 20.5s-7.5-4.7-9.3-9.2C1.4 8 3.4 5 6.5 5c2 0 3.4 1.1 4.2 2.4h2.6C14.1 6.1 15.5 5 17.5 5c3.1 0 5.1 3 3.8 6.3-1.8 4.5-9.3 9.2-9.3 9.2Z" />
  </Svg>
)

export const HistoryIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </Svg>
)

export const ListIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h12M9 12h12M9 18h12" />
    <circle cx={4} cy={6} r={1} fill="currentColor" />
    <circle cx={4} cy={12} r={1} fill="currentColor" />
    <circle cx={4} cy={18} r={1} fill="currentColor" />
  </Svg>
)

export const SettingsIcon = (p: P) => (
  <Svg {...p}>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
)

export const PlayIcon = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.9l11-6.5a1 1 0 0 0 0-1.7l-11-6.5A1 1 0 0 0 8 5.5Z" />
  </Svg>
)

export const PauseIcon = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <rect x={6} y={5} width={4} height={14} rx={1} />
    <rect x={14} y={5} width={4} height={14} rx={1} />
  </Svg>
)

export const PrevIcon = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M7 6a1 1 0 0 1 2 0v12a1 1 0 1 1-2 0Z" />
    <path d="M18 6.3v11.4a1 1 0 0 1-1.6.8l-8.2-5.7a1 1 0 0 1 0-1.6l8.2-5.7a1 1 0 0 1 1.6.8Z" />
  </Svg>
)

export const NextIcon = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none">
    <path d="M15 6a1 1 0 0 0-2 0v12a1 1 0 1 0 2 0Z" />
    <path d="M6 6.3v11.4a1 1 0 0 0 1.6.8l8.2-5.7a1 1 0 0 0 0-1.6L7.6 5.5a1 1 0 0 0-1.6.8Z" />
  </Svg>
)

export const UploadIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Svg>
)

export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-.8 12a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 7" />
    <path d="M10 11v6m4-6v6" />
  </Svg>
)

export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 13 4 4L19 7" />
  </Svg>
)

export const RefreshIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Svg>
)

export const ChevronLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
)

export const MusicIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx={6} cy={18} r={3} />
    <circle cx={18} cy={16} r={3} />
  </Svg>
)

export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
