import { createAdapterFromFlows, type ProviderModule } from '../types'
import { pollSunra } from './client'
import { sunraImageFlow } from './image'
import { sunraVideoFlow } from './video'
import { sunraWebhook } from './webhook'

const flows = [sunraImageFlow, sunraVideoFlow]

export const sunraAdapter = createAdapterFromFlows('sunra', flows, pollSunra)

export const sunraModule: ProviderModule = {
  id: 'sunra',
  label: 'Sunra.ai',
  adapter: sunraAdapter,
  flows,
  webhook: sunraWebhook,
}

export { SUNRA_BASE, pollSunra, submitSunraQueue, uploadSunraAsset } from './client'
export { sunraImageFlow } from './image'
export {
  DEFAULT_IMAGE_LIMIT,
  fetchSunraSchema,
  pickOperation,
  resetSunraSchemaCache,
  sunraImageCapabilities,
  sunraImageField,
  sunraImageOperations,
  type SunraImageCapabilities,
  type SunraModelSchema,
} from './schema'
export { sunraVideoFlow } from './video'
export { sunraWebhook } from './webhook'
