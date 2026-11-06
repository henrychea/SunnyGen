import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { APP_NAME } from '@sunnygen/core'
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@sunnygen/ui'
import {
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Save,
  Sparkles,
  StickyNote,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  defaultGraph,
  modelForNode,
  orderedGenerateNodes,
  parseGraph,
  serializeGraph,
  upstreamInputs,
  withEdgeStyle,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from '~/lib/workflow'
import { getGenerationView, submitGeneration } from '~/server/generation.functions'
import { saveWorkflowFn, type WorkflowDocument, type WorkflowSummary } from '~/server/workflow.functions'
import { CanvasActionsContext } from './context'
import { canvasNodeTypes } from './nodes'

const EDGE_DEFAULTS = {
  type: 'smoothstep',
  style: { stroke: '#A31621', strokeWidth: 1.4 },
  interactionWidth: 18,
}

const PALETTE: Array<{ type: CanvasNodeType; label: string; icon: typeof Sparkles }> = [
  { type: 'prompt', label: 'Prompt', icon: Sparkles },
  { type: 'image-input', label: 'Image input', icon: ImageIcon },
  { type: 'video-input', label: 'Video input', icon: Video },
  { type: 'generate-image', label: 'Generate image', icon: LayoutGrid },
  { type: 'generate-video', label: 'Generate video', icon: Video },
  { type: 'note', label: 'Note', icon: StickyNote },
  { type: 'comment', label: 'Comment', icon: MessageSquare },
]

export interface WorkflowEditorProps {
  latest: WorkflowDocument | null
  workflows: WorkflowSummary[]
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function CanvasInner({ latest, workflows }: WorkflowEditorProps) {
  const initial = latest ? parseGraph(latest.graph) : null
  const graph = initial ?? defaultGraph()
  const queryClient = useQueryClient()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const navigate = useNavigate()
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(graph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(graph.edges.map(withEdgeStyle))
  const [name, setName] = useState(latest?.name ?? 'Untitled pipeline')
  const [workflowId, setWorkflowId] = useState<string | null>(latest?.id ?? null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [banner, setBanner] = useState<string | null>(null)
  const [running, setRunning] = useState<Set<string>>(new Set())
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const firstChange = useRef(true)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  const patchNode = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((current) =>
        current.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node)),
      )
    },
    [setNodes],
  )

  const persist = useCallback(
    async (options?: { manual?: boolean }) => {
      setSaveState('saving')
      try {
        const saved = await saveWorkflowFn({
          data: {
            id: workflowId ?? undefined,
            name: name.trim() || 'Untitled pipeline',
            graph: serializeGraph(nodesRef.current, edgesRef.current),
          },
        })
        setWorkflowId(saved.id)
        setSaveState('saved')
        if (options?.manual) setBanner(null)
        window.setTimeout(() => setSaveState((state) => (state === 'saved' ? 'idle' : state)), 1800)
      } catch (error) {
        setSaveState('error')
        setBanner(error instanceof Error ? error.message : 'Could not save the workflow')
      }
    },
    [name, workflowId],
  )

  useEffect(() => {
    if (firstChange.current) {
      firstChange.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void persist()
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [nodes, edges, name, persist])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) =>
        addEdge(
          withEdgeStyle({
            ...connection,
            id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: EDGE_DEFAULTS.type,
          }),
          current,
        ),
      )
    },
    [setEdges],
  )

  const addNode = useCallback(
    (type: CanvasNodeType) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const node: CanvasNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data:
          type === 'generate-image'
            ? { model: 'nano-banana-2', aspectRatio: '1:1', quality: '1k', assetIds: [], status: 'idle' }
            : type === 'generate-video'
              ? {
                  model: 'veo3_fast',
                  aspectRatio: '16:9',
                  durationSeconds: 8,
                  resolution: '720p',
                  sound: true,
                  mode: '',
                  assetIds: [],
                  status: 'idle',
                }
              : type === 'image-input' || type === 'video-input'
                ? { assetIds: [] }
                : { text: '' },
      }
      setNodes((current) => [...current, node])
    },
    [screenToFlowPosition, setNodes],
  )

  const uploadToNode = useCallback(
    async (nodeId: string, files: FileList | File[]) => {
      setBanner(null)
      const list = Array.from(files)
      const uploaded: string[] = []
      for (const file of list) {
        const form = new FormData()
        form.set('file', file)
        const response = await fetch('/api/upload', { method: 'POST', body: form })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          setBanner(payload?.error ?? `Upload failed (${response.status})`)
          continue
        }
        const payload = (await response.json()) as { asset?: { id?: string } }
        if (payload.asset?.id) uploaded.push(payload.asset.id)
      }
      if (uploaded.length === 0) return
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId) return node
          const existing = Array.isArray(node.data.assetIds) ? node.data.assetIds : []
          return { ...node, data: { ...node.data, assetIds: [...existing, ...uploaded] } }
        }),
      )
    },
    [setNodes],
  )

  const waitForGeneration = useCallback(async (generationId: string) => {
    for (let attempt = 0; attempt < 720; attempt += 1) {
      const view = await getGenerationView({ data: { id: generationId } })
      if (!view) throw new Error('Generation disappeared')
      if (view.generation.status === 'succeeded') return view
      if (view.generation.status === 'failed') throw new Error(view.generation.error ?? 'Generation failed')
      if (view.generation.status === 'cancelled') throw new Error('Generation canceled')
      await new Promise((resolve) => setTimeout(resolve, 2_500))
    }
    throw new Error('Generation timed out')
  }, [])

  const executeNode = useCallback(
    async (node: CanvasNode, snapshot: CanvasNode[]): Promise<string[]> => {
      const model = modelForNode(node)
      if (!model) throw new Error('Choose a model for this node')
      const inputs = upstreamInputs(node.id, snapshot, edgesRef.current)
      setRunning((current) => new Set(current).add(node.id))
      patchNode(node.id, { status: 'running', error: undefined })

      try {
        const submitted = await submitGeneration({
          data: {
            kind: model.kind,
            model: model.id,
            prompt: inputs.prompt,
            assetIds: inputs.assetIds,
            params: {
              aspectRatio: node.data.aspectRatio,
              quality: node.data.quality,
              durationSeconds: node.data.durationSeconds,
              resolution: node.data.resolution,
              sound: node.data.sound,
              mode: node.data.mode,
            },
          },
        })

        const view =
          submitted.generation.status === 'succeeded'
            ? submitted
            : await waitForGeneration(submitted.generation.id)

        if (view.generation.status !== 'succeeded') {
          throw new Error(view.generation.error ?? 'Generation failed')
        }

        const outputIds = view.generation.outputAssetIds
        patchNode(node.id, { status: 'succeeded', outputAssetIds: outputIds, error: undefined })
        await queryClient.invalidateQueries({ queryKey: ['gallery'] })
        return outputIds
      } catch (error) {
        patchNode(node.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Generation failed',
        })
        throw error
      } finally {
        setRunning((current) => {
          const next = new Set(current)
          next.delete(node.id)
          return next
        })
      }
    },
    [patchNode, queryClient, waitForGeneration],
  )

  const runNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((entry) => entry.id === nodeId)
      if (!node) return
      setBanner(null)
      void executeNode(node, nodesRef.current).catch((error: unknown) => {
        setBanner(error instanceof Error ? error.message : 'Generation failed')
      })
    },
    [executeNode],
  )

  const runAll = useCallback(async () => {
    setBanner(null)
    const snapshot = nodesRef.current.map((node) => ({ ...node, data: { ...node.data } }))
    const order = orderedGenerateNodes(snapshot, edgesRef.current)
    if (order.length === 0) {
      setBanner('Add a Generate node before running the canvas.')
      return
    }

    for (const target of order) {
      const live = snapshot.find((node) => node.id === target.id)
      if (!live) continue
      try {
        const outputs = await executeNode(live, snapshot)
        live.data.outputAssetIds = outputs
        live.data.status = 'succeeded'
      } catch (error) {
        live.data.status = 'failed'
        live.data.error = error instanceof Error ? error.message : 'Generation failed'
        setBanner(live.data.error)
        break
      }
    }
  }, [executeNode])

  const newWorkflow = useCallback(() => {
    const next = defaultGraph()
    setNodes(next.nodes)
    setEdges(next.edges.map(withEdgeStyle))
    setName('Untitled pipeline')
    setWorkflowId(null)
    setBanner(null)
    window.setTimeout(() => void fitView({ padding: 0.25 }), 60)
  }, [fitView, setEdges, setNodes])

  const actions = { runNode, running, uploadToNode }

  return (
    <CanvasActionsContext.Provider value={actions}>
      <div className="flex h-full flex-col">
        <header className="border-line/80 bg-surface/70 flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="bg-accent/10 text-accent grid size-7 place-items-center rounded-lg">
              <LayoutGrid size={14} />
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="font-display text-ink hover:border-line focus:border-line w-48 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[13px] font-semibold outline-none"
              aria-label="Workflow name"
            />
          </div>

          <span className="text-ink/35 text-[10.5px]">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'Saved'
                : saveState === 'error'
                  ? 'Save failed'
                  : `${nodes.length} nodes`}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {workflows.length > 0 ? (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="border-line text-ink/60 hover:text-ink inline-flex h-8 items-center rounded-lg border px-2.5 text-[11.5px]">
                  Open
                </DropdownMenu.Trigger>
                <DropdownMenuContent>
                  {workflows.map((workflow) => (
                    <DropdownMenuItem
                      key={workflow.id}
                      onClick={() => {
                        void navigate({ to: '/canvas', search: { id: workflow.id } })
                      }}
                    >
                      {workflow.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu.Root>
            ) : null}
            <Button variant="ghost" size="sm" onClick={newWorkflow}>
              <Plus size={12} /> New
            </Button>
            <Button variant="outline" size="sm" onClick={() => void persist({ manual: true })}>
              {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}{' '}
              Save
            </Button>
            <Button size="sm" onClick={() => void runAll()} disabled={running.size > 0}>
              {running.size > 0 ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {running.size > 0 ? 'Running' : 'Run all'}
            </Button>
          </div>
        </header>

        {banner ? (
          <div className="border-error/20 bg-error/5 text-error border-b px-4 py-2 text-[11.5px]">
            {banner}
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={canvasNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            defaultEdgeOptions={EDGE_DEFAULTS}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.15}
            maxZoom={2}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: false }}
            className="bg-canvas"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#D9CEBF" />
            <Controls
              showInteractive={false}
              className="!border-line !bg-surface !rounded-xl !border !shadow-sm"
            />
            <div className="border-line bg-surface/95 absolute top-3 left-3 z-10 flex flex-col gap-1 rounded-xl border p-1.5 shadow-sm backdrop-blur">
              {PALETTE.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => addNode(item.type)}
                    className={cn(
                      'text-ink/55 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium',
                      'hover:bg-ink/[0.05] hover:text-ink',
                    )}
                  >
                    <Icon size={12} className="text-ink/35" />
                    {item.label}
                  </button>
                )
              })}
              <p className="text-ink/25 px-2 py-1 text-[9px]">{APP_NAME} canvas</p>
            </div>
          </ReactFlow>
        </div>
      </div>
    </CanvasActionsContext.Provider>
  )
}
