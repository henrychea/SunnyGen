import { createAdapterFromFlows, type ProviderModule } from '../types'
import { pollWiro } from './client'
import { wiroImageFlow } from './image'

const flows = [wiroImageFlow]

export const wiroAdapter = createAdapterFromFlows('wiro', flows, pollWiro)

export const wiroModule: ProviderModule = {
  id: 'wiro',
  label: 'Wiro',
  adapter: wiroAdapter,
  flows,
}

export { WIRO_API, pollWiro, submitWiroRun, wiroRunUrl, type WiroTask } from './client'
export { wiroImageBody, wiroImageFlow } from './image'
