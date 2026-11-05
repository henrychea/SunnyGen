import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  ASSISTANT_MODE_IDS,
  DEFAULT_ASSISTANT_MODE,
  DEFAULT_ASSISTANT_MODEL,
  buildAssistantMessages,
} from '@sunnygen/core'
import { readSetting } from '@sunnygen/db'

const OPENROUTER_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_KEY_SETTING = 'assistant.openrouter.key'
const MISSING_KEY = 'No OpenRouter API key configured. Add one in Settings → API Keys.'
const REJECTED_KEY = 'OpenRouter rejected the API key. Update it in Settings → API Keys.'

const input = z.object({
  model: z.string().trim().min(1).max(160).default(DEFAULT_ASSISTANT_MODEL),
  mode: z.enum(ASSISTANT_MODE_IDS).default(DEFAULT_ASSISTANT_MODE),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(100_000),
      }),
    )
    .min(1)
    .max(200),
})

function failure(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

const upstreamError = z.object({
  error: z.union([z.string(), z.object({ message: z.string() })]).optional(),
  message: z.string().optional(),
})

async function upstreamMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const parsed = upstreamError.safeParse(JSON.parse(text))
    if (parsed.success) {
      const detail = parsed.data.error
      if (typeof detail === 'string' && detail) return detail
      if (detail && typeof detail === 'object' && detail.message) return detail.message
      if (parsed.data.message) return parsed.data.message
    }
  } catch {
    // Not JSON — fall back to the raw body.
  }
  return text.trim() || `OpenRouter returned ${response.status}.`
}

export const Route = createFileRoute('/api/assistant')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return failure(400, 'Expected a JSON request body.')
        }

        const parsed = input.safeParse(body)
        if (!parsed.success) {
          return failure(400, parsed.error.issues[0]?.message ?? 'Invalid request.')
        }

        const key =
          readSetting(OPENROUTER_KEY_SETTING)?.trim() || process.env.OPENROUTER_API_KEY?.trim() || ''
        if (!key) return failure(401, MISSING_KEY)

        const { model, mode, messages } = parsed.data
        const origin = request.headers.get('origin') ?? new URL(request.url).origin

        let upstream: Response
        try {
          upstream = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': origin,
              'X-Title': 'SunnyGen',
            },
            body: JSON.stringify({
              model,
              messages: buildAssistantMessages(mode, messages),
              stream: true,
              max_tokens: 8192,
            }),
            signal: request.signal,
          })
        } catch {
          return failure(502, 'Could not reach OpenRouter. Check your connection and try again.')
        }

        if (!upstream.ok) {
          const message = await upstreamMessage(upstream)
          if (upstream.status === 401) return failure(401, REJECTED_KEY)
          return failure(upstream.status, message)
        }

        if (!upstream.body) {
          return failure(502, 'OpenRouter returned an empty stream.')
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
