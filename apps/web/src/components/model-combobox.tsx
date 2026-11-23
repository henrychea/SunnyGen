import { Selector, type SelectorFilter, type SelectorOption } from '@sunnygen/ui'
import type { ModelDefinition } from '@sunnygen/core'
import { useMemo } from 'react'

export interface ModelOption {
  key: string
  label: string
  company: string
  provider: string
  providerLabel: string
  kind: 'image' | 'video' | 'text'
  price: string | null
  sourceId: string
  supported: boolean
  modelId: string | null
  disabled?: boolean
  limitation?: string | null
  definition?: ModelDefinition
  editOnly?: boolean
  providers?: Array<{ id: string; label: string }>
}

type ComboboxSize = 'sm' | 'md'

export function ModelCombobox({
  value,
  options,
  placeholder = 'Select a model',
  size = 'md',
  disabled = false,
  showCompanyFilter = true,
  className,
  ariaLabel,
  onChange,
  menuClassName,
}: {
  value: string | null
  options: ModelOption[]
  placeholder?: string
  size?: ComboboxSize
  disabled?: boolean
  showCompanyFilter?: boolean
  className?: string
  ariaLabel?: string
  menuClassName?: string
  onChange: (entry: ModelOption) => void
}) {
  const selectedKey = options.find((entry) => entry.modelId === value)?.key ?? null

  const filters = useMemo<SelectorFilter[]>(() => {
    if (!showCompanyFilter) return []
    const map = new Map<string, string>()
    for (const entry of options) {
      const list = entry.providers ?? [{ id: entry.provider, label: entry.providerLabel }]
      for (const item of list) map.set(item.id, item.label)
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [options, showCompanyFilter])

  const selectorOptions = useMemo<SelectorOption[]>(
    () =>
      options.map((entry) => {
        const providers = entry.providers ?? [{ id: entry.provider, label: entry.providerLabel }]
        const status = entry.disabled
          ? entry.limitation
            ? ` · ${entry.limitation}`
            : ' · unavailable'
          : entry.supported
            ? ''
            : ' · generic'
        return {
          key: entry.key,
          label: entry.label,
          description: `${entry.providerLabel} · ${entry.kind}${status}`,
          triggerDescription: `${entry.providerLabel} · ${entry.kind}${
            entry.price ? ` · ${entry.price}` : ''
          }`,
          meta: entry.price ?? 'No price',
          group: entry.company,
          disabled: entry.disabled,
          filterIds: providers.map((item) => item.id),
          searchText: [
            entry.label,
            entry.company,
            entry.providerLabel,
            ...providers.map((item) => item.label),
            entry.sourceId,
            entry.price ?? '',
            entry.limitation ?? '',
          ].join(' '),
        }
      }),
    [options],
  )

  const hasDisabled = options.some((entry) => entry.disabled)
  const hasGeneric = options.some((entry) => !entry.supported && !entry.disabled)

  return (
    <Selector
      value={selectedKey}
      options={selectorOptions}
      placeholder={placeholder}
      size={size}
      disabled={disabled}
      className={className}
      ariaLabel={ariaLabel}
      searchable
      searchPlaceholder="Search models or prices"
      filters={filters}
      allFilterLabel="All providers"
      menuMinWidth={440}
      menuMaxWidth={560}
      menuClassName={menuClassName}
      footer={
        hasDisabled || hasGeneric ? (
          <div className="space-y-1">
            {hasDisabled ? (
              <p>
                Disabled models need inputs this app does not collect yet, such as audio, video, 3D, masks, or
                a special edit flow.
              </p>
            ) : null}
            {hasGeneric ? (
              <p>
                Generic models map prompt and image/video fields to the provider API; unexposed provider
                controls use defaults.
              </p>
            ) : null}
          </div>
        ) : undefined
      }
      onChange={(option) => {
        const entry = options.find((item) => item.key === option.key)
        if (entry) onChange(entry)
      }}
    />
  )
}
