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
  cn,
  motionFade,
  motionFadeRise,
  motionPop,
  motionSpring,
  toast,
} from '@sunnygen/ui'
import { ExternalLink, RefreshCw, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
import { NsfwToggle } from '~/components/nsfw-toggle'
import { ModelCombobox } from '~/components/model-combobox'
import { readStoredTheme, writeThemeMode, type ThemeMode } from '~/lib/theme'
import type { CatalogProvider, ModelCatalogView } from '~/server/model-catalog.functions'
import { loadModelCatalog, rebuildModelCatalog } from '~/server/model-catalog.functions'
import {
  clearOpenRouterKey,
  clearProviderKey,
  loadCodexStatus,
  loadLocalStatus,
  loadMediaToolsStatus,
  loadSettings,
  saveAzureConfig,
  saveLocalConfig,
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
              <p className="text-ink/65 text-[12px]">
                One key per provider. Generations run on your account. Keys are encrypted at rest.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {settings.providers
                .filter((provider) => provider.keySetting !== null)
                .map((provider) => (
                  <ProviderKeyCard
                    key={provider.id}
                    providerId={provider.id}
                    label={provider.label}
                    configured={provider.configured}
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
              <LocalServerCard baseUrl={settings.localBaseUrl} onSaved={() => router.invalidate()} />
              <Separator />
              <CodexCard />
              <Separator />
              <MediaToolsCard />
            </CardContent>
          </Card>

          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Adult content</CardTitle>
                <p className="text-ink/65 text-[12px]">
                  Per device. NSFW mode turns off every provider safety filter and unlocks the uncensored
                  models; safe mode sends exactly what SunnyGen has always sent.
                </p>
              </CardHeader>
              <CardContent>
                <NsfwToggle />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assistant</CardTitle>
                <p className="text-ink/65 text-[12px]">
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
                <CardTitle>Theme</CardTitle>
                <p className="text-ink/65 text-[12px]">
                  Stored in this browser. System follows the device appearance setting.
                </p>
              </CardHeader>
              <CardContent>
                <ThemeCard />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Studio</CardTitle>
                <p className="text-ink/65 text-[12px]">
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

function StatusBadge({
  tone,
  value,
}: {
  tone: 'neutral' | 'accent' | 'success' | 'warning' | 'error'
  value: string
}) {
  return (
    <Badge tone={tone}>
      <motion.span
        key={value}
        variants={motionFade}
        initial="hidden"
        animate="visible"
        className="inline-block"
      >
        {value}
      </motion.span>
    </Badge>
  )
}

function CodexCard() {
  const status = useQuery({ queryKey: ['codex-status'], queryFn: () => loadCodexStatus() })
  const ready = status.data?.ready ?? false
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Codex CLI</Label>
        <AnimatePresence initial={false} mode="wait">
          {status.isLoading ? (
            <motion.span
              key="codex-loading"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="skeleton-shimmer block h-4 w-24 rounded-md"
            />
          ) : (
            <motion.span
              key="codex-status"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="inline-flex"
            >
              <StatusBadge
                tone={ready ? 'success' : 'neutral'}
                value={ready ? 'Ready' : status.data?.installed ? 'Sign in required' : 'Not installed'}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="border-line-strong bg-canvas/60 text-ink/65 rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed">
        Runs GPT Image 2 through your ChatGPT plan. Install <code className="font-mono">codex-imagegen</code>{' '}
        and run <code className="font-mono">codex login</code> on this machine to enable it.
      </p>
    </div>
  )
}

function MediaToolsCard() {
  const status = useQuery({ queryKey: ['media-tools-status'], queryFn: () => loadMediaToolsStatus() })
  const ready = status.data?.ffmpeg ?? false
  const version = status.data?.version?.match(/version\s+(\S+)/)?.[1] ?? null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Media tools</Label>
        <AnimatePresence initial={false} mode="wait">
          {status.isLoading ? (
            <motion.span
              key="media-loading"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="skeleton-shimmer block h-4 w-24 rounded-md"
            />
          ) : (
            <motion.span
              key="media-status"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="inline-flex"
            >
              <StatusBadge
                tone={ready ? 'success' : 'warning'}
                value={ready ? `Ready · ffmpeg ${version ?? ''}`.trim() : 'Missing'}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <p className="border-line bg-canvas/60 text-ink/50 rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed">
        {ready ? (
          <>
            ffmpeg extracts frames and joins the finished clips for video copy. ffprobe reads each clip's
            duration, size, and frame rate.
          </>
        ) : (
          <>
            Video copy needs <code className="font-mono">ffmpeg</code> and{' '}
            <code className="font-mono">ffprobe</code>. Install them with{' '}
            <code className="font-mono">apt install ffmpeg</code> on Debian or Ubuntu, or{' '}
            <code className="font-mono">brew install ffmpeg</code> on macOS.
          </>
        )}
      </p>
    </div>
  )
}

function ProviderKeyCard({
  providerId,
  label,
  configured,
  onSaved,
}: {
  providerId: string
  label: string
  configured: boolean
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
        data: { provider: providerId as 'sunra' | 'fal' | 'azure' | 'wiro', key: value.trim() },
      })
      setValue('')
      setMessage('Saved')
      toast(`${label} key saved`, { tone: 'info' })
      onSaved()
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not save the key'
      setMessage(text)
      toast(text, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearProviderKey({ data: { provider: providerId as 'sunra' | 'fal' | 'azure' | 'wiro' } })
      setMessage('Removed')
      toast(`${label} key removed`, { tone: 'info' })
      onSaved()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not remove the key', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <StatusBadge
          tone={configured ? 'success' : 'neutral'}
          value={configured ? 'Configured' : 'Missing'}
        />
      </div>
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
        <AnimatePresence initial={false}>
          {configured ? (
            <motion.div
              key="provider-clear"
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <Button className="shrink-0" variant="ghost" onClick={clear} disabled={busy}>
                Clear
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {message ? (
          <motion.p
            key="provider-key-message"
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="text-ink/65 text-[11px]"
          >
            {message}
          </motion.p>
        ) : null}
      </AnimatePresence>
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
      toast('Azure settings saved', { tone: 'info' })
      onSaved()
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not save Azure settings'
      setMessage(text)
      toast(text, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>Azure deployment</Label>
        <StatusBadge
          tone={configured && baseUrl && deployment ? 'success' : 'neutral'}
          value={configured && baseUrl && deployment ? 'Ready' : 'Optional'}
        />
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
        <AnimatePresence initial={false} mode="wait">
          {message ? (
            <motion.span
              key="azure-message"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="text-ink/65 text-[11px]"
            >
              {message}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

function LocalServerCard({ baseUrl, onSaved }: { baseUrl: string; onSaved: () => void }) {
  const [url, setUrl] = useState(baseUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const status = useQuery({
    queryKey: ['local-status'],
    queryFn: () => loadLocalStatus(),
    refetchInterval: 15_000,
  })
  const reachable = status.data?.reachable ?? false
  const loaded = status.data?.modelLoaded ?? false

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await saveLocalConfig({ data: { baseUrl: url.trim() } })
      setMessage('Saved')
      toast('sd-server URL saved', { tone: 'info' })
      onSaved()
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not save the sd-server URL'
      setMessage(text)
      toast(text, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>Local sd-server</Label>
        <StatusBadge
          tone={reachable && loaded ? 'success' : reachable ? 'warning' : 'neutral'}
          value={reachable ? (loaded ? 'Ready' : 'No model loaded') : 'Not running'}
        />
      </div>
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="http://127.0.0.1:1234"
        autoComplete="off"
        spellCheck={false}
      />
      <p className="border-line-strong bg-canvas/60 text-ink/65 rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed">
        SunnyGen only talks to an sd-server that is already running; it never installs one. Start it with{' '}
        <code className="font-mono">stable-diffusion.cpp</code> and the MOSS-Image files, then retry.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={save} loading={busy}>
          Save URL
        </Button>
        <AnimatePresence initial={false} mode="wait">
          {message ? (
            <motion.span
              key="local-message"
              variants={motionFade}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="text-ink/65 text-[11px]"
            >
              {message}
            </motion.span>
          ) : null}
        </AnimatePresence>
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
      toast('OpenRouter key saved', { tone: 'info' })
      onSaved()
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not save the key'
      setMessage(text)
      toast(text, { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearOpenRouterKey()
      setMessage('Removed')
      toast('OpenRouter key removed', { tone: 'info' })
      onSaved()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not remove the key', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>OpenRouter key</Label>
        <StatusBadge
          tone={configured ? 'success' : 'neutral'}
          value={configured ? 'Configured' : 'Optional'}
        />
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
        <AnimatePresence initial={false}>
          {configured ? (
            <motion.div
              key="assistant-clear"
              variants={motionPop}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <Button className="shrink-0" variant="ghost" onClick={clear} disabled={busy}>
                Clear
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {message ? (
          <motion.p
            key="assistant-key-message"
            variants={motionFadeRise}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="text-ink/65 text-[11px]"
          >
            {message}
          </motion.p>
        ) : null}
      </AnimatePresence>
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
      toast(`${label}: catalog rebuilt`, { tone: 'info' })
    } catch (rebuildError) {
      const text = rebuildError instanceof Error ? rebuildError.message : 'Rebuild failed'
      setError(text)
      toast(text, { tone: 'error' })
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
            <p className="text-ink/65 mt-1 max-w-2xl text-[12px] leading-relaxed">
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
        <div className="border-line/70 flex flex-wrap gap-x-4 gap-y-1.5 border-y py-2 text-[11px]">
          {data.sources.map((source) => (
            <div key={source.id} className="flex items-center gap-1.5">
              <span className="text-ink/65 font-medium">{source.label}</span>
              <span className="text-ink/65">
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
                className="text-ink/65 hover:text-ink inline-flex items-center gap-0.5 transition-colors duration-150 ease-out"
              >
                Docs <ExternalLink size={9} />
              </a>
            </div>
          ))}
          <span className="text-ink/65">
            {supported} supported · {data.entries.length - supported} catalog only
          </span>
        </div>

        <AnimatePresence initial={false}>
          {message ? (
            <motion.p
              key="catalog-message"
              variants={motionFadeRise}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="text-success text-[11px]"
            >
              {message}
            </motion.p>
          ) : null}
          {error ? (
            <motion.p
              key="catalog-error"
              variants={motionFadeRise}
              initial="hidden"
              animate="visible"
              exit="hidden"
              className="text-error text-[11px]"
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="border-line-strong bg-surface text-ink/65 focus-within:border-accent/40 flex h-9 w-full items-center gap-1.5 rounded-xl border px-2.5 transition-colors sm:max-w-sm">
            <Search size={13} className="shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models, providers, or prices"
              aria-label="Search models"
              className="text-ink placeholder:text-ink/65 min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {providers.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProvider(option.id)}
                aria-pressed={provider === option.id}
                className={cn(
                  'relative rounded-lg px-2.5 py-1.5 text-[11px] font-medium',
                  'transition-[color,transform] duration-150 ease-out active:scale-[0.96]',
                  provider === option.id ? 'text-canvas' : 'text-ink/65 hover:text-ink',
                )}
              >
                {provider === option.id ? (
                  <motion.span
                    layoutId="settings-catalog-provider"
                    transition={motionSpring}
                    className="bg-ink absolute inset-0 rounded-lg"
                  />
                ) : null}
                <span className="relative">
                  {option.label}
                  <span className="ml-1 opacity-55">{option.count}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-ink/65 ml-auto text-[11px]">
            {entries.length} of {data.entries.length}
          </p>
        </div>

        <motion.div
          key={provider}
          variants={motionFade}
          initial="hidden"
          animate="visible"
          className="border-line-strong max-h-[440px] overflow-y-auto rounded-xl border"
        >
          <AnimatePresence initial={false} mode="wait">
            {entries.length === 0 ? (
              <motion.p
                key="catalog-empty"
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="text-ink/65 px-4 py-10 text-center text-[12px]"
              >
                No models match that search or provider.
              </motion.p>
            ) : (
              <motion.div
                key="catalog-rows"
                variants={motionFade}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                {entries.map((entry) => (
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
                      <p className="text-ink/65 mt-0.5 truncate text-[11px]">
                        {entry.company} · {entry.providerLabel} · {entry.kind} · {entry.sourceId}
                        {entry.limitation ? ` · ${entry.limitation}` : ''}
                      </p>
                    </div>
                    <div className="max-w-[48%] shrink-0 text-right">
                      <p className="text-ink/65 truncate text-[11px] tabular-nums">
                        {entry.price ?? 'No price'}
                      </p>
                      {entry.modelId ? (
                        <p className="text-ink/65 mt-0.5 truncate text-[11px]">{entry.modelId}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <p className="text-ink/65 text-[11px]">
          Catalog-only models are listed by the provider but are not wired into SunnyGen generation yet.
          Rebuilding updates prices and availability; it does not change generation support.
        </p>
      </CardContent>
    </Card>
  )
}

function ThemeCard() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    typeof window === 'undefined' ? 'system' : readStoredTheme(window.localStorage),
  )
  const options: Array<{ value: ThemeMode; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  const choose = (next: ThemeMode) => {
    setMode(next)
    writeThemeMode(next)
    toast(`Theme set to ${next === 'system' ? 'the device setting' : next}`, { tone: 'info' })
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Appearance</Label>
      <div className="border-line-strong bg-canvas inline-flex w-full gap-1 rounded-xl border p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            onClick={() => choose(option.value)}
            className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-150',
              mode === option.value
                ? 'bg-surface text-ink ring-line-strong ring-1'
                : 'text-ink/65 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
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
      toast('Prep model saved', { tone: 'info' })
      onSaved()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the prep model', { tone: 'error' })
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
      <p className="text-ink/65 text-[11px]">
        Search by name, provider, or price. Rebuild the catalog below to refresh pricing.
      </p>
    </div>
  )
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ink/65 text-[11px] font-semibold">{label}</span>
      <span className="text-ink/65 truncate font-mono text-[11px]">{value}</span>
    </div>
  )
}
