import { useQuery } from '@tanstack/react-query'
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
import { PageBody, PageHeader, PageScroll } from '~/components/app-shell'
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
  loader: () => loadSettings(),
  component: SettingsPage,
})

function SettingsPage() {
  const settings = Route.useLoaderData()
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
                <PrepModelCard model={settings.prepModel} onSaved={() => router.invalidate()} />
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

function PrepModelCard({ model, onSaved }: { model: string; onSaved: () => void }) {
  const [value, setValue] = useState(model)
  const [busy, setBusy] = useState(false)

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
        <Input
          className="min-w-0"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          spellCheck={false}
        />
        <Button className="shrink-0" variant="outline" onClick={save} loading={busy} disabled={!value.trim()}>
          Save
        </Button>
      </div>
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
