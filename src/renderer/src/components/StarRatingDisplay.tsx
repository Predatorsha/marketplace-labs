/** Read-only marketplace rating: `4,5` + five stars (full / half / empty). */

import { useId } from 'react'

export function parseRating(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(5, n)
}

export function formatRatingLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return String(rounded).replace('.', ',')
}

type StarKind = 'full' | 'half' | 'empty'

function starKinds(rating: number): StarKind[] {
  const kinds: StarKind[] = []
  for (let i = 1; i <= 5; i++) {
    const fill = rating - (i - 1)
    if (fill >= 0.75) kinds.push('full')
    else if (fill >= 0.25) kinds.push('half')
    else kinds.push('empty')
  }
  return kinds
}

function StarIcon({
  kind,
  size,
  gradId
}: {
  kind: StarKind
  size: number
  gradId: string
}): React.JSX.Element {
  if (kind === 'full') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="star-icon star-full">
        <path
          fill="currentColor"
          d="M12 2.5l2.9 5.88 6.5.94-4.7 4.58 1.11 6.47L12 17.77l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.94L12 2.5z"
        />
      </svg>
    )
  }
  if (kind === 'half') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="star-icon star-half">
        <defs>
          <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gradId})`}
          stroke="currentColor"
          strokeWidth="1.2"
          d="M12 2.5l2.9 5.88 6.5.94-4.7 4.58 1.11 6.47L12 17.77l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.94L12 2.5z"
        />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="star-icon star-empty">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        d="M12 2.5l2.9 5.88 6.5.94-4.7 4.58 1.11 6.47L12 17.77l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.94L12 2.5z"
      />
    </svg>
  )
}

type Props = {
  rating: string | number | null | undefined
  reviewCount?: string | number | null
  size?: 'sm' | 'md'
  className?: string
}

export default function StarRatingDisplay({
  rating,
  reviewCount,
  size = 'md',
  className = ''
}: Props): React.JSX.Element | null {
  const uid = useId()
  const value = parseRating(rating)
  if (value == null) return null

  const starSize = size === 'sm' ? 12 : 14
  const count =
    reviewCount != null && String(reviewCount).trim() ? String(reviewCount).trim() : null

  return (
    <div
      className={`star-rating-display star-rating-${size}${className ? ` ${className}` : ''}`}
      title={count ? `${formatRatingLabel(value)} · ${count} reviews` : formatRatingLabel(value)}
    >
      <span className="star-rating-value">{formatRatingLabel(value)}</span>
      <span className="star-rating-stars" aria-hidden="true">
        {starKinds(value).map((kind, i) => (
          <StarIcon key={i} kind={kind} size={starSize} gradId={`${uid}-half-${i}`} />
        ))}
      </span>
      {count ? <span className="star-rating-count">({count})</span> : null}
    </div>
  )
}
