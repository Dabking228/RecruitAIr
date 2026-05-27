'use client'

import { cn } from '@/lib/utils'

interface AgentMessageProps {
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

/**
 * Parses **bold** markers into <strong> tags.
 * Splits on double-newlines into paragraphs, single newlines into <br>.
 * No external library — handles exactly what the agent produces.
 */
function renderContent(text: string) {
  const paragraphs = text.split(/\n\n+/)

  return paragraphs.map((paragraph, pIndex) => {
    const lines = paragraph.split('\n')

    const renderedLines = lines.map((line, lIndex) => {
      // Split on **bold** markers
      const parts = line.split(/\*\*(.*?)\*\*/g)
      const renderedParts = parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="font-semibold">{part}</strong>
          : part
      )

      return (
        <span key={lIndex}>
          {renderedParts}
          {lIndex < lines.length - 1 && <br />}
        </span>
      )
    })

    return (
      <p key={pIndex} className={pIndex > 0 ? 'mt-2' : ''}>
        {renderedLines}
      </p>
    )
  })
}

/**
 * Formats a UTC ISO timestamp into a short local time string (e.g. "14:32").
 * Returns null if no timestamp is provided.
 */
function formatTime(createdAt?: string): string | null {
  if (!createdAt) return null
  try {
    return new Date(createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return null
  }
}

export function AgentMessage({ role, content, createdAt }: AgentMessageProps) {
  const isUser = role === 'user'
  const time = formatTime(createdAt)

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>

      {/* Assistant icon */}
      {!isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center mt-0.5">
          <span className="text-white text-xs">✦</span>
        </div>
      )}

      {/* Bubble + timestamp */}
      <div className={cn('flex flex-col gap-1 max-w-[82%]', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-gray-900 text-white rounded-tr-sm'
              : 'bg-gray-100 text-gray-900 rounded-tl-sm',
          )}
        >
          {renderContent(content)}
        </div>

        {time && (
          <span className="text-xs text-gray-400 px-1">{time}</span>
        )}
      </div>

    </div>
  )
}