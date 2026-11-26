import { createAdapterFromFlows, type ProviderModule } from '../types'
import { localImageFlow, pollLocal } from './image'

const flows = [localImageFlow]

export const localAdapter = createAdapterFromFlows('local', flows, pollLocal)

export const localModule: ProviderModule = {
  id: 'local',
  label: 'Local sd-server',
  adapter: localAdapter,
  flows,
}

export { LOCAL_DEFAULT_BASE, localBase, localStatus, type LocalStatus } from './client'
export { localImageBody, localImageFlow, pollLocal, submitLocalImage } from './image'
