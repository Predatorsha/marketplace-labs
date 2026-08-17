import type { PackageStatusKey } from '../../../shared/types'
import PixelMascot from './PixelMascot'

/**
 * Картинка кота по статусу посылки (спрайты из макета: processing, in_transit,
 * delivered, …). Самих картинок в репо пока нет — маппинг пустой, вместо них
 * показываем пиксельную мордочку-заглушку. Когда ассеты появятся, положить их
 * в src/renderer/src/assets/package-status/ и прописать импорты здесь.
 */
const STATUS_IMAGES: Partial<Record<PackageStatusKey, string>> = {}

type Props = {
  status: PackageStatusKey
  size?: number
  className?: string
}

export default function PackageStatusCat({
  status,
  size = 56,
  className
}: Props): React.JSX.Element {
  const src = STATUS_IMAGES[status]
  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt=""
        className={className}
        style={{ imageRendering: 'pixelated' }}
      />
    )
  }
  return <PixelMascot variant="face" size={size} className={className} />
}
