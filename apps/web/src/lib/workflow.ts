import type { Edge, Node } from '@xyflow/react'
import { z } from 'zod'
import { IMAGE_MODELS, VIDEO_MODELS, getModel } from '@sunnygen/core'

export type CanvasNodeType =
  'prompt' | 'image-input' | 'video-input' | 'generate-image' | 'generate-video' | 'note' | 'comment'

export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'

export interface CanvasNodeData extends Record<string, unknown> {
  text?: string
  assetIds?: string[]
  model?: string
  aspectRatio?: string
  quality?: string
  durationSeconds?: number
  resolution?: string
  sound?: boolean
  mode?: string
  status?: NodeStatus
  outputAssetIds?: string[]
  error?: string
}

export type CanvasNode = Node<CanvasNodeData, CanvasNodeType>
export type CanvasEdge = Edge

export interface WorkflowGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export const NODE_LABELS: Record<CanvasNodeType, string> = {
  prompt: 'Prompt',
  'image-input': 'Image input',
  'video-input': 'Video input',
  'generate-image': 'Generate image',
  'generate-video': 'Generate video',
  note: 'Note',
  comment: 'Comment',
}

const KNOWN_TYPES = new Set<string>(Object.keys(NODE_LABELS))

function newId(prefix: string): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
}

export function makeNode(type: CanvasNodeType, position: { x: number; y: number }): CanvasNode {
  const base = {
    id: newId(type),
    type,
    position,
  }

  if (type === 'prompt') {
    return { ...base, data: { text: '' } }
  }
  if (type === 'image-input' || type === 'video-input') {
    return { ...base, data: { assetIds: [] } }
  }
  if (type === 'note' || type === 'comment') {
    return { ...base, data: { text: '' } }
  }
  if (type === 'generate-image') {
    const model = IMAGE_MODELS[0]
    return {
      ...base,
      data: {
        model: model?.id,
        aspectRatio: '1:1',
        quality: model?.defaultQuality ?? '1k',
        assetIds: [],
        status: 'idle',
      },
    }
  }
  const model = VIDEO_MODELS[0]
  return {
    ...base,
    data: {
      model: model?.id,
      aspectRatio: model?.defaultRatio ?? '16:9',
      durationSeconds: model?.defaultDuration ?? 5,
      resolution: model?.defaultResolution ?? '',
      sound: model?.sound ?? true,
      mode: model?.defaultMode ?? '',
      assetIds: [],
      status: 'idle',
    },
  }
}

export function defaultGraph(): WorkflowGraph {
  const prompt: CanvasNode = {
    id: 'prompt-start',
    type: 'prompt',
    position: { x: 60, y: 190 },
    data: { text: 'A quiet editorial portrait in warm afternoon light, soft grain, shallow depth of field.' },
  }
  const generate: CanvasNode = {
    id: 'generate-start',
    type: 'generate-image',
    position: { x: 380, y: 150 },
    data: {
      model: IMAGE_MODELS[0]?.id,
      aspectRatio: '4:5',
      quality: '1k',
      assetIds: [],
      status: 'idle',
    },
  }
  return {
    nodes: [prompt, generate],
    edges: [
      {
        id: 'edge-start',
        source: prompt.id,
        target: generate.id,
        sourceHandle: 'text',
        targetHandle: 'prompt',
        type: 'smoothstep',
      },
    ],
  }
}

export function withEdgeStyle(edge: CanvasEdge): CanvasEdge {
  return {
    ...edge,
    type: edge.type ?? 'smoothstep',
    style: edge.style ?? { stroke: '#A31621', strokeWidth: 1.4 },
    interactionWidth: 18,
  }
}

export function serializeGraph(nodes: CanvasNode[], edges: CanvasEdge[]): WorkflowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      type: edge.type ?? 'smoothstep',
    })),
  }
}

const positionSchema = z.object({ x: z.number(), y: z.number() })

const nodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: positionSchema,
  data: z.record(z.string(), z.unknown()).optional(),
})

const edgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
})

const graphSchema = z.object({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
})

export function parseGraph(value: unknown): WorkflowGraph | null {
  const parsed = graphSchema.safeParse(value)
  if (!parsed.success) return null

  const nodes: CanvasNode[] = parsed.data.nodes
    .filter((node) => KNOWN_TYPES.has(node.type))
    .map((node) => ({
      id: node.id,
      type: node.type as CanvasNodeType,
      position: node.position,
      data: (node.data ?? {}) as CanvasNodeData,
    }))

  const edges: CanvasEdge[] = parsed.data.edges.map((edge) =>
    withEdgeStyle({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      type: edge.type ?? 'smoothstep',
    }),
  )

  return { nodes, edges }
}

export function upstreamInputs(
  nodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): { prompt: string; assetIds: string[] } {
  const texts: string[] = []
  const assetIds: string[] = []

  for (const edge of edges) {
    if (edge.target !== nodeId) continue
    const source = nodes.find((node) => node.id === edge.source)
    if (!source) continue
    if (typeof source.data.text === 'string' && source.data.text.trim()) {
      texts.push(source.data.text.trim())
    }
    if (Array.isArray(source.data.assetIds)) assetIds.push(...source.data.assetIds)
    if (Array.isArray(source.data.outputAssetIds)) assetIds.push(...source.data.outputAssetIds)
  }

  return { prompt: texts.join('\n\n'), assetIds: [...new Set(assetIds)] }
}

export function orderedGenerateNodes(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  const ids = new Set(nodes.map((node) => node.id))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0)
  const ordered: CanvasNode[] = []
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    ordered.push(node)
    for (const edge of edges) {
      if (edge.source !== node.id) continue
      const next = indegree.get(edge.target)
      if (next === undefined) continue
      indegree.set(edge.target, next - 1)
      if (next - 1 === 0) {
        const target = nodes.find((entry) => entry.id === edge.target)
        if (target) queue.push(target)
      }
    }
  }

  const source = ordered.length === nodes.length ? ordered : nodes
  return source.filter((node) => node.type === 'generate-image' || node.type === 'generate-video')
}

export function modelForNode(node: CanvasNode) {
  if (node.type === 'generate-image') {
    return IMAGE_MODELS.find((model) => model.id === node.data.model) ?? IMAGE_MODELS[0]
  }
  if (node.type === 'generate-video') {
    return VIDEO_MODELS.find((model) => model.id === node.data.model) ?? VIDEO_MODELS[0]
  }
  return getModel(String(node.data.model ?? ''))
}
