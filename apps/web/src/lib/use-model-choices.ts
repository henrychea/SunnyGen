import { ALL_MODELS, PROVIDERS } from '@sunnygen/core'
import { useQuery } from '@tanstack/react-query'
import type { ModelOption } from '~/components/model-combobox'
import { loadModelCatalog } from '~/server/model-catalog.functions'
import { catalogModelDefinition } from './catalog-model'
import { videoEditOnly } from './video-flow'

/**
 * Supported models with the latest provider prices, plus catalog-only models
 * for pickers that want to show the provider's full list.
 */
export function useModelChoices(): {
  choices: ModelOption[]
  catalogOnly: ModelOption[]
  loading: boolean
} {
  const catalog = useQuery({
    queryKey: ['model-catalog'],
    queryFn: () => loadModelCatalog(),
    staleTime: 60_000,
  })

  const supported = (catalog.data?.entries ?? []).filter((entry) => entry.supported && entry.modelId)
  const choices: ModelOption[] = ALL_MODELS.map((model) => {
    const matches = supported.filter((entry) => entry.modelId === model.id)
    const prices = matches
      .map((entry) => entry.price)
      .filter((price): price is string => Boolean(price))
      .sort((left, right) => left.length - right.length)
    const first = matches[0]
    return {
      key: `model:${model.id}`,
      label: first?.label ?? model.label,
      company: model.providerLabel,
      provider: model.providers[0] ?? 'sunra',
      providerLabel: model.providers
        .map((provider) => PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider)
        .join(' / '),
      kind: model.kind,
      price: prices[0] ?? model.price ?? null,
      sourceId: first?.sourceId ?? model.id,
      supported: true,
      modelId: model.id,
      definition: model,
      editOnly: model.kind === 'video' ? videoEditOnly(model) : undefined,
      providers: model.providers.map((provider) => ({
        id: provider,
        label: PROVIDERS.find((entry) => entry.id === provider)?.label ?? provider,
      })),
    } satisfies ModelOption
  })

  const catalogOnly: ModelOption[] = (catalog.data?.entries ?? [])
    .filter((entry) => !entry.supported)
    .map((entry) => {
      const definition = catalogModelDefinition(entry)
      return {
        key: entry.key,
        label: entry.label,
        company: entry.company,
        provider: entry.provider,
        providerLabel: entry.providerLabel,
        kind: entry.kind,
        price: entry.price,
        sourceId: entry.sourceId,
        supported: false,
        modelId: entry.key,
        definition,
        editOnly: definition.kind === 'video' ? videoEditOnly(definition) : undefined,
        providers: [{ id: entry.provider, label: entry.providerLabel }],
        disabled: !entry.available,
        limitation: entry.limitation,
      } satisfies ModelOption
    })

  return { choices, catalogOnly, loading: catalog.isLoading }
}
