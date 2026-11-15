import { PROVIDER_IDS, getModel, type ProviderId } from '@sunnygen/core'
import { deleteJob, findGenerationByProviderRequest, getGeneration, updateGeneration } from '@sunnygen/db'
import { getWebhook } from '@sunnygen/providers'
import { adapterFor, providerContext, storeProviderOutputs } from './generation.server'
import { webhookTokenMatches } from './webhook-config.server'

const MAX_BODY_BYTES = 256 * 1024
const TERMINAL: Record<string, true> = { succeeded: true, failed: true, cancelled: true }

function noContent(status = 204): Response {
  return new Response(null, { status })
}

/**
 * Providers POST terminal-state events. The payload is treated only as a hint:
 * the generation is resolved through the provider API with our own key, so a
 * forged body cannot inject assets or flip an unrelated generation.
 */
export async function handleProviderWebhook(
  provider: string,
  token: string,
  request: Request,
): Promise<Response> {
  const providerId = provider as ProviderId
  const webhook = PROVIDER_IDS.includes(providerId) ? getWebhook(providerId) : undefined
  if (!webhook || !webhookTokenMatches(token)) {
    return new Response('Not found', { status: 404 })
  }

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Response('Payload too large', { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return new Response('Payload too large', { status: 413 })
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const requestId = webhook.requestId(body)
  if (!requestId) {
    return new Response('Missing request id', { status: 400 })
  }

  const generation = findGenerationByProviderRequest(providerId, requestId)
  // Acknowledge unknown ids so a retry storm cannot start; this instance may
  // not own the generation, or it may already be pruned.
  if (!generation || TERMINAL[generation.status]) return noContent()

  // Answer the provider immediately (Sunra allows 5s); polling remains the
  // fallback if verification or storage fails.
  void finalizeFromWebhook(generation.id)
  return noContent()
}

async function finalizeFromWebhook(generationId: string): Promise<void> {
  try {
    const generation = getGeneration(generationId)
    if (!generation || !generation.providerJobId || TERMINAL[generation.status]) return
    const adapter = adapterFor(generation.provider)
    if (!adapter.poll) return

    const result = await adapter.poll(providerContext(generation.provider), {
      providerJobId: generation.providerJobId,
      model: getModel(generation.model) ?? ({ id: generation.model } as never),
      kind: generation.kind,
    })

    const current = getGeneration(generationId)
    if (!current || TERMINAL[current.status]) return

    if (result.status === 'succeeded') {
      const outputIds = await storeProviderOutputs(result.outputs ?? [], current.folderId)
      updateGeneration(generationId, { status: 'succeeded', outputAssetIds: outputIds, error: null })
      deleteJob(generationId)
    } else if (result.status === 'failed') {
      updateGeneration(generationId, {
        status: 'failed',
        error: result.error ?? 'Generation failed',
        errorCode: result.failure?.code ?? null,
        errorReason: result.failure?.reason ?? null,
        errorRetryable: result.failure?.retryable ?? null,
      })
      deleteJob(generationId)
    }
  } catch (error) {
    console.warn('[webhook] could not finalize generation', generationId, error)
  }
}
