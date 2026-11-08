import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'
import { hostGuard, originGuard } from './server/guards.server'

const transportGuard = createMiddleware({ type: 'request' }).server(({ request, next }) => {
  return hostGuard(request) ?? originGuard(request) ?? next()
})

const csrf = createCsrfMiddleware({ filter: (context) => context.handlerType === 'serverFn' })

export const startInstance = createStart(() => ({
  requestMiddleware: [transportGuard, csrf],
}))
