import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { readNsfwMode, writeNsfwMode } from './nsfw.server'

export const loadNsfwMode = createServerFn({ method: 'GET' }).handler(() => readNsfwMode())

export const setNsfwMode = createServerFn({ method: 'POST' })
  .validator(z.object({ enabled: z.boolean() }))
  .handler(({ data }) => {
    writeNsfwMode(data.enabled)
    return { enabled: data.enabled }
  })
