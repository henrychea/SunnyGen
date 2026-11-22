import { useEffect } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ASSISTANT_MODELS } from '@sunnygen/core'
import { Button, Selector, motionFade } from '@sunnygen/ui'
import { MessageSquarePlus, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import { ChatThread } from '~/components/chat/chat-thread'
import { SessionRail } from '~/components/chat/session-rail'
import { useAssistantChat } from '~/components/chat/use-assistant-chat'
import { formatRelativeDate } from '~/lib/format'
import { rememberAssistantSession } from '~/lib/assistant-context'

type ChatSearch = {
  id?: string
}

export const Route = createFileRoute('/chat')({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    id: typeof search.id === 'string' && search.id.trim() ? search.id : undefined,
  }),
  component: ChatPage,
})

function ChatPage() {
  const { id } = Route.useSearch()
  const router = useRouter()

  const chat = useAssistantChat({
    activeId: id ?? null,
    onActiveIdChange: (next, options) => {
      if ((next ?? null) === (id ?? null)) return
      void router.navigate({
        to: '/chat',
        search: next ? { id: next } : {},
        replace: options?.replace ?? false,
        viewTransition: false,
      })
    },
  })

  useEffect(() => {
    rememberAssistantSession(id ?? null)
  }, [id])

  const currentModel = ASSISTANT_MODELS.find((entry) => entry.id === chat.model)?.label ?? chat.model
  const sessionOptions = [
    { key: '', label: 'New chat', description: 'Start a fresh conversation' },
    ...(id && !chat.sessions.some((session) => session.id === id)
      ? [{ key: id, label: chat.title, description: 'Current chat' }]
      : []),
    ...chat.sessions.map((session) => ({
      key: session.id,
      label: session.title,
      description: formatRelativeDate(session.updatedAt),
    })),
  ]

  return (
    <div className="flex h-full min-h-0 min-w-0">
      <SessionRail
        sessions={chat.sessions}
        activeId={id}
        loading={chat.sessionsLoading}
        onSelect={chat.selectSession}
        onNew={chat.newChat}
        onDelete={(sessionId) => void chat.removeSession(sessionId)}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-line/70 flex shrink-0 items-center gap-2 border-b px-3 py-2.5 md:px-6 md:py-3">
          <div className="min-w-0 flex-1 md:hidden">
            <Selector
              value={id ?? ''}
              options={sessionOptions}
              onChange={(option) => {
                if (option.key) chat.selectSession(option.key)
                else chat.newChat()
              }}
              ariaLabel="Chat sessions"
              size="sm"
              searchable
              searchPlaceholder="Search chats"
              menuMinWidth={240}
              showTriggerDescription={false}
            />
          </div>

          <p className="font-display hidden min-w-0 flex-1 truncate text-[14.5px] font-semibold tracking-tight md:block">
            <motion.span
              key={id ? chat.title : 'assistant'}
              variants={motionFade}
              initial="hidden"
              animate="visible"
              className="inline-block max-w-full truncate align-bottom"
            >
              {id ? chat.title : 'Assistant'}
            </motion.span>
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            {id ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void chat.removeSession(id)}
                aria-label="Delete chat"
                title="Delete chat"
              >
                <Trash2 size={14} />
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={chat.newChat} className="md:hidden">
              <MessageSquarePlus size={13} /> New
            </Button>
            {id ? (
              <span className="bg-ink/[0.05] text-ink/45 hidden rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:inline">
                <motion.span
                  key={chat.model}
                  variants={motionFade}
                  initial="hidden"
                  animate="visible"
                  className="inline-block"
                >
                  {currentModel}
                </motion.span>
              </span>
            ) : null}
          </div>
        </header>

        <ChatThread chat={chat} />
      </section>
    </div>
  )
}
