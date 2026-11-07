import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cn } from './cn'

export const Dialog = BaseDialog

export function DialogSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="bg-ink/35 fixed inset-0 z-40 backdrop-blur-[2px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          maxHeight: 'calc(100dvh - 2rem)',
        }}
        className={cn(
          'fixed z-50 w-[min(92vw,520px)]',
          'border-line bg-surface max-h-[88dvh] overflow-y-auto rounded-2xl border p-6',
          'shadow-[0_30px_90px_-30px_rgba(42,30,23,0.55)] outline-none',
          'transition-[opacity,transform] data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0',
          'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
          className,
        )}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  )
}
