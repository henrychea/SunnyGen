import { Selector } from '@sunnygen/ui'

const RATIO_NAMES: Record<string, string> = {
  auto: 'Automatic',
  '21:9': 'Cinematic',
  '16:9': 'Widescreen',
  '3:2': 'Landscape',
  '4:3': 'Classic',
  '5:4': 'Large format',
  '1:1': 'Square',
  '4:5': 'Portrait',
  '3:4': 'Portrait',
  '2:3': 'Portrait',
  '9:16': 'Vertical',
  '2:1': 'Banner',
  '1:2': 'Tall',
}

export function ratioName(value: string): string {
  return RATIO_NAMES[value] ?? `${value} ratio`
}

export function RatioGlyph({ ratio }: { ratio: string }) {
  if (ratio === 'auto') {
    return (
      <span className="grid size-5 place-items-center" aria-hidden="true">
        <span className="border-ink/50 size-3.5 rounded-[2px] border border-dashed" />
      </span>
    )
  }
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return <span className="size-5" />
  const scale = 16 / Math.max(width, height)
  return (
    <span className="grid size-5 place-items-center" aria-hidden="true">
      <span
        className="border-ink/40 bg-ink/[0.03] rounded-[2px] border"
        style={{
          width: Math.max(6, Math.round(width * scale)),
          height: Math.max(5, Math.round(height * scale)),
        }}
      />
    </span>
  )
}

export function AspectRatioSelector({
  value,
  ratios,
  disabled = false,
  className,
  onChange,
}: {
  value: string
  ratios: string[]
  disabled?: boolean
  className?: string
  onChange: (ratio: string) => void
}) {
  return (
    <Selector
      className={className}
      size="sm"
      value={value}
      disabled={disabled}
      ariaLabel="Aspect ratio"
      options={ratios.map((option) => ({
        key: option,
        label: option === 'auto' ? 'Auto' : option,
        description: ratioName(option),
        leading: <RatioGlyph ratio={option} />,
      }))}
      showTriggerDescription={false}
      menuMinWidth={190}
      onChange={(option) => onChange(option.key)}
    />
  )
}

export function QualitySelector({
  value,
  options,
  disabled = false,
  className,
  onChange,
}: {
  value: string
  options: string[]
  disabled?: boolean
  className?: string
  onChange: (quality: string) => void
}) {
  return (
    <Selector
      className={className}
      size="sm"
      value={value}
      disabled={disabled}
      ariaLabel="Quality"
      options={options.map((option) => ({
        key: option,
        label: option.toUpperCase(),
        description: 'Quality',
      }))}
      showTriggerDescription={false}
      menuMinWidth={160}
      onChange={(option) => onChange(option.key)}
    />
  )
}
