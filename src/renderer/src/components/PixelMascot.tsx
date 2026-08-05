/** Pixel-art cat mascot — chest and standing variants. */

type Props = {
  variant?: 'chest' | 'standing' | 'face'
  className?: string
  size?: number
}

export default function PixelMascot({
  variant = 'chest',
  className,
  size
}: Props): React.JSX.Element {
  if (variant === 'face') {
    return (
      <svg
        className={className}
        width={size ?? 36}
        height={size ?? 36}
        viewBox="0 0 18 18"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <rect x="4" y="2" width="10" height="2" fill="#1a1a1a" />
        <rect x="2" y="4" width="14" height="10" fill="#1a1a1a" />
        <rect x="1" y="5" width="2" height="4" fill="#1a1a1a" />
        <rect x="15" y="5" width="2" height="4" fill="#1a1a1a" />
        <rect x="4" y="6" width="3" height="3" fill="#f5d76e" />
        <rect x="11" y="6" width="3" height="3" fill="#f5d76e" />
        <rect x="5" y="7" width="1" height="1" fill="#1a1a1a" />
        <rect x="12" y="7" width="1" height="1" fill="#1a1a1a" />
        <rect x="8" y="9" width="2" height="1" fill="#ff8fab" />
        <rect x="5" y="11" width="2" height="1" fill="#ff8fab" />
        <rect x="11" y="11" width="2" height="1" fill="#ff8fab" />
        <rect x="6" y="14" width="6" height="2" fill="#1a1a1a" />
      </svg>
    )
  }

  if (variant === 'standing') {
    return (
      <svg
        className={className}
        width={size ?? 72}
        height={size ?? 72}
        viewBox="0 0 24 28"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {/* ears */}
        <rect x="5" y="2" width="3" height="3" fill="#1a1a1a" />
        <rect x="16" y="2" width="3" height="3" fill="#1a1a1a" />
        <rect x="6" y="3" width="1" height="1" fill="#ff8fab" />
        <rect x="17" y="3" width="1" height="1" fill="#ff8fab" />
        {/* head */}
        <rect x="4" y="5" width="16" height="10" fill="#1a1a1a" />
        <rect x="6" y="8" width="4" height="3" fill="#f5d76e" />
        <rect x="14" y="8" width="4" height="3" fill="#f5d76e" />
        <rect x="7" y="9" width="2" height="1" fill="#1a1a1a" />
        <rect x="15" y="9" width="2" height="1" fill="#1a1a1a" />
        <rect x="11" y="11" width="2" height="1" fill="#ff8fab" />
        {/* body */}
        <rect x="6" y="15" width="12" height="8" fill="#1a1a1a" />
        <rect x="8" y="17" width="8" height="4" fill="#2a2a2a" />
        {/* paws */}
        <rect x="5" y="23" width="4" height="3" fill="#1a1a1a" />
        <rect x="15" y="23" width="4" height="3" fill="#1a1a1a" />
        <rect x="6" y="25" width="2" height="1" fill="#ff8fab" />
        <rect x="16" y="25" width="2" height="1" fill="#ff8fab" />
        {/* tail */}
        <rect x="18" y="18" width="4" height="2" fill="#1a1a1a" />
        <rect x="20" y="16" width="2" height="2" fill="#1a1a1a" />
      </svg>
    )
  }

  /* chest variant */
  return (
    <svg
      className={className}
      width={size ?? 120}
      height={size ?? 100}
      viewBox="0 0 48 40"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* chest body */}
      <rect x="6" y="18" width="36" height="18" fill="#ff8fab" />
      <rect x="6" y="18" width="36" height="3" fill="#ff6b9d" />
      <rect x="6" y="33" width="36" height="3" fill="#f06292" />
      <rect x="8" y="21" width="32" height="12" fill="#ffa8c5" />
      {/* gold trim */}
      <rect x="5" y="17" width="38" height="2" fill="#f5d76e" />
      <rect x="5" y="35" width="38" height="2" fill="#f5d76e" />
      <rect x="21" y="20" width="6" height="6" fill="#f5d76e" />
      <rect x="22" y="21" width="4" height="4" fill="#ff6b9d" />
      {/* lid */}
      <rect x="4" y="12" width="40" height="6" fill="#ff8fab" />
      <rect x="4" y="12" width="40" height="2" fill="#ff6b9d" />
      <rect x="3" y="11" width="42" height="2" fill="#f5d76e" />
      {/* cat head peeking */}
      <rect x="14" y="2" width="4" height="3" fill="#1a1a1a" />
      <rect x="30" y="2" width="4" height="3" fill="#1a1a1a" />
      <rect x="15" y="3" width="2" height="1" fill="#ff8fab" />
      <rect x="31" y="3" width="2" height="1" fill="#ff8fab" />
      <rect x="12" y="5" width="24" height="12" fill="#1a1a1a" />
      <rect x="15" y="8" width="5" height="4" fill="#f5d76e" />
      <rect x="28" y="8" width="5" height="4" fill="#f5d76e" />
      <rect x="16" y="9" width="3" height="2" fill="#1a1a1a" />
      <rect x="29" y="9" width="3" height="2" fill="#1a1a1a" />
      <rect x="22" y="12" width="4" height="2" fill="#ff8fab" />
      {/* paws on rim */}
      <rect x="10" y="14" width="5" height="3" fill="#1a1a1a" />
      <rect x="33" y="14" width="5" height="3" fill="#1a1a1a" />
    </svg>
  )
}
