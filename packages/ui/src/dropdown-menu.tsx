import { Menu } from '@base-ui/react/menu'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

export const DropdownMenu = Menu

export function DropdownMenuContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={6} className="z-50 outline-none">
        <Menu.Popup
          className={cn(
            'border-line bg-surface min-w-44 rounded-xl border p-1.5',
            'shadow-[0_18px_50px_-24px_rgba(42,30,23,0.45)] outline-none',
            'transition-[opacity,transform] data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0',
            'data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
            className,
          )}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        'text-ink/75 flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        'data-[highlighted]:bg-ink/[0.06] data-[highlighted]:text-ink',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <Menu.Separator className={cn('bg-line my-1 h-px', className)} />
}
