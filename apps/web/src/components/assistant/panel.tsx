import { Link } from '@tanstack/react-router'
import { Dialog } from '@base-ui/react/dialog'
import { Plus, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, LAYER, Selector, cn } from '@sunnygen/ui'
import { ChatThread } from '~/components/chat/chat-thread'
import { useAssistantChat } from '~/components/chat/use-assistant-chat'
import { rememberAssistantSession, useAssistantSession } from '~/lib/assistant-context'
import { formatRelativeDate } from '~/lib/format'

const MOBILE_QUERY = '(max-width: 767px)'
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getClientRects().length > 0,
  )
}

function subscribeMobile(listener: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

export function AssistantPanel({
  open,
  onOpenChange,
  onWorkingChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onWorkingChange: (working: boolean) => void
}) {
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
  const popupRef = useRef<HTMLDivElement>(null)
  const remembered = useAssistantSession()
  const mobile = useIsMobile()
  const activeId = selected !== undefined ? selected : remembered

  const chat = useAssistantChat({
    activeId,
    onActiveIdChange: (next) => setSelected(next),
    onStreamingChange: onWorkingChange,
  })

  const startNewChat = useCallback(() => {
    setSelected(null)
    chat.newChat()
  }, [chat])

  useEffect(() => {
    if (!selected) return
    rememberAssistantSession(selected)
  }, [selected])

  useEffect(() => {
    if (!open || mobile) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const root = popupRef.current
      if (!root) return
      const focusable = focusableIn(root)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (!root.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mobile, open])

  const sessionOptions = [
    { key: '', label: 'New chat', description: 'Start a fresh conversation' },
    ...(activeId && !chat.sessions.some((session) => session.id === activeId)
      ? [{ key: activeId, label: chat.title, description: 'Current chat' }]
      : []),
    ...chat.sessions.map((session) => ({
      key: session.id,
      label: session.title,
      description: formatRelativeDate(session.updatedAt),
    })),
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={mobile} disablePointerDismissal={!mobile}>
      <Dialog.Portal keepMounted>
        <Dialog.Backdrop
          className={cn(
            'bg-ink/35 fixed inset-0 backdrop-blur-[2px] md:hidden',
            LAYER.dialogBackdrop,
            'transition-opacity duration-200 ease-out motion-reduce:transition-none',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
          )}
        />
        <Dialog.Popup
          ref={popupRef}
          className={cn(
            'border-line bg-surface fixed inset-x-0 bottom-0 flex h-[92dvh] max-h-[92dvh] flex-col',
            'rounded-t-2xl border-t shadow-[0_-20px_60px_-30px_rgba(42,30,23,0.45)] outline-none',
            'md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-dvh md:w-[420px] md:rounded-none md:border-t-0 md:border-l',
            'md:shadow-[-30px_0_80px_-40px_rgba(42,30,23,0.5)]',
            LAYER.dialog,
            'transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none',
            'data-[starting-style]:translate-y-full data-[starting-style]:opacity-0',
            'data-[ending-style]:translate-y-full data-[ending-style]:opacity-0',
            'md:data-[starting-style]:translate-x-full md:data-[starting-style]:translate-y-0',
            'md:data-[ending-style]:translate-x-full md:data-[ending-style]:translate-y-0',
          )}
        >
          <Dialog.Title className="sr-only">Assistant</Dialog.Title>

          <header className="border-line/70 flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
            <div className="bg-accent/10 text-accent grid size-8 shrink-0 place-items-center rounded-lg">
              <Sparkles size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[13.5px] font-semibold tracking-tight">Assistant</p>
              <p className="text-ink/35 truncate text-[10.5px]">{activeId ? chat.title : 'New chat'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={startNewChat} aria-label="New chat" title="New chat">
              <Plus size={16} />
            </Button>
            <Dialog.Close
              aria-label="Close assistant"
              className="text-ink/55 hover:bg-ink/[0.05] hover:text-ink grid size-9 place-items-center rounded-lg transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.92]"
            >
              <X size={17} />
            </Dialog.Close>
          </header>

          <div className="border-line/60 flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Selector
              value={activeId ?? ''}
              options={sessionOptions}
              onChange={(option) => {
                if (option.key) {
                  chat.selectSession(option.key)
                } else {
                  startNewChat()
                }
              }}
              size="sm"
              className="min-w-0 flex-1"
              ariaLabel="Chat sessions"
              searchable
              searchPlaceholder="Search chats"
              menuMinWidth={260}
              menuClassName="z-[105]"
              showTriggerDescription={false}
            />
            <Link
              to="/chat"
              search={activeId ? { id: activeId } : {}}
              onClick={() => onOpenChange(false)}
              className="text-ink/45 hover:text-ink shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.97]"
            >
              Open full view
            </Link>
          </div>

          <ChatThread chat={chat} compact onNavigate={() => onOpenChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
