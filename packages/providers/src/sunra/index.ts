import { createAdapterFromFlows, type ProviderModule } from '../types'
import { forgetSunraUploads, pollSunra } from './client'
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
  forgetUploads: forgetSunraUploads,
}

export { SUNRA_BASE, forgetSunraUploads, pollSunra, submitSunraQueue, uploadSunraAsset } from './client'
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
