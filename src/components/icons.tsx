interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
}

export function ListGlyph({ size = 22, color = 'currentColor', strokeWidth = 2.1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.2 6l1 1 1.8-2" />
      <path d="M4.2 12l1 1 1.8-2" />
      <path d="M4.2 18l1 1 1.8-2" />
    </svg>
  )
}

export function RouteGlyph({ size = 22, color = 'currentColor', strokeWidth = 2.1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="18" cy="18" r="2.3" />
      <path d="M6 8.3v3.7a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3" />
    </svg>
  )
}

export function MapGlyph({ size = 22, color = 'currentColor', strokeWidth = 2.1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  )
}

export function GenreGlyph({ size = 22, color = 'currentColor', strokeWidth = 2.1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12l-8 8-9-9V3h8l9 9z" />
      <circle cx="7.5" cy="7.5" r="1.4" fill={color} stroke="none" />
    </svg>
  )
}

export function SettingsGlyph({ size = 22, color = 'currentColor', strokeWidth = 2.1 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.4M12 18.1v2.4M4.6 7.2l2.1 1.2M17.3 15.6l2.1 1.2M4.6 16.8l2.1-1.2M17.3 8.4l2.1-1.2M3.5 12h2.4M18.1 12h2.4" />
    </svg>
  )
}
