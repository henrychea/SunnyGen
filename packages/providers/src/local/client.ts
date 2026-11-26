import type { AdapterContext } from '../types'

export const LOCAL_DEFAULT_BASE = 'http://127.0.0.1:1234'

export function localBase(context: AdapterContext): string {
  return (context.baseUrl?.trim() || LOCAL_DEFAULT_BASE).replace(/\/$/, '')
}

export interface LocalStatus {
  reachable: boolean
  modelLoaded: boolean
}

/**
 * sd-server answers `/v1/models` with 503 until a model is loaded, so any HTTP
 * answer means the process is up; only a transport error means it is not running.
 */
export async function localStatus(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<LocalStatus> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2_500),
    })
    if (!response.ok) return { reachable: true, modelLoaded: false }
    const payload = (await response.json().catch(() => null)) as { data?: Array<{ id?: string }> } | null
    const loaded = (payload?.data ?? []).some((entry) => entry.id === 'sd-cpp-local')
    return { reachable: true, modelLoaded: loaded }
  } catch {
    return { reachable: false, modelLoaded: false }
  }
}
