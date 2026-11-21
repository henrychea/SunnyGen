import { createAdapterFromFlows, type ProviderModule } from '../types'
import { pollFal } from './client'
import { falImageFlow } from './image'
import { falTrainingFlow } from './training'
import { falVideoFlow } from './video'
import { falWebhook } from './webhook'

const flows = [falImageFlow, falVideoFlow, falTrainingFlow]

export const falAdapter = createAdapterFromFlows('fal', flows, pollFal)

export const falModule: ProviderModule = {
  id: 'fal',
  label: 'fal.ai',
  adapter: falAdapter,
  flows,
  webhook: falWebhook,
}

export { FAL_QUEUE, FAL_REST, pollFal, submitFalQueue, uploadFalAsset } from './client'
export {
  DEFAULT_FAL_IMAGE_LIMIT,
  falImageCapabilities,
  falImageFlow,
  falOpenApiUrl,
  parseFalOpenApi,
  resetFalSchemaCache,
  type FalImageCapabilities,
  type FalRequestSchema,
} from './image'
export { falTrainingFlow } from './training'
export { falVideoFlow } from './video'
export { falWebhook } from './webhook'
