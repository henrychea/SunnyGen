import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Separator,
} from '@sunnygen/ui'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { ModelCombobox } from '~/components/model-combobox'
import type { CatalogProvider, ModelCatalogView } from '~/server/model-catalog.functions'
import { loadModelCatalog, rebuildModelCatalog } from '~/server/model-catalog.functions'
import {
  clearOpenRouterKey,
  clearProviderKey,
  loadCodexStatus,
  loadSettings,
  saveAzureConfig,
  saveOpenRouterKey,
  savePrepModel,
  saveProviderKey,
} from '~/server/settings.functions'

export const Route = createFileRoute('/settings')({
  loader: async () => {
    const [settings, catalog] = await Promise.all([loadSettings(), loadModelCatalog()])
    return { settings, catalog }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { settings, catalog } = Route.useLoaderData()
  const catalogQuery = useQuery({
    queryKey: ['model-catalog'],
    queryFn: () => loadModelCatalog(),
    initialData: catalog,
  })
  const catalogData = catalogQuery.data ?? catalog
  const router = useRouter()

  return (
    <PageScroll>
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Provider keys stay in your local SQLite database. Nothing is sent to SunnyGen."
      />
      <PageBody>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Providers</CardTitle>
              <p className="text-ink/50 text-[12px]">
                One key per provider. Generations run on your account. Keys are encrypted at rest.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {settings.providers.map((provider) => (
                <ProviderKeyCard
                  key={provider.id}
                  providerId={provider.id}
                  label={provider.label}
                  configured={provider.configured}
                  hasKeySetting={provider.keySetting !== null}
                  onSaved={() => router.invalidate()}
                />
              ))}
              <Separator />
              <AzureCard
                configured={settings.providers.some(
                  (provider) => provider.id === 'azure' && provider.configured,
                )}
                baseUrl={settings.azureBaseUrl}
                deployment={settings.azureDeployment}
                onSaved={() => router.invalidate()}
              />
              <Separator />
              <CodexCard />
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Assistant</CardTitle>
                <p className="text-ink/50 text-[12px]">
                  OpenRouter powers prompt help and the canvas assistant. It is never used for generation. The
                  key is encrypted at rest.
                </p>
              </CardHeader>
              <CardContent>
                <AssistantKeyCard
                  configured={settings.openrouterConfigured}
                  onSaved={() => router.invalidate()}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Studio</CardTitle>
                <p className="text-ink/50 text-[12px]">
                  Model used to turn supplier photos into clean garment references.
                </p>
              </CardHeader>
              <CardContent>
                <PrepModelCard
                  model={settings.prepModel}
                  models={catalogData.entries}
                  onSaved={() => router.invalidate()}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Local storage</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5 text-[12px]">
                <PathRow label="Database" value={settings.dataDir} />
                <PathRow label="Media" value={settings.mediaDir} />
                <PathRow label="Schema" value={`v${settings.databaseVersion}`} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-5">
          <ModelCatalogCard catalog={catalogData} />
        </div>
      </PageBody>
    </PageScroll>
  )
}

function CodexCard() {
  const status = useQuery({ queryKey: ['codex-status'], queryFn: () => loadCodexStatus() })
  const ready = status.data?.ready ?? false
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Codex CLI</Label>
        <Badge tone={ready ? 'success' : 'neutral'}>
          {status.isLoading
            ? 'Checking…'
            : ready
              ? 'Ready'
              : status.data?.installed
                ? 'Sign in required'
                : 'Not installed'}
        </Badge>
      </div>
      <p className="border-line bg-canvas/60 text-ink/50 rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed">
        Runs GPT Image 2 through your ChatGPT plan. Install <code className="font-mono">codex-imagegen</code>{' '}
        and run <code className="font-mono">codex login</code> on this machine to enable it.
      </p>
    </div>
  )
}

function ProviderKeyCard({
  providerId,
  label,
  configured,
  hasKeySetting,
  onSaved,
}: {
  providerId: string
  label: string
  configured: boolean
  hasKeySetting: boolean
  onSaved: () => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    if (!value.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      await saveProviderKey({
        data: { provider: providerId as 'sunra' | 'fal' | 'azure', key: value.trim() },
      })
      setValue('')
      setMessage('Saved')
      onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the key')
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearProviderKey({ data: { provider: providerId as 'sunra' | 'fal' | 'azure' } })
      setMessage('Removed')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Badge tone={configured ? 'success' : 'neutral'}>{configured ? 'Configured' : 'Missing'}</Badge>
      </div>
      {hasKeySetting ? (
        <div className="flex min-w-0 gap-2">
          <Input
            className="min-w-0"
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={configured ? 'Replace API key' : 'Paste API key'}
            autoComplete="off"
            spellCheck={false}
          />
          <Button className="shrink-0" onClick={save} loading={busy} disabled={!value.trim()}>
            Save
          </Button>
          {configured ? (
            <Button className="shrink-0" variant="ghost" onClick={clear} disabled={busy}>
              Clear
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="border-line bg-canvas/60 text-ink/50 rounded-xl border px-3 py-2 text-[11.5px]">
          Codex uses your local CLI login instead of an API key.
        </p>
      )}
      {message ? <p className="text-ink/45 text-[11px]">{message}</p> : null}
    </div>
  )
}

function AzureCard({
  configured,
  baseUrl,
  deployment,
  onSaved,
}: {
  configured: boolean
  baseUrl: string
  deployment: string
  onSaved: () => void
}) {
  const [url, setUrl] = useState(baseUrl)
  const [deploy, setDeploy] = useState(deployment)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await saveAzureConfig({ data: { baseUrl: url.trim(), deployment: deploy.trim() } })
      setMessage('Saved')
      onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save Azure settings')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>Azure deployment</Label>
        <Badge tone={configured && baseUrl && deployment ? 'success' : 'neutral'}>
          {configured && baseUrl && deployment ? 'Ready' : 'Optional'}
        </Badge>
      </div>
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://your-resource.openai.azure.com"
        autoComplete="off"
        spellCheck={false}
      />
      <Input
        value={deploy}
        onChange={(event) => setDeploy(event.target.value)}
        placeholder="gpt-image-2 (deployment name)"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={save} loading={busy}>
          Save Azure
        </Button>
        {message ? <span className="text-ink/45 text-[11px]">{message}</span> : null}
      </div>
    </div>
  )
}

function AssistantKeyCard({ configured, onSaved }: { configured: boolean; onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    if (!value.trim()) return
    setBusy(true)
    try {
      await saveOpenRouterKey({ data: { key: value.trim() } })
      setValue('')
      setMessage('Saved')
      onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the key')
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearOpenRouterKey()
      setMessage('Removed')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>OpenRouter key</Label>
        <Badge tone={configured ? 'success' : 'neutral'}>{configured ? 'Configured' : 'Optional'}</Badge>
      </div>
      <div className="flex min-w-0 gap-2">
        <Input
          className="min-w-0"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={configured ? 'Replace key' : 'sk-or-...'}
          autoComplete="off"
          spellCheck={false}
        />
        <Button className="shrink-0" onClick={save} loading={busy} disabled={!value.trim()}>
          Save
        </Button>
        {configured ? (
          <Button className="shrink-0" variant="ghost" onClick={clear} disabled={busy}>
            Clear
          </Button>
        ) : null}
      </div>
      {message ? <p className="text-ink/45 text-[11px]">{message}</p> : null}
    </div>
  )
}

function ModelCatalogCard({ catalog }: { catalog: ModelCatalogView }) {
  const queryClient = useQueryClient()
  const data = catalog
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState('all')
  const [rebuilding, setRebuilding] = useState<CatalogProvider | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const needle = query.trim().toLowerCase()
  const entries = data.entries.filter((entry) => {
    if (provider !== 'all' && entry.provider !== provider) return false
    if (!needle) return true
    return `${entry.label} ${entry.providerLabel} ${entry.sourceId} ${entry.price ?? ''} ${entry.modelId ?? ''}`
      .toLowerCase()
      .includes(needle)
  })
  const providers = [
    { id: 'all', label: 'All', count: data.entries.length },
    ...Array.from(
      new Map(
        data.entries.map((entry) => [entry.provider, { id: entry.provider, label: entry.providerLabel }]),
      ).values(),
    ).map((entry) => ({
      ...entry,
      count: data.entries.filter((model) => model.provider === entry.id).length,
    })),
  ]
  const supported = data.entries.filter((entry) => entry.supported).length

  const rebuild = async (next: CatalogProvider) => {
    setRebuilding(next)
    setMessage(null)
    setError(null)
    try {
      const result = await rebuildModelCatalog({ data: { provider: next } })
      await queryClient.invalidateQueries({ queryKey: ['model-catalog'] })
      const label = data.sources.find((source) => source.id === next)?.label ?? next
      setMessage(
        `${label}: ${result.count} models, ${result.supported} supported${
          result.priced ? ' with live prices.' : '. Add a provider key to load prices.'
        }`,
      )
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : 'Rebuild failed')
    } finally {
      setRebuilding(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Models</CardTitle>
            <p className="text-ink/50 mt-1 max-w-2xl text-[12px] leading-relaxed">
              Search and filter models by provider. Prices come from the Sunra and fal catalogs when
              available; rebuild them after provider updates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rebuild('sunra')}
              loading={rebuilding === 'sunra'}
              disabled={rebuilding !== null}
            >
              <RefreshCw size={12} /> Rebuild Sunra
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void rebuild('fal')}
              loading={rebuilding === 'fal'}
              disabled={rebuilding !== null}
            >
              <RefreshCw size={12} /> Rebuild fal
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="border-line/70 flex flex-wrap gap-x-4 gap-y-1.5 border-y py-2 text-[10px]">
          {data.sources.map((source) => (
            <div key={source.id} className="flex items-center gap-1.5">
              <span className="text-ink/55 font-medium">{source.label}</span>
              <span className="text-ink/30">
                {source.updatedAt
                  ? `Synced ${new Date(source.updatedAt).toLocaleString()}`
                  : 'Not rebuilt yet'}
                {source.count > 0 ? ` · ${source.count} models` : ''}
                {source.updatedAt && !source.priced ? ' · no prices' : ''}
              </span>
              <a
                href={source.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink/35 hover:text-ink inline-flex items-center gap-0.5"
              >
                Docs <ExternalLink size={9} />
              </a>
            </div>
          ))}
          <span className="text-ink/30">
            {supported} supported · {data.entries.length - supported} catalog only
          </span>
        </div>

        {message ? <p className="text-success text-[11px]">{message}</p> : null}
        {error ? <p className="text-error text-[11px]">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="border-line bg-surface text-ink/45 focus-within:border-accent/40 flex h-9 w-full items-center gap-1.5 rounded-xl border px-2.5 transition-colors sm:max-w-sm">
            <Search size={13} className="shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models, providers, or prices"
              aria-label="Search models"
              className="text-ink placeholder:text-ink/30 min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {providers.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProvider(option.id)}
                className={
                  provider === option.id
                    ? 'bg-ink text-canvas rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium'
                    : 'text-ink/45 hover:text-ink rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium'
                }
              >
                {option.label}
                <span className="ml-1 opacity-55">{option.count}</span>
              </button>
            ))}
          </div>
          <p className="text-ink/30 ml-auto text-[10px]">
            {entries.length} of {data.entries.length}
          </p>
        </div>

        <div className="border-line max-h-[440px] overflow-y-auto rounded-xl border">
          {entries.length === 0 ? (
            <p className="text-ink/35 px-4 py-10 text-center text-[12px]">
              No models match that search or provider.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.key}
                className="border-line/60 flex items-start gap-3 border-b px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="text-ink/75 truncate text-[11.5px] font-medium">{entry.label}</p>
                    <Badge tone={entry.supported ? 'success' : entry.available ? 'accent' : 'neutral'}>
                      {entry.supported ? 'Supported' : entry.available ? 'Generic' : 'Unavailable'}
                    </Badge>
                  </div>
                  <p className="text-ink/35 mt-0.5 truncate text-[9.5px]">
                    {entry.company} · {entry.providerLabel} · {entry.kind} · {entry.sourceId}
                    {entry.limitation ? ` · ${entry.limitation}` : ''}
                  </p>
                </div>
                <div className="max-w-[48%] shrink-0 text-right">
                  <p className="text-ink/60 truncate text-[10.5px] tabular-nums">
                    {entry.price ?? 'No price'}
                  </p>
                  {entry.modelId ? (
                    <p className="text-ink/25 mt-0.5 truncate text-[9px]">{entry.modelId}</p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
        <p className="text-ink/30 text-[10px]">
          Catalog-only models are listed by the provider but are not wired into SunnyGen generation yet.
          Rebuilding updates prices and availability; it does not change generation support.
        </p>
      </CardContent>
    </Card>
  )
}

function PrepModelCard({
  model,
  models,
  onSaved,
}: {
  model: string
  models: ModelCatalogView['entries']
  onSaved: () => void
}) {
  const [value, setValue] = useState(model)
  const [busy, setBusy] = useState(false)
  const options = [
    ...new Map(
      models
        .filter((entry) => entry.supported && entry.kind === 'image' && entry.modelId)
        .map((entry) => [entry.modelId, entry]),
    ).values(),
  ]

  const save = async () => {
    if (!value.trim()) return
    setBusy(true)
    try {
      await savePrepModel({ data: { model: value.trim() } })
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Garment prep model</Label>
      <div className="flex min-w-0 gap-2">
        <div className="min-w-0 flex-1">
          <ModelCombobox
            value={value}
            options={options}
            placeholder="Search image models"
            onChange={(entry) => setValue(entry.modelId ?? value)}
          />
        </div>
        <Button className="shrink-0" variant="outline" onClick={save} loading={busy} disabled={!value.trim()}>
          Save
        </Button>
      </div>
      <p className="text-ink/35 text-[10px]">
        Search by name, provider, or price. Rebuild the catalog below to refresh pricing.
      </p>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink/40 text-[10.5px] font-semibold tracking-[0.08em] uppercase">{label}</span>
      <span className="text-ink/60 truncate font-mono text-[10.5px]">{value}</span>
    </div>
  )
}
