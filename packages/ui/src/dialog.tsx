import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { LAYER } from './layers'

export const Dialog = BaseDialog

export function DialogSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop
        className={cn(
          'bg-ink/35 fixed inset-0',
          LAYER.dialogBackdrop,
          'transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
        )}
      />
      <BaseDialog.Popup
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          maxHeight: 'calc(100dvh - 2rem)',
        }}
        className={cn(
          'fixed w-[min(92vw,520px)]',
          LAYER.dialog,
          'border-line-strong bg-surface max-h-[88dvh] overflow-y-auto rounded-2xl border p-6',
          'shadow-dialog outline-none',
          'transition-[opacity,scale,translate] duration-200 ease-out motion-reduce:transition-none',
          'data-[ending-style]:scale-[0.98] data-[ending-style]:translate-y-1 data-[ending-style]:opacity-0',
          'data-[starting-style]:scale-[0.98] data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0',
          className,
        )}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
