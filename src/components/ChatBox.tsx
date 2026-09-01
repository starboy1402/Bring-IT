import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { DeliveryRequest, Message } from '../lib/requests'
import { listMessages, sendMessage } from '../lib/requests'
import { Card } from './Badges'

interface ChatBoxProps {
  request: DeliveryRequest
  names: Record<string, string>
  myProfileId: string
}

const CHAT_STATUSES: DeliveryRequest['status'][] = ['accepted', 'in_progress']

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>()
  for (const m of existing) map.set(m.id, m)
  for (const m of incoming) map.set(m.id, m)
  const merged = Array.from(map.values())
  merged.sort((a, b) => {
    if (a.created_at === b.created_at) {
      return a.id.localeCompare(b.id)
    }
    return a.created_at.localeCompare(b.created_at)
  })
  return merged
}

export default function ChatBox({ request, names, myProfileId }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  
  // Track cursors for backfill/polling
  const cursorRef = useRef<{ createdAt: string; id: string } | null>(null)

  const isChatActive = CHAT_STATUSES.includes(request.status)

  // A stable helper to fetch and merge
  const fetchAndMerge = useCallback(async (mounted: { current: boolean }) => {
    try {
      const newMsgs = await listMessages(request.id, cursorRef.current || undefined)
      if (!mounted.current) return
      if (newMsgs.length > 0) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, newMsgs)
          const last = merged[merged.length - 1]
          cursorRef.current = { createdAt: last.created_at, id: last.id }
          return merged
        })
      }
    } finally {
      if (mounted.current) {
        setLoading(false)
        // Scroll slightly delayed to ensure DOM updated
        setTimeout(() => bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' }), 0)
      }
    }
  }, [request.id])

  useEffect(() => {
    if (!isChatActive) return
    const mounted = { current: true }

    // Initial fetch
    void fetchAndMerge(mounted)

    let pollInterval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(() => {
          void fetchAndMerge(mounted)
        }, 15000)
      }
    }
    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    }

    let realtimeUnavailableTimeout: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel(`messages:request_id=eq.${request.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.request_id === request.id) {
            setMessages((prev) => {
              const merged = mergeMessages(prev, [newMsg])
              const last = merged[merged.length - 1]
              cursorRef.current = { createdAt: last.created_at, id: last.id }
              return merged
            })
            setTimeout(() => bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' }), 0)
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Re-fetch in case we missed events while connecting/reconnecting
          void fetchAndMerge(mounted)
          
          stopPolling()
          if (realtimeUnavailableTimeout) {
            clearTimeout(realtimeUnavailableTimeout)
            realtimeUnavailableTimeout = null
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          // Fallback to polling after 15s of unavailability
          if (!realtimeUnavailableTimeout) {
            realtimeUnavailableTimeout = setTimeout(() => {
              startPolling()
            }, 15000)
          }
        }
      })

    return () => {
      mounted.current = false
      stopPolling()
      if (realtimeUnavailableTimeout) clearTimeout(realtimeUnavailableTimeout)
      supabase.removeChannel(channel)
    }
  }, [request.id, isChatActive, fetchAndMerge])

  async function handleSend() {
    if (!content.trim() || sending) return
    setSending(true)
    try {
      const res = await sendMessage(request.id, content.trim())
      if (res.ok) {
        setContent('')
      }
    } finally {
      setSending(false)
    }
  }

  if (!isChatActive) return null

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-900">Chat</h2>
      <div className="h-48 space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-slate-500">Loading messages…</p>}
        {messages.map((msg) => {
          const isMine = msg.sender_id === myProfileId
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'self-end' : ''}`}
            >
              <span className="text-xs font-medium text-slate-600">
                {names[msg.sender_id] ?? 'Someone'}
              </span>
              <p className="text-sm text-slate-800">{msg.content}</p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </Card>
  )
}