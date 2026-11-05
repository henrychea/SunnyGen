import { createFileRoute } from '@tanstack/react-router'
import { WorkflowEditor } from '~/components/canvas/editor'
import { loadWorkflowFn, loadWorkflowIndex } from '~/server/workflow.functions'

export const Route = createFileRoute('/canvas')({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    const index = await loadWorkflowIndex()
    const latest = deps.id ? await loadWorkflowFn({ data: { id: deps.id } }) : index.latest
    return { workflows: index.workflows, latest: latest ?? null }
  },
  component: CanvasRoute,
})

function CanvasRoute() {
  const data = Route.useLoaderData()
  return <WorkflowEditor key={data.latest?.id ?? 'new'} latest={data.latest} workflows={data.workflows} />
}
