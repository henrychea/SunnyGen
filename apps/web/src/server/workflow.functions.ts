import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { deleteWorkflow, getWorkflow, listWorkflows, saveWorkflow } from '@sunnygen/db'

export interface WorkflowSummary {
  id: string
  name: string
  updatedAt: number
}

export interface WorkflowDocument extends WorkflowSummary {
  graph: unknown
}

export const loadWorkflowIndex = createServerFn({ method: 'GET', strict: false }).handler(
  (): {
    workflows: WorkflowSummary[]
    latest: WorkflowDocument | null
  } => {
    const workflows = listWorkflows()
    const latest = workflows[0]
    return {
      workflows: workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        updatedAt: workflow.updatedAt,
      })),
      latest: latest
        ? { id: latest.id, name: latest.name, updatedAt: latest.updatedAt, graph: latest.graph }
        : null,
    }
  },
)

const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  graph: z.object({
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
  }),
})

export const saveWorkflowFn = createServerFn({ method: 'POST', strict: false })
  .validator(saveSchema)
  .handler(({ data }): WorkflowDocument => {
    const saved = saveWorkflow({ id: data.id, name: data.name, graph: data.graph })
    return { id: saved.id, name: saved.name, updatedAt: saved.updatedAt, graph: saved.graph }
  })

export const loadWorkflowFn = createServerFn({ method: 'GET', strict: false })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }): WorkflowDocument | null => {
    const workflow = getWorkflow(data.id)
    return workflow
      ? { id: workflow.id, name: workflow.name, updatedAt: workflow.updatedAt, graph: workflow.graph }
      : null
  })

export const deleteWorkflowFn = createServerFn({ method: 'POST', strict: false })
  .validator(z.object({ id: z.string() }))
  .handler(({ data }) => {
    deleteWorkflow(data.id)
    return { ok: true }
  })
