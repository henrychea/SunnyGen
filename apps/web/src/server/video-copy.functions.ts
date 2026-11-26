import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { MAX_COPY_SHOTS, videoShotSchema } from '@sunnygen/core'
import { AGENT_IDS } from '@sunnygen/providers'
import {
  analyzeCopyShots,
  extractFrames,
  joinCopyClips,
  loadCopyView,
  loadLatestCopy,
  probeCopySource,
  saveCopyShots,
  type CopyView,
} from './video-copy.server'

const copyInput = z.object({ copyId: z.string().min(1) })

const extractInput = z.object({
  sourceAssetId: z.string().min(1),
  mode: z.enum(['scene', 'every', 'timestamps']),
  everySeconds: z.number().positive().max(120).optional(),
  timestamps: z.array(z.number().finite()).max(200).optional(),
  folderId: z.string().nullable().optional(),
})

export const probeSourceFn = createServerFn({ method: 'GET' })
  .validator(z.object({ assetId: z.string().min(1) }))
  .handler(({ data }) => probeCopySource(data.assetId))

export const extractFramesFn = createServerFn({ method: 'POST' })
  .validator(extractInput)
  .handler(({ data }) => extractFrames(data))

export const analyzeCopyFn = createServerFn({ method: 'POST' })
  .validator(copyInput.extend({ agent: z.enum(AGENT_IDS) }))
  .handler(({ data }) => analyzeCopyShots(data))

export const loadLatestCopyFn = createServerFn({ method: 'GET' }).handler(() => loadLatestCopy())

export const loadCopyFn = createServerFn({ method: 'GET' })
  .validator(copyInput)
  .handler(({ data }): Promise<CopyView | null> => loadCopyView(data.copyId))

const saveShotsInput = copyInput.extend({
  shots: z.array(videoShotSchema.extend({ generationId: z.string().optional() })).max(MAX_COPY_SHOTS),
  status: z.enum(['analyzed', 'generating']).optional(),
  folderId: z.string().nullable().optional(),
})

export const saveCopyShotsFn = createServerFn({ method: 'POST' })
  .validator(saveShotsInput)
  .handler(({ data }) => saveCopyShots(data))

export const joinCopyFn = createServerFn({ method: 'POST' })
  .validator(copyInput)
  .handler(({ data }) => joinCopyClips(data.copyId))
