import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react'
import {
  IMAGE_MODELS,
  VIDEO_MODELS,
  type ImageModelDefinition,
  type VideoModelDefinition,
} from '@sunnygen/core'
import { Badge, Button, cn, Input, Select, Textarea } from '@sunnygen/ui'
import { Image as ImageIcon, Loader2, Minus, Play, Plus, Sparkles, StickyNote, Video, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { MediaPicker } from '../media-picker'
import { useCanvasActions } from './context'
import type { CanvasNode, NodeStatus } from '~/lib/workflow'

const STATUS_TONES: Record<NodeStatus, 'neutral' | 'accent' | 'success' | 'error'> = {
  idle: 'neutral',
  queued: 'accent',
  running: 'accent',
  succeeded: 'success',
  failed: 'error',
}

function NodeShell({
  title,
  icon,
  status,
  selected,
  width = 268,
  children,
  outputs,
}: {
  title: string
  icon: ReactNode
  status?: NodeStatus
  selected?: boolean
  width?: number
  children: ReactNode
  outputs?: ReactNode
}) {
  return (
    <div
      style={{ width }}
      className={cn(
        'bg-surface overflow-hidden rounded-xl border shadow-[0_16px_44px_-30px_rgba(42,30,23,0.55)]',
        selected ? 'border-accent/50 ring-accent/12 ring-2' : 'border-line',
      )}
    >
      <div className="border-line/80 flex items-center gap-2 border-b px-3 py-2">
        <span className="text-accent/80">{icon}</span>
        <span className="font-display text-ink/80 text-[11.5px] font-semibold tracking-tight">{title}</span>
        {status && status !== 'idle' ? (
          <Badge tone={STATUS_TONES[status]} className="ml-auto">
            {status}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-2.5 p-3">
        {children}
        {outputs}
      </div>
    </div>
  )
}

function OutputThumbs({ ids, kind }: { ids: string[]; kind: 'image' | 'video' }) {
  if (ids.length === 0) return null
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {ids.slice(0, 6).map((id) => (
        <a
          key={id}
          href={`/api/media/${id}`}
          target="_blank"
          rel="noreferrer"
          className="nodrag border-line bg-canvas overflow-hidden rounded-md border"
        >
          {kind === 'video' ? (
            <video src={`/api/media/${id}`} muted className="aspect-square w-full object-cover" />
          ) : (
            <img src={`/api/media/${id}`} alt="" className="aspect-square w-full object-cover" />
          )}
        </a>
      ))}
    </div>
  )
}

export function PromptNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const { updateNodeData } = useReactFlow()
  return (
    <NodeShell title="Prompt" icon={<Sparkles size={13} />} selected={selected}>
      <Textarea
        value={data.text ?? ''}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
        placeholder="Describe the frame…"
        className="nodrag nowheel min-h-28 border-0 bg-transparent p-0 text-[12px] focus-visible:ring-0"
      />
      <p className="text-ink/30 text-right text-[9.5px]">{(data.text ?? '').length} chars</p>
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        className="!border-surface !bg-accent !size-2.5 !border-2"
      />
    </NodeShell>
  )
}

export function MediaInputNode({ id, data, selected, type }: NodeProps<CanvasNode>) {
  const { updateNodeData } = useReactFlow()
  const { uploadToNode } = useCanvasActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const video = type === 'video-input'
  const ids = Array.isArray(data.assetIds) ? data.assetIds : []

  return (
    <NodeShell
      title={video ? 'Video input' : 'Image input'}
      icon={video ? <Video size={13} /> : <ImageIcon size={13} />}
      selected={selected}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {ids.map((assetId) => (
          <div
            key={assetId}
            className="border-line bg-canvas group relative overflow-hidden rounded-md border"
          >
            {video ? (
              <video src={`/api/media/${assetId}`} muted className="aspect-square w-full object-cover" />
            ) : (
              <img src={`/api/media/${assetId}`} alt="" className="aspect-square w-full object-cover" />
            )}
            <button
              type="button"
              className="nodrag bg-ink/70 text-canvas absolute top-0.5 right-0.5 grid size-4 place-items-center rounded opacity-0 group-hover:opacity-100"
              onClick={() => updateNodeData(id, { assetIds: ids.filter((value) => value !== assetId) })}
              aria-label="Remove"
            >
              <X size={9} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="nodrag border-line text-ink/35 hover:border-accent/40 hover:text-accent grid aspect-square place-items-center rounded-md border border-dashed"
          aria-label={`Add ${video ? 'video' : 'image'}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={video ? 'video/*' : 'image/*'}
        className="hidden"
        onChange={async (event) => {
          if (!event.target.files?.length) return
          setBusy(true)
          try {
            await uploadToNode(id, event.target.files)
          } finally {
            setBusy(false)
            event.target.value = ''
          }
        }}
      />
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="nodrag border-line text-ink/45 hover:text-ink inline-flex h-7 items-center justify-center gap-1 rounded-md border text-[10px]"
      >
        <ImageIcon size={10} /> Library
      </button>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind={video ? 'video' : 'image'}
        multiple
        onSelect={(ids) => {
          const existing = Array.isArray(data.assetIds) ? data.assetIds : []
          updateNodeData(id, { assetIds: [...new Set([...existing, ...ids])] })
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id={video ? 'video' : 'image'}
        className="!border-surface !bg-accent !size-2.5 !border-2"
      />
    </NodeShell>
  )
}

export function GenerateNode({ id, data, selected, type }: NodeProps<CanvasNode>) {
  const { updateNodeData } = useReactFlow()
  const { runNode, running, uploadToNode } = useCanvasActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const video = type === 'generate-video'
  const models = video ? VIDEO_MODELS : IMAGE_MODELS
  const model = models.find((entry) => entry.id === data.model) ?? models[0]
  const isRunning = running.has(id)
  const status = data.status ?? 'idle'
  const refIds = Array.isArray(data.assetIds) ? data.assetIds : []
  const outputIds = Array.isArray(data.outputAssetIds) ? data.outputAssetIds : []

  const updateModel = (modelId: string) => {
    const next = models.find((entry) => entry.id === modelId)
    if (!next) return
    if (next.kind === 'video') {
      updateNodeData(id, {
        model: next.id,
        aspectRatio: next.defaultRatio,
        durationSeconds: next.defaultDuration,
        resolution: next.defaultResolution,
        sound: next.sound,
        mode: next.defaultMode,
      })
    } else {
      updateNodeData(id, {
        model: next.id,
        aspectRatio: next.ratios.includes('1:1') ? '1:1' : next.ratios[0],
        quality: next.defaultQuality,
      })
    }
  }

  return (
    <NodeShell
      title={video ? 'Generate video' : 'Generate image'}
      icon={video ? <Video size={13} /> : <ImageIcon size={13} />}
      status={status}
      selected={selected}
      width={288}
      outputs={
        outputIds.length > 0 ? <OutputThumbs ids={outputIds} kind={video ? 'video' : 'image'} /> : null
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">Model</span>
          <Select
            value={model?.id ?? ''}
            onChange={(event) => updateModel(event.target.value)}
            className="nodrag h-8 text-[11.5px]"
          >
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">Ratio</span>
          <Select
            value={String(data.aspectRatio ?? model?.ratios[0] ?? '1:1')}
            onChange={(event) => updateNodeData(id, { aspectRatio: event.target.value })}
            className="nodrag h-8 text-[11px]"
          >
            {(model?.ratios ?? []).map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </Select>
        </label>

        {!video && model?.kind === 'image' && model.supportsQuality ? (
          <label className="flex flex-col gap-1">
            <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
              Quality
            </span>
            <Select
              value={String(data.quality ?? model.defaultQuality)}
              onChange={(event) => updateNodeData(id, { quality: event.target.value })}
              className="nodrag h-8 text-[11px]"
            >
              {model.qualityOptions.map((quality) => (
                <option key={quality} value={quality}>
                  {quality}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        {video && model?.kind === 'video' ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                Seconds
              </span>
              <Select
                value={String(data.durationSeconds ?? model.defaultDuration)}
                onChange={(event) => updateNodeData(id, { durationSeconds: Number(event.target.value) })}
                className="nodrag h-8 text-[11px]"
              >
                {model.durations.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration}s
                  </option>
                ))}
              </Select>
            </label>
            {model.resolutions.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Resolution
                </span>
                <Select
                  value={String(data.resolution ?? model.defaultResolution)}
                  onChange={(event) => updateNodeData(id, { resolution: event.target.value })}
                  className="nodrag h-8 text-[11px]"
                >
                  {model.resolutions.map((resolution) => (
                    <option key={resolution} value={resolution}>
                      {resolution}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            {model.modes.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-ink/40 text-[9.5px] font-semibold tracking-[0.08em] uppercase">
                  Mode
                </span>
                <Select
                  value={String(data.mode ?? model.defaultMode)}
                  onChange={(event) => updateNodeData(id, { mode: event.target.value })}
                  className="nodrag h-8 text-[11px]"
                >
                  {model.modes.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            {model.sound ? (
              <label className="text-ink/55 flex items-center gap-1.5 text-[10.5px]">
                <input
                  type="checkbox"
                  className="nodrag accent-[#A31621]"
                  checked={Boolean(data.sound ?? true)}
                  onChange={(event) => updateNodeData(id, { sound: event.target.checked })}
                />
                Audio
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="nodrag border-line text-ink/55 hover:border-ink/25 inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10.5px]"
        >
          {busy ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} Reference
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="nodrag border-line text-ink/55 hover:border-ink/25 inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10.5px]"
        >
          <ImageIcon size={10} /> Library
        </button>
        <MediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind="image"
          multiple
          onSelect={(ids) => {
            const existing = Array.isArray(data.assetIds) ? data.assetIds : []
            updateNodeData(id, { assetIds: [...new Set([...existing, ...ids])] })
          }}
        />
        {refIds.length > 0 ? <span className="text-ink/35 text-[10px]">{refIds.length}</span> : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            if (!event.target.files?.length) return
            setBusy(true)
            try {
              await uploadToNode(id, event.target.files)
            } finally {
              setBusy(false)
              event.target.value = ''
            }
          }}
        />
        <Button
          size="sm"
          className="nodrag ml-auto h-7 px-2.5 text-[10.5px]"
          onClick={() => runNode(id)}
          loading={isRunning}
        >
          <Play size={10} /> {isRunning ? 'Running' : 'Run'}
        </Button>
      </div>

      {refIds.length > 0 ? (
        <div className="flex gap-1">
          {refIds.slice(0, 5).map((assetId) => (
            <button
              key={assetId}
              type="button"
              className="nodrag border-line group relative overflow-hidden rounded border"
              onClick={() => updateNodeData(id, { assetIds: refIds.filter((value) => value !== assetId) })}
              title="Remove reference"
            >
              <img src={`/api/media/${assetId}`} alt="" className="size-8 object-cover" />
              <span className="bg-ink/45 text-canvas absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100">
                <Minus size={10} />
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {data.error ? (
        <p className="bg-error/8 text-error rounded-md px-2 py-1.5 text-[10px] leading-snug">{data.error}</p>
      ) : null}

      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        style={{ top: 54 }}
        className="!border-surface !bg-ink/30 !size-2.5 !border-2"
      />
      <Handle
        type="target"
        position={Position.Left}
        id={video ? 'image' : 'image'}
        style={{ top: video ? 104 : 92 }}
        className="!border-surface !bg-ink/30 !size-2.5 !border-2"
      />
      {video ? (
        <Handle
          type="target"
          position={Position.Left}
          id="video"
          style={{ top: 154 }}
          className="!border-surface !bg-ink/30 !size-2.5 !border-2"
        />
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        id={video ? 'video' : 'image'}
        className="!border-surface !bg-accent !size-2.5 !border-2"
      />
    </NodeShell>
  )
}

export function NoteNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const { updateNodeData } = useReactFlow()
  return (
    <NodeShell title="Note" icon={<StickyNote size={13} />} selected={selected} width={220}>
      <Textarea
        value={data.text ?? ''}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
        placeholder="Notes for this pipeline…"
        className="nodrag nowheel min-h-20 border-0 bg-transparent p-0 text-[11.5px] focus-visible:ring-0"
      />
    </NodeShell>
  )
}

export function CommentNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const { updateNodeData } = useReactFlow()
  return (
    <div
      className={cn(
        'w-[190px] rounded-lg border bg-[#FFF8E7] px-2.5 py-2 shadow-sm',
        selected ? 'border-warning/50' : 'border-warning/25',
      )}
    >
      <Input
        value={data.text ?? ''}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
        placeholder="Comment"
        className="nodrag h-7 border-0 bg-transparent px-0 text-[11px] focus-visible:ring-0"
      />
    </div>
  )
}

export const canvasNodeTypes = {
  prompt: PromptNode,
  'image-input': MediaInputNode,
  'video-input': MediaInputNode,
  'generate-image': GenerateNode,
  'generate-video': GenerateNode,
  note: NoteNode,
  comment: CommentNode,
}

export type { ImageModelDefinition, VideoModelDefinition }
