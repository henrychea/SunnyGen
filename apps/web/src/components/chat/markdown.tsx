import { cn } from '@sunnygen/ui'
import { type ReactNode } from 'react'

type Block =
  | { type: 'code'; language: string; content: string }
  | { type: 'heading'; level: number; content: string }
  | { type: 'list'; ordered: boolean; start: number; items: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'rule' }
  | { type: 'paragraph'; lines: string[] }

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const INLINE =
  /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g

function isBlockStart(line: string): boolean {
  return (
    line.startsWith('```') ||
    HEADING.test(line) ||
    RULE.test(line) ||
    /^\s*>/.test(line) ||
    LIST_ITEM.test(line)
  )
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^```([\w-]*)/)
    if (fence) {
      const content: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        content.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'code', language: fence[1] ?? '', content: content.join('\n') })
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]?.length ?? 1, content: heading[2] ?? '' })
      index += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index] ?? '')) {
        quote.push((lines[index] ?? '').replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', lines: quote })
      continue
    }

    const listItem = line.match(LIST_ITEM)
    if (listItem) {
      const ordered = Boolean(listItem[2])
      const start = Number(listItem[2] ?? 1)
      const items: string[] = []
      while (index < lines.length) {
        const match = (lines[index] ?? '').match(LIST_ITEM)
        if (!match) break
        items.push(match[3] ?? '')
        index += 1
      }
      blocks.push({ type: 'list', ordered, start, items })
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      if (!current.trim()) break
      if (paragraph.length > 0 && isBlockStart(current)) break
      paragraph.push(current)
      index += 1
    }
    blocks.push({ type: 'paragraph', lines: paragraph })
  }

  return blocks
}

function safeHref(value: string): string | null {
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value
  return null
}

function inline(source: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  INLINE.lastIndex = 0

  while ((match = INLINE.exec(source)) !== null) {
    if (match.index > cursor) nodes.push(source.slice(cursor, match.index))
    const token = match[0]
    const tokenKey = `${key}-${match.index}`

    if (token.startsWith('`')) {
      nodes.push(
        <code key={tokenKey} className="bg-ink/[0.06] rounded px-1 py-0.5 font-mono text-[12px]">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={tokenKey} className="text-ink font-semibold">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('~~')) {
      nodes.push(
        <del key={tokenKey} className="text-ink/65">
          {token.slice(2, -2)}
        </del>,
      )
    } else if (token.startsWith('[')) {
      const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      const href = link?.[2] ? safeHref(link[2]) : null
      nodes.push(
        href ? (
          <a
            key={tokenKey}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {link?.[1]}
          </a>
        ) : (
          token
        ),
      )
    } else {
      nodes.push(<em key={tokenKey}>{token.slice(1, -1)}</em>)
    }
    cursor = match.index + token.length
  }

  if (cursor < source.length) nodes.push(source.slice(cursor))
  if (nodes.length === 0) return [source]
  return nodes
}

function withBreaks(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const nodes = inline(line, `${key}-${index}`)
    return index === 0 ? nodes : [<br key={`${key}-br-${index}`} />, ...nodes]
  })
}

const HEADING_CLASS = [
  'text-[20px] font-semibold tracking-tight text-ink',
  'text-[18px] font-semibold tracking-tight text-ink',
  'text-[16px] font-semibold text-ink',
  'text-[14.5px] font-semibold text-ink',
  'text-[13.5px] font-semibold text-ink',
  'text-[12.5px] font-semibold text-ink/80',
]

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text)

  return (
    <div className={cn('min-w-0 text-[13.5px] leading-relaxed break-words', className)}>
      {blocks.map((block, index) => {
        const key = `block-${index}`
        if (block.type === 'code') {
          return (
            <pre
              key={key}
              className="bg-canvas border-line-strong mt-2 overflow-x-auto rounded-lg border p-2.5 text-[11.5px] leading-relaxed first:mt-0"
            >
              {block.language ? (
                <span className="text-ink/65 mb-1 block text-[11px] font-semibold">{block.language}</span>
              ) : null}
              <code className="font-mono whitespace-pre">{block.content}</code>
            </pre>
          )
        }

        if (block.type === 'heading') {
          return (
            <p
              key={key}
              className={cn(
                'mt-3 first:mt-0 mb-1',
                HEADING_CLASS[Math.min(block.level, 6) - 1] ?? HEADING_CLASS[5],
              )}
            >
              {inline(block.content, key)}
            </p>
          )
        }

        if (block.type === 'rule') {
          return <hr key={key} className="border-line/70 my-3" />
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="border-accent/35 text-ink/65 my-2 border-l-2 pl-3">
              {withBreaks(block.lines, key)}
            </blockquote>
          )
        }

        if (block.type === 'list') {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-item-${itemIndex}`} className="pl-1">
              {inline(item, `${key}-item-${itemIndex}`)}
            </li>
          ))
          return block.ordered ? (
            <ol key={key} start={block.start} className="my-1.5 list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={key} className="my-1.5 list-disc space-y-1 pl-5">
              {items}
            </ul>
          )
        }

        return (
          <p key={key} className="mt-2 first:mt-0">
            {withBreaks(block.lines, key)}
          </p>
        )
      })}
    </div>
  )
}
