type IconProps = { className?: string; size?: number }

export function IconDownload({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 1h2v7h3l-4 4-4-4h3V1zm-5 11h12v2H2v-2z"
      />
    </svg>
  )
}

export function IconFolder({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 3h5l1 2h8v9H1V3zm2 3v7h10V7H3z"
      />
    </svg>
  )
}

export function IconBag({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 2h2l1 2h9l1-2h2l-2 8H4L2 4H0V2h1zm4 11a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm7 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
      />
    </svg>
  )
}

export function IconPackage({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1L1 4v8l7 3 7-3V4L8 1zM3 5.5L8 8l5-2.5L8 3 3 5.5zM2 6.7l5 2.4v5.2l-5-2.1V6.7zm7 7.6V9.1l5-2.4v5.5l-5 2.1z"
      />
    </svg>
  )
}

export function IconSettings({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 1h3l.4 2.2a4.8 4.8 0 011.4.8l2.1-.7 1.5 2.6-1.7 1.4c.1.4.1.8 0 1.2l1.7 1.4-1.5 2.6-2.1-.7a4.8 4.8 0 01-1.4.8L9.5 15h-3l-.4-2.2a4.8 4.8 0 01-1.4-.8l-2.1.7L1.1 9.9l1.7-1.4a4.9 4.9 0 010-1.2L1.1 5.9l1.5-2.6 2.1.7a4.8 4.8 0 011.4-.8L6.5 1zM8 6a2 2 0 100 4 2 2 0 000-4z"
      />
    </svg>
  )
}

export function IconPaperclip({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M10.5 2.5a2.5 2.5 0 00-3.5 0L2.8 6.7a3.8 3.8 0 005.4 5.4l4.7-4.7-1.4-1.4-4.7 4.7a1.8 1.8 0 11-2.5-2.5l4.2-4.2a.5.5 0 01.7.7L5.5 8.4l1.4 1.4 3.7-3.7a2.5 2.5 0 00-3.5-3.5L3.4 6.3a4.5 4.5 0 006.4 6.4l5.2-5.2-1.4-1.4-5.2 5.2a2.5 2.5 0 01-3.5-3.5l3.7-3.7z"
      />
    </svg>
  )
}

export function IconDoc({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 1h7l3 3v11H3V1zm7 1.5V5h2.5L10 2.5zM5 7h6v1H5V7zm0 2h6v1H5V9zm0 2h4v1H5v-1z"
      />
    </svg>
  )
}

export function IconImage({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 2h14v12H1V2zm1 1v8l3.5-3.5 2.5 2.5L12 6l2 2V3H2zm3 2a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"
      />
    </svg>
  )
}

export function IconHeart({ className, size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 10.5L1.5 6.2A2.6 2.6 0 015.3 2.5L6 3.2l.7-.7a2.6 2.6 0 013.8 3.7L6 10.5z"
      />
    </svg>
  )
}

export function IconRefresh({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 2a6 6 0 106 6h-2a4 4 0 11-4-4V2zm1-2l5 3.5L9 7V0z"
      />
    </svg>
  )
}

export function IconSearch({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.5 1a5.5 5.5 0 013.96 9.3l3.62 3.62-1.42 1.42-3.62-3.62A5.5 5.5 0 116.5 1zm0 2a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"
      />
    </svg>
  )
}

export function IconPencil({ className, size = 16 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11.3 1.3a1 1 0 011.4 0l2 2a1 1 0 010 1.4l-1.6 1.6-3.4-3.4 1.6-1.6zM8.3 4.3l3.4 3.4-6.4 6.4-3.9.5.5-3.9 6.4-6.4z"
      />
    </svg>
  )
}

export function IconChevronLeft({ className, size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M10.7 2.3L5 8l5.7 5.7 1.4-1.4L7.8 8l4.3-4.3-1.4-1.4z" />
    </svg>
  )
}

export function IconChevronRight({ className, size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M5.3 2.3L4 3.7 8.3 8 4 12.3l1.3 1.4L11 8 5.3 2.3z" />
    </svg>
  )
}
